# Manual Test Instructions for Interactive Mode

## Overview
This document provides manual test cases for the new interactive mode implementation using the bash wrapper approach.

## Prerequisites
1. Build the project: `npm run build`
2. Ensure you have a valid Ably account configured

## Test Cases

### 1. Basic Interactive Mode (Without Wrapper)

```bash
# Start interactive mode directly
./bin/run.js interactive
```

**Expected behavior:**
- Welcome message appears
- `$ ` prompt is shown
- Commands execute inline
- Ctrl+C shows yellow warning message
- Type `exit` to quit

### 2. Interactive Mode with Bash Wrapper

```bash
# Start with wrapper for seamless Ctrl+C handling
./bin/ably-interactive
```

**Expected behavior:**
- Welcome message appears on first run only
- `$ ` prompt is shown
- Commands execute inline
- Ctrl+C during command execution:
  - Interrupts the command
  - CLI automatically restarts
  - No welcome message on restart
  - New prompt appears immediately
- Type `exit` to quit completely

### 3. Long-Running Command Interruption

```bash
# In wrapper mode
./bin/ably-interactive

# At prompt, run a long command
$ channels subscribe test-channel --duration 30
```

**Expected behavior:**
- Command starts running
- Press Ctrl+C
- Command is interrupted
- Shell automatically restarts
- New prompt appears without welcome message

### 4. Interactive Prompts

```bash
# In wrapper mode
./bin/ably-interactive

# Run a command that requires confirmation
$ apps create test-app
```

**Expected behavior:**
- Command prompts for confirmation (Y/N)
- Typing Y or N works correctly
- Prompt response is processed by the command

### 5. Command History

```bash
# Run several commands
./bin/ably-interactive
$ help
$ version
$ apps list
$ exit

# Start again
./bin/ably-interactive
```

**Expected behavior:**
- Press up arrow
- Previous commands appear in reverse order
- History persists across sessions
- Check `~/.ably/history` file exists

### 6. Exit Code Testing

```bash
# Test normal exit
./bin/ably-interactive
$ exit
echo $?  # Should be 0

# Test wrapper mode exit
ABLY_WRAPPER_MODE=1 ./bin/run.js interactive
$ exit
echo $?  # Should be 42
```

### 7. Error Handling

```bash
./bin/ably-interactive

# Try invalid commands
$ invalid-command
$ apps invalid-subcommand
```

**Expected behavior:**
- Error messages appear
- Shell continues running
- New prompt appears

### 8. Rapid Ctrl+C Testing

```bash
./bin/ably-interactive

# Press Ctrl+C multiple times rapidly at the prompt
```

**Expected behavior:**
- Multiple yellow warning messages may appear
- Shell remains stable
- No crashes or unexpected exits

### 9. Environment Variable Testing

```bash
# Test with custom history file
ABLY_HISTORY_FILE=/tmp/test-history ./bin/ably-interactive
$ test command
$ exit

# Verify custom history location
cat /tmp/test-history
```

### 10. Cross-Platform Testing

If testing on different platforms:

**macOS/Linux:**
- Bash wrapper should work normally
- All features functional

**Windows (Git Bash/WSL):**
- Bash wrapper should work in Git Bash or WSL
- Note: Native Windows Command Prompt won't support bash wrapper

## Verification Checklist

- [ ] Interactive mode starts successfully
- [ ] Commands execute without spawn overhead
- [ ] Ctrl+C interrupts long-running commands
- [ ] Shell restarts seamlessly after Ctrl+C
- [ ] Interactive prompts (Y/N) work correctly
- [ ] Command history persists in `~/.ably/history`
- [ ] Exit command works with correct exit codes
- [ ] Error handling doesn't crash the shell
- [ ] Welcome message only shows on first run

## Known Limitations

1. Ctrl+C at the prompt shows a warning instead of clearing the line
2. In direct mode (without wrapper), Ctrl+C exits the shell during command execution
3. Bash wrapper requires bash shell (won't work in pure Windows CMD)

## Troubleshooting

If the wrapper doesn't restart after Ctrl+C:
1. Check the exit code: `echo $?`
2. Ensure you're using the wrapper script, not direct mode
3. Check for any error messages before the shell exits