#!/bin/sh

# Set critical environment variables for proper UTF-8 handling and terminal behavior
# These should ideally be inherited from the 'exec' Env, but setting them here ensures robustness.
export TERM=${TERM:-xterm-256color}
export LANG=${LANG:-en_US.UTF-8}
export LC_ALL=${LC_ALL:-en_US.UTF-8} 
export LC_CTYPE=${LC_CTYPE:-en_US.UTF-8}
export CLICOLOR=${CLICOLOR:-1}

# Essential path setup
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:/usr/local/lib/node_modules/.bin:$PATH

# Force simple prompt, overriding any inherited value
# Note: We will bypass this later in the loop for robustness
export PS1='$ '

# Define colors for prompt and messages
GREEN='\033[32m'
RESET='\033[0m'
YELLOW='\033[33m'

# Flag to indicate if read was interrupted by our trap
interrupted=0

# Function to handle interrupt signals
handle_interrupt() {
  interrupted=1 # Set the flag
  # Print message on a new line
  printf "\n${YELLOW}Signal received. To exit this shell, type 'exit' and press Enter.${RESET}\n"
  # No need to redraw prompt here, the loop will handle it after continuing
}

# Trap common interrupt signals (Ctrl+C, Ctrl+Z, Ctrl+\)
trap 'handle_interrupt' SIGINT SIGTSTP SIGQUIT

# -- Interactive Restricted Shell starts here --

# Clear screen to start with a clean terminal 
printf '\033[2J\033[H'

# Verify locale settings within the script
# Removed: locale check was here

# Print welcome message
printf "Welcome to the Ably Web CLI shell.\n\n"
printf "Usage: $ ably [command] [options]\n"
printf "View supported commands: $ ably\n\n"

# Read commands in a loop with proper handling
while true; do
    interrupted=0 # Reset flag at the start of each loop iteration
    # Show the prompt without newline
    echo -ne "${GREEN}$ ${RESET}"
    
    # Read the command line
    read -r cmd rest_of_line
    read_exit_status=$? # Capture exit status immediately

    # Check if the read was interrupted by our signal trap
    if [ "$interrupted" -eq 1 ]; then
        continue # Trap handled it, loop again for fresh input
    fi

    # If read failed AND it wasn't due to our trap, assume EOF or other error
    if [ $read_exit_status -ne 0 ]; then
        printf "\nExiting Ably CLI shell.\n" # Handle Ctrl+D (EOF) or read errors
        break
    fi
    
    # Trim leading/trailing whitespace from cmd
    cmd=$(printf '%s' "$cmd" | sed 's/^ *//;s/ *$//')
    
    case "$cmd" in
        ably)
            # Disable trap before running the command
            trap '' SIGINT SIGTSTP SIGQUIT
            # Execute the ably command with all arguments exactly as provided
            if [ -n "$rest_of_line" ]; then
                eval "ably $rest_of_line"
            else
                ably
            fi
            # Re-enable trap after command finishes
            trap 'handle_interrupt' SIGINT SIGTSTP SIGQUIT
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
            printf '\033[31mError: Only commands "ably" and "exit" are allowed.\033[0m\n'
            ;;
    esac
done 