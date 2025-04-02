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

# Remove the argument handling logic - exec starts this script directly
# if [ $# -gt 0 ]; then ... fi

# -- Interactive Restricted Shell starts here --

# Clear screen to start with a clean terminal 
printf '\033[2J\033[H'

# Verify locale settings within the script
# Removed: locale check was here

# Print welcome message
printf "Welcome to the Ably Web CLI shell.\n\n"
printf "Usage: $ ably [command] [options]\n"
printf "View supported commands: $ ably\n\n"

# Define colors for prompt
GREEN='\033[32m'
RESET='\033[0m'

# Read commands in a loop with proper handling
while true; do
    # Show the prompt without newline - Force '$ ' directly, now with color
    # Use echo -ne to interpret ANSI escapes
    echo -ne "${GREEN}$ ${RESET}"
    
    # Read the command line with proper argument handling
    read -r cmd rest_of_line
    
    # Trim leading/trailing whitespace from cmd
    cmd=$(printf '%s' "$cmd" | sed 's/^ *//;s/ *$//')
    
    case "$cmd" in
        ably)
            # Execute the ably command with all arguments exactly as provided
            if [ -n "$rest_of_line" ]; then
                # Use 'eval' here to correctly handle quotes and arguments within the interactive loop
                eval "ably $rest_of_line"
            else
                # Just run ably with no arguments
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
            printf '\033[31mError: Only commands "ably" and "exit" are allowed.\033[0m\n'
            ;;
    esac
done 