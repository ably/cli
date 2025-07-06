# Ably CLI Exit Codes

This document describes the exit codes used by the Ably CLI, particularly in interactive mode.

## Exit Codes

### 0 - Success
- Normal successful completion of a command
- Clean exit after user types `exit` command (in non-wrapper mode)

### 42 - User Exit (Interactive Mode)
- Special exit code used when user types `exit` in interactive mode with wrapper
- Signals to the wrapper script (`bin/ably-interactive`) to terminate the loop
- Defined as `Interactive.EXIT_CODE_USER_EXIT`

### 130 - SIGINT (Ctrl+C)
- Standard Unix exit code for SIGINT (128 + 2)
- Used when:
  - Double Ctrl+C (force quit) in interactive mode
  - Single Ctrl+C in non-interactive mode
  - Any SIGINT that causes process termination

### 143 - SIGTERM
- Standard Unix exit code for SIGTERM (128 + 15)
- Used when process receives SIGTERM signal

### 1 - General Error
- Generic error exit code
- Used for initialization failures or unexpected errors

## Interactive Mode Behavior

### Single Ctrl+C
- **At empty prompt**: Shows "^C" and message about typing 'exit' to quit
- **During command execution**: Interrupts the command and returns to prompt
- **With partial command typed**: Clears the line and returns to prompt

### Double Ctrl+C (within 500ms)
- **Force quit**: Immediately exits with code 130
- Shows "⚠ Force quit" message
- Bypasses normal cleanup

## Wrapper Script Behavior

The `bin/ably-interactive` wrapper script uses these exit codes to determine whether to restart the interactive shell:

- **Exit code 42**: User typed 'exit' - terminate the wrapper loop
- **Exit code 130**: SIGINT - restart the shell (unless double Ctrl+C)
- **Exit code 0**: Normal exit - terminate the wrapper loop
- **Other codes**: Show error message and restart after delay

## Implementation Details

Exit codes are handled in:
- `src/commands/interactive.ts`: Sets exit code 42 for user exit
- `src/utils/sigint-exit.ts`: Handles SIGINT behavior and exit code 130
- `bin/ably-interactive`: Wrapper script that interprets exit codes