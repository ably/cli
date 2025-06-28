# SIGINT Handling Research for Node.js REPL with Child Processes

## Executive Summary

This document analyzes different approaches for handling Ctrl+C (SIGINT) in a Node.js REPL that spawns child processes, where we need:
1. Ctrl+C to interrupt long-running child processes
2. Interactive prompts (Y/N) in child processes to work properly

The core issue is that readline in terminal mode intercepts SIGINT, preventing it from reaching our handlers when readline is paused.

## Approaches Analyzed

### 1. Using `terminal: false` in readline

**How it works:**
- Disables readline's built-in SIGINT handling
- Allows process-level SIGINT handlers to receive signals directly

**Implementation:**
```javascript
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '$ ',
  terminal: false  // Disables readline's SIGINT handling
});

process.on('SIGINT', () => {
  if (commandRunning && currentProcess) {
    currentProcess.kill('SIGINT');
  } else {
    console.log('^C');
    rl.prompt();
  }
});
```

**Pros:**
- ✅ SIGINT reaches process handlers even when readline is paused
- ✅ Simple implementation
- ✅ No additional dependencies

**Cons:**
- ❌ Loses terminal features (arrow keys, line editing)
- ❌ Poor user experience for REPL
- ❌ Not suitable for production

**Verdict:** Not recommended due to loss of essential terminal features.

### 2. Using node-pty (Pseudo-Terminal)

**How it works:**
- Creates a pseudo-terminal that acts as an intermediary
- Provides full terminal emulation with proper signal handling

**Implementation:**
```javascript
import * as pty from 'node-pty';

const ptyProcess = pty.spawn(shell, [], {
  name: 'xterm-color',
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env
});

ptyProcess.on('data', (data) => {
  process.stdout.write(data);
});

process.stdin.on('data', (data) => {
  ptyProcess.write(data);
});
```

**Pros:**
- ✅ Full terminal emulation
- ✅ Proper signal propagation
- ✅ Works with all interactive programs
- ✅ Used by VS Code, Hyper, and other terminal emulators

**Cons:**
- ❌ Additional dependency (native bindings)
- ❌ More complex implementation
- ❌ Platform-specific code (Windows vs Unix)
- ❌ May have issues with process.on('exit') handlers

**Verdict:** Best solution for full terminal compatibility but adds complexity.

### 3. Temporarily Switching Readline Modes

**How it works:**
- Use terminal mode at prompt for editing features
- Switch to non-terminal mode during command execution
- Restore terminal mode after command completes

**Implementation:**
```javascript
// At prompt
rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
});

// During command execution
rl.close();
rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// After command
rl.close();
// Recreate with terminal: true
```

**Pros:**
- ✅ Best of both worlds in theory
- ✅ No additional dependencies

**Cons:**
- ❌ Complex state management
- ❌ May cause terminal state issues
- ❌ Potential race conditions
- ❌ Not well-tested approach

**Verdict:** Theoretically sound but practically risky.

### 4. Process Groups and Signal Forwarding

**How it works:**
- Create child processes in separate process groups
- Manually forward signals to child process groups
- Use wrapper scripts to control signal handling

**Current Implementation (run-no-sigint.js):**
```javascript
// Override process.on to block SIGINT registration
process.on = function(event, listener) {
  if (event === 'SIGINT') {
    return process; // Block registration
  }
  return originalOn(event, listener);
};
```

**Pros:**
- ✅ Currently working for Ctrl+C interruption
- ✅ No additional dependencies
- ✅ Maintains terminal features

**Cons:**
- ❌ Breaks interactive prompts (Y/N confirmations)
- ❌ Hacky approach modifying process methods
- ❌ May have unintended side effects

**Verdict:** Current workaround but not ideal due to prompt issues.

### 5. Raw Mode with Manual Echo

**How it works:**
- Use raw mode to capture all keystrokes
- Manually handle echo and line editing
- Detect Ctrl+C (ASCII 3) directly

**Implementation:**
```javascript
if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  
  process.stdin.on('data', (data) => {
    if (data[0] === 3) { // Ctrl+C
      if (currentProcess) {
        currentProcess.kill('SIGINT');
      }
    }
  });
}
```

**Pros:**
- ✅ Complete control over input handling
- ✅ Can detect Ctrl+C immediately

**Cons:**
- ❌ Must implement own line editing
- ❌ Breaks terminal echo for prompts
- ❌ Complex implementation
- ❌ Poor user experience

**Verdict:** Too low-level for practical use.

## How Other REPLs Handle This

### Node.js Built-in REPL
- Uses `breakEvalOnSigint` option for breaking infinite loops
- Cannot be used with custom eval functions
- Handles SIGINT at the VM level during code evaluation

### Vorpal
- Built on top of Inquirer.js
- Has known issues with SIGINT propagation
- Inquirer captures SIGINT and doesn't propagate to parent process

### Popular Terminal Emulators
- VS Code Terminal: Uses node-pty
- Hyper: Uses node-pty
- Terminal.app/iTerm2: Native PTY handling

## Recommended Solutions

### 1. **Production-Ready: Accept Current Limitations**
Keep the current implementation with clear documentation:
- Ctrl+C works at prompt
- Ctrl+C during commands requires waiting for completion
- All interactive features work perfectly

**Rationale:** This is a reasonable trade-off that many CLIs accept.

### 2. **Enhanced: Hybrid Approach**
Implement a hybrid solution:
```javascript
// For non-interactive commands: Use current approach
// For commands known to be long-running: Use raw mode temporarily
// For interactive commands: Use current approach

if (isLongRunningCommand(command)) {
  // Temporarily enable raw mode for Ctrl+C detection
  setupRawModeHandler();
}
```

### 3. **Full Solution: node-pty**
For complete terminal emulation:
```javascript
import * as pty from 'node-pty';

class InteractivePtyRepl {
  private pty: IPty;
  
  async run() {
    this.pty = pty.spawn(process.execPath, [binPath, ...args], {
      name: 'xterm-256color',
      cols: process.stdout.columns,
      rows: process.stdout.rows,
      cwd: process.cwd(),
      env: process.env
    });
    
    // Bidirectional piping
    process.stdin.pipe(this.pty);
    this.pty.pipe(process.stdout);
  }
}
```

## Platform Considerations

### Linux/macOS
- SIGINT propagation works as expected
- Process groups behave predictably
- PTY support is robust

### Windows
- SIGINT emulation through stdin
- Limited signal support (only SIGINT, SIGTERM, SIGKILL)
- node-pty provides consistent behavior across platforms

## Conclusion

For the Ably CLI's current needs, the recommended approach is:

1. **Short term**: Document current limitations as acceptable trade-offs
2. **Medium term**: Implement command detection to use different strategies
3. **Long term**: Consider node-pty for full terminal emulation if needed

The current limitation (Ctrl+C delayed during command execution) is common in many Node.js REPLs and is an acceptable trade-off for maintaining simplicity and reliability.