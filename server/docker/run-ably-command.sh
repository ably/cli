#!/bin/bash
# run-ably-command.sh - Helper script to run ably commands directly
# Usage: run-ably-command.sh [ably arguments...]

# If no arguments provided, just start the shell
if [ $# -eq 0 ]; then
  exec /scripts/restricted-shell.sh
fi

# Special case: if first arg is /bin/bash, this is likely a test command
# Pass it directly to bash to avoid restricted shell filtering
if [ "$1" = "/bin/bash" ]; then
  exec "$@"
fi

# Special case: if first arg is curl, execute it directly
if [ "$1" = "curl" ]; then
  exec "$@"
fi

# Execute the ably command directly by passing to restricted shell
exec /scripts/restricted-shell.sh ably "$@"
