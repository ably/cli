# Manual Test Instructions for setRawMode EIO Error

## Prerequisites
1. Open a real terminal (not through a script or IDE terminal)
2. Navigate to the project directory

## Test 1: Direct Execution with Diagnostics

```bash
# Enable diagnostics
export TERMINAL_DIAGNOSTICS=1
export DEBUG_SIGINT=1

# Run interactive mode directly
node bin/run.js interactive

# When you see the prompt:
# 1. Type: test:wait --duration 10
# 2. Press Ctrl+C while it's waiting
# 3. Note any error messages
```

## Test 2: Wrapper Script Test

```bash
# Keep diagnostics enabled
export TERMINAL_DIAGNOSTICS=1
export DEBUG_SIGINT=1

# Run with wrapper
bin/ably-interactive

# When you see the prompt:
# 1. Type: test:wait --duration 10  
# 2. Press Ctrl+C while it's waiting
# 3. Watch for "setRawMode EIO" error when wrapper tries to restart
```

## Test 3: Check Terminal State

After the error occurs, check if the terminal is corrupted:

```bash
# Try to run a simple command that uses raw mode
node -e "process.stdin.setRawMode(true); console.log('OK'); process.stdin.setRawMode(false);"

# Check terminal settings
stty -a
```

## Test 4: Process Check

While the error is happening, in another terminal:

```bash
# Check what processes are using the terminal
lsof /dev/tty

# Check process tree
ps aux | grep ably
```

## Information to Collect

1. **Exact error message** - Copy the full stack trace
2. **Diagnostic logs** - Check `/tmp/ably-terminal-diag-*.json`
3. **Terminal state** - Output of `stty -a` before and after
4. **Process info** - What processes are running
5. **Timing** - Does the error happen immediately or after a delay?

## Additional Debug Commands

```bash
# Clean up any stale processes
pkill -f "ably-interactive"

# Reset terminal if corrupted
reset

# Check Node.js version
node --version

# Check terminal type
echo $TERM
```

Please run these tests and share:
1. The exact error output
2. The diagnostic JSON files
3. Any patterns you notice about when the error occurs vs when it doesn't