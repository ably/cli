#!/bin/bash

# Set up history to completely disable it at first
unset HISTFILE
export HISTSIZE=0
export HISTFILESIZE=0
export HISTCONTROL=ignoreboth:erasedups
history -c

# Validate required environment variables
if [[ -z "$ABLY_API_KEY" ]]; then
  echo -e "\033[31mError: ABLY_API_KEY environment variable is not set.\033[0m"
  echo "The ABLY_API_KEY must be provided in the format [APP_ID].[KEY_ID]:[KEY_SECRET]."
  exit 1
fi

# Validate API key format
if ! [[ "$ABLY_API_KEY" =~ ^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$ ]]; then
  echo -e "\033[31mError: Invalid ABLY_API_KEY format.\033[0m"
  echo "The ABLY_API_KEY must be provided in the format [APP_ID].[KEY_ID]:[KEY_SECRET]."
  exit 1
fi

if [[ -z "$ABLY_ACCESS_TOKEN" ]]; then
  echo -e "\033[31mError: ABLY_ACCESS_TOKEN environment variable is not set.\033[0m"
  exit 1
fi

# Set critical environment variables for proper UTF-8 handling and terminal behavior
export TERM=${TERM:-xterm-256color}
export LANG=${LANG:-en_US.UTF-8}
export LC_ALL=${LC_ALL:-en_US.UTF-8}
export LC_CTYPE=${LC_CTYPE:-en_US.UTF-8}
export CLICOLOR=${CLICOLOR:-1}

# Essential path setup
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/node_modules/.bin:$PATH

# Force simple prompt, overriding any inherited value
export PS1='$ '

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

# Function to handle interrupt signals
handle_interrupt() {
  interrupted=1 # Set the flag
  # Print message on a new line
  printf "\n${YELLOW}Signal received. To exit this shell, type 'exit' and press Enter.${RESET}\n"

  # Show the prompt immediately
  printf "${GREEN}$ ${RESET}"

  # Reset readline and terminal state
  # Send an empty readline command to reset input state
  # We don't use true since we want to reset terminal state
  read -t 0.001 -n 1 >/dev/null 2>&1 || true
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

# Redraw prompt on window resize (SIGWINCH)
trap 'show_robust_prompt' SIGWINCH

# -- Interactive Restricted Shell starts here --

# Clear screen to start with a clean terminal
printf '\033[2J\033[H'

# Print welcome message using ably CLI's built-in help
ably help web-cli

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

# Read commands in a loop with proper handling
while true; do
    # Skip showing prompt if we've just processed an interrupt
    # (since the interrupt handler already showed one)
    if [ "$interrupted" -eq 0 ]; then
        # Show the robust double prompt for terminal compatibility
        show_robust_prompt
    fi

    # Reset interrupted flag AFTER checking it for prompt display,
    # but BEFORE reading the command so we're ready for the next interrupt
    interrupted=0

    # Read the command line with bash's readline support
    if [ ${#HISTORY_ARRAY[@]} -gt 0 ]; then
        # Add our clean history items to the readline history
        history -c
        for item in "${HISTORY_ARRAY[@]}"; do
            history -s "$item"
        done
    fi

    # Handle terminal input
    read -e full_command
    read_status=$?

    # Clear readline history immediately to prevent contamination
    history -c

    # Check for EOF (Ctrl+D)
    if [ $read_status -ne 0 ]; then
        printf "\nExiting Ably CLI shell.\n"
        break
    fi

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

            # Store in our custom history array
            FULL_CMD="ably $rest_of_line"
            # Add to front of array (newest first)
            HISTORY_ARRAY=("$FULL_CMD" "${HISTORY_ARRAY[@]}")
            # Keep array size manageable
            if [ ${#HISTORY_ARRAY[@]} -gt 100 ]; then
                # Remove oldest entry
                unset 'HISTORY_ARRAY[${#HISTORY_ARRAY[@]}-1]'
            fi

            # Execute the ably command without eval - much safer!
            if [ -n "$rest_of_line" ]; then
                # Split the rest of the line into an array to safely pass arguments
                args=()
                for arg in $rest_of_line; do
                    args+=("$arg")
                done
                # Run ably with the array of arguments directly, not through shell evaluation
                ably "${args[@]}"
            else
                ably
            fi
            ;;
        exit)
            # Exit the shell
            printf "Exiting Ably CLI shell.\n"
            break
            ;;
        "")
            # Handle empty input (just pressing Enter)
            ;;
        *)
            # Show a clear error for invalid commands
            printf "${RED}Error: Only commands \"ably\" and \"exit\" are allowed.${RESET}\n"
            ;;
    esac
done

# Clean up
history -c
