# SIGINT Handling Recommendations for Ably CLI Interactive Mode

## Summary

After extensive research and testing, here are the production-ready solutions for handling Ctrl+C in the Ably CLI's interactive REPL mode.

## The Core Problem

When readline is in terminal mode (required for line editing features):
1. It intercepts SIGINT signals
2. When paused (during command execution), it doesn't forward SIGINT events
3. This prevents Ctrl+C from interrupting child processes immediately

## Recommended Solutions (In Order of Preference)

### 1. Document and Accept Current Limitations ✅

**What:** Keep the current implementation but clearly document the behavior.

**Implementation:** No code changes needed.

**Documentation:**
```markdown
## Interactive Mode Behavior

- ✅ All commands work perfectly, including interactive prompts
- ✅ Ctrl+C at the prompt shows ^C and continues
- ⚠️  Ctrl+C during command execution waits for the command to complete
  - For long-running commands (like `channels subscribe`), use Ctrl+Z to suspend
  - Or specify a --duration flag to limit execution time
```

**Why this is acceptable:**
- Many popular REPLs have similar limitations (including Node.js REPL for custom eval)
- The trade-off ensures reliable interactive prompts
- Users can work around it with duration flags or Ctrl+Z

### 2. Hybrid Command Detection 🔧

**What:** Detect command type and use different strategies.

**Implementation:** See `interactive-hybrid.ts`

```typescript
// For long-running commands: Enable raw mode temporarily
if (isLongRunningCommand(command)) {
  enableRawModeForCtrlC();
}

// For interactive commands: Accept the limitation
else if (isInteractiveCommand(command)) {
  console.log('Note: Ctrl+C disabled during interactive prompts');
}
```

**Pros:**
- Best of both worlds
- Ctrl+C works for commands that need it most
- Interactive prompts still work perfectly

**Cons:**
- Requires maintaining command lists
- More complex implementation
- Edge cases to handle

### 3. Add Helper Commands 🛠️

**What:** Provide REPL-specific commands for better control.

**Implementation:**
```typescript
// Add REPL-specific commands
'.interrupt' - Forcefully interrupt current command
'.timeout <seconds>' - Set default timeout for commands
'.status' - Show if a command is running
```

**Example usage:**
```bash
$ .timeout 30
Default timeout set to 30 seconds

$ channels subscribe my-channel
Subscribing... (timeout in 30s, use .interrupt to stop)
```

### 4. Future Enhancement: node-pty 🚀

**What:** Full terminal emulation with node-pty.

**When to consider:**
- If user feedback indicates Ctrl+C limitation is a major issue
- If we need more advanced terminal features
- If we want to match VS Code terminal behavior

**Implementation complexity:** High
**Maintenance burden:** Medium
**User benefit:** Medium (solves edge case)

## Not Recommended

### ❌ terminal: false
Loses essential line editing features.

### ❌ Raw mode always on
Breaks interactive prompts completely.

### ❌ Process method override (current run-no-sigint.js)
Works for Ctrl+C but breaks prompts - not a complete solution.

## Implementation Plan

### Phase 1 (Immediate)
1. Remove the `run-no-sigint.js` wrapper
2. Document current behavior in help text
3. Add note when starting interactive mode

### Phase 2 (Next Sprint)
1. Implement hybrid command detection
2. Add `.interrupt` command
3. Add timeout support for long-running commands

### Phase 3 (Future)
1. Gather user feedback
2. Consider node-pty if needed
3. Add more REPL features (history, autocomplete)

## Testing Checklist

Any solution must pass these tests:

- [ ] Ctrl+C at empty prompt shows ^C and continues
- [ ] Y/N prompts work correctly
- [ ] Password prompts work correctly
- [ ] Multi-select prompts work correctly
- [ ] Long-running commands can be interrupted (somehow)
- [ ] Terminal doesn't get into corrupted state
- [ ] Works on macOS, Linux, and Windows
- [ ] Works in different terminals (Terminal.app, iTerm2, VS Code)

## Conclusion

The current readline-based implementation with documented limitations is the most pragmatic solution. It provides a stable, maintainable REPL that works reliably across all platforms while maintaining full compatibility with interactive prompts.

The hybrid approach offers a good middle ground if user feedback indicates that Ctrl+C for long-running commands is critical.