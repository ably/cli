#!/bin/bash

# Check if running in test-only mode
if [ "$1" == "--test-only" ]; then
    echo "[restricted-shell.sh] Test mode: Permissions seem ok."
    exit 0
fi

# Set up history to completely disable it at first
unset HISTFILE
export HISTSIZE=0
export HISTFILESIZE=0
export HISTCONTROL=ignoreboth:erasedups
history -c

# Set critical environment variables for proper UTF-8 handling and terminal behavior
export TERM=${TERM:-xterm-256color}
export LANG=${LANG:-en_US.UTF-8}
export LC_ALL=${LC_ALL:-en_US.UTF-8}
export LC_CTYPE=${LC_CTYPE:-en_US.UTF-8}
export CLICOLOR=${CLICOLOR:-1}

# Essential path setup
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/node_modules/.bin:$PATH

# Use the same colour-coded prompt for any subshells spawned interactively.
# We wrap the non-printing ANSI colour sequences in \[ ... \] so Bash knows
# their length is zero when doing line-editing.  This *only* affects PS1; our
# custom readline loop uses a different escape (\001/\002) – see PROMPT below.
export PS1='\[\e[32m\]\$\[\e[0m\] '

# Ensure .ably directory exists with proper permissions
# This prevents race conditions when multiple processes try to create it
mkdir -p ~/.ably

# Define colors for prompt and messages
GREEN='\033[32m'
RESET='\033[0m'
YELLOW='\033[33m'
RED='\033[31m'

# Flag to indicate if read was interrupted by our trap
interrupted=0

# --- Script Initialization ---
# Check if this is the first run or a restart after Ctrl+C
if [[ -z "$RESTRICTED_SHELL_RESTARTED" ]]; then
  # First run: Clear screen, show welcome message
  printf '\033[2J\033[H'
  ably help web-cli
  # Set flag so restarts skip the welcome
  export RESTRICTED_SHELL_RESTARTED=true
else
  # This is a restart after Ctrl+C
  : # Add placeholder null command
fi

# Function to handle interrupt signals
handle_interrupt() {
  # Show informative message.
  printf "\n${YELLOW}Signal received. To exit this shell, type 'exit' and press Enter.${RESET}\n"
 
  # Restart the entire script to ensure a clean state and prompt
  exec "$0"
}

# Special double prompt for xterm.js compatibility
# This creates a robust prompt display that works around race conditions
show_robust_prompt() {
  # Using sleep for up to 0.1 seconds to ensure terminal rendering catches up
  sleep 0.1
  # Reset cursor position, clear line, set prompt
  printf "\033[G\033[K"
  # First prompt - sets the color and displays $ prompt
  printf "${GREEN}$ ${RESET}"
  # Small delay to ensure the first prompt is registered
  sleep 0.05
  # Move cursor back to start of line to "refresh" the prompt
  printf "\033[G"
  # Redisplay the prompt to ensure it's visible
  printf "${GREEN}$ ${RESET}"
}

# Trap common interrupt signals (Ctrl+C, Ctrl+Z, Ctrl+\)
trap 'handle_interrupt' SIGINT SIGTSTP SIGQUIT

# The prompt is now rendered by readline itself; no extra redraw needed on
# window resize.
# trap 'show_robust_prompt' SIGWINCH

# -- Interactive Restricted Shell starts here --

# Enable bash completion if available
if [ -f /etc/bash_completion ]; then
  . /etc/bash_completion
fi

# Now that we're ready to accept user input, set up a clean history environment
export HISTSIZE=1000
export HISTFILE=$(mktemp -u)
history -c

# Custom array to store valid command history
HISTORY_ARRAY=()

# Use stty to ensure echo is on and signals are handled properly
stty echo
stty intr '^C'

# Function to check for shell injection attempts
check_injection() {
  local input="$1"
  # Check for common shell operators and injection patterns
  # Use grep instead of bash regex for better compatibility with Alpine
  if echo "$input" | grep -q '[&|;><$()`]'; then
    return 1
  fi
  return 0
}

# --- Credential validation ---
# The Ably CLI requires an **API key** for data-plane operations. A Control-API
# **Access Token** is optional and only needed for commands that interact with the
# Control plane (e.g. accounts, apps, keys).  Anonymous access is **not**
# supported in the production terminal.

# Helper to check API key format only when variable is non-empty
validate_api_key() {
  local key="$1"
  if ! [[ "$key" =~ ^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$ ]]; then
    echo -e "\033[31mError: Invalid ABLY_API_KEY format.\033[0m"
    echo "The ABLY_API_KEY must be provided in the format [APP_ID].[KEY_ID]:[KEY_SECRET]."
    exit 1
  fi
}

# 1. API key missing → hard error
if [[ -z "$ABLY_API_KEY" ]]; then
  echo -e "\033[31mError: ABLY_API_KEY is not set.\033[0m"
  echo "An Ably API key is required for the web terminal."
  exit 1
fi

# 2. Validate API key format
validate_api_key "$ABLY_API_KEY"

# 3. Access token missing → just warn; some Control-API commands will fail without it
if [[ -z "$ABLY_ACCESS_TOKEN" ]]; then
  echo -e "\033[33mWarning: ABLY_ACCESS_TOKEN is not set; Control-API commands may fail unless you provide one.\033[0m"
fi

# Define a readline-aware, colour-coded prompt for the `read -p` call.  For
# Readline we need to use \001 and \002 to delimit non-printing sequences.
# Using $'' ensures the escape characters are interpreted correctly.
PROMPT=$'\001\e[32m\002$ \001\e[0m\002'

# Read commands in a loop with proper handling
while true; do
    # Reset interrupted flag before reading input so we're ready for the next interrupt
    interrupted=0

    # Populate the interactive history for readline from our sanitized array
    if [ ${#HISTORY_ARRAY[@]} -gt 0 ]; then
        history -c
        # Iterate in the natural chronological order so that the most recent
        # command is *last* – this means the first <Up> arrow brings back the
        # most recent command the user executed, matching normal shell
        # behaviour.
        for item in "${HISTORY_ARRAY[@]}"; do
            history -s "$item"
        done
    fi

    # Read user input using Bash's built-in PS1 prompt and readline support
    # Ctrl+C is handled entirely by the trap, which execs a new shell.
    # Read only fails (non-zero status) on EOF (Ctrl+D).
    if ! read -e -r -p "${PS1@P}" full_command; then
        printf "\nExiting Ably CLI shell.\n"
        break
    fi

    # If the user just pressed Enter, loop again.
    if [[ -z "$full_command" ]]; then
        continue
    fi

    # Re-enable history clearing after read returns.
    history -c

    # Parse the command (first word) and arguments (rest)
    read -r cmd rest_of_line <<< "$full_command"

    # Trim leading/trailing whitespace from cmd
    cmd=$(printf '%s' "$cmd" | sed 's/^ *//;s/ *$//')

    case "$cmd" in
        ably)
            # Check for shell injection in the rest of the line
            if ! check_injection "$rest_of_line"; then
                printf "${RED}Error: Invalid characters detected. Shell operators like &, |, ;, $, (, ), >, < are not allowed.${RESET}\n"
                continue
            fi

            # Add the validated command to Bash's history
            # Add to history *before* execution
            history -s "$full_command"

            # Preserve quoted segments so that, for example, arguments like
            #   ably help ask "what is ably?"
            # are forwarded **with** the quotes respected. The previous
            # implementation used a simple IFS split which broke quoted
            # arguments (they were split into multiple words). We now rely on
            # bash's own parser via `eval set --` which honours standard shell
            # quoting rules *after* we have already validated that the input
            # contains no dangerous shell metacharacters via `check_injection`.

            if [ -n "$rest_of_line" ]; then
                # shellcheck disable=SC2086  # we want word-splitting performed by `set --`
                eval set -- $rest_of_line
                ably "$@"
            else
                ably
            fi
            ;;
        exit)
            # Exit the shell
            printf "Exiting Ably CLI shell.\n"
            break
            ;;
        clear)
            # Clear the screen – users expect this in a terminal.
            # Ignore any arguments to avoid injection risk.
            if [ -n "$rest_of_line" ]; then
                printf "${RED}Error: 'clear' takes no arguments.${RESET}\n"
            else
                clear
            fi
            ;;
        "")
            # Handle empty input (just pressing Enter)
            ;;
        *)
            # Show a clear error for invalid commands
            printf "${RED}Error: Only commands \"ably\", \"clear\" and \"exit\" are allowed.${RESET}\n"
            ;;
    esac
done

# Clean up
history -c
