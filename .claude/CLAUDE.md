# CLAUDE.md - Ably CLI Main Project

## ⚠️ STOP - MANDATORY WORKFLOW

**DO NOT SKIP - Run these IN ORDER for EVERY change:**

```bash
pnpm prepare        # 1. Build + update manifest/README
pnpm exec eslint .  # 2. Lint (MUST be 0 errors)
pnpm test:unit      # 3. Test (at minimum)
                    # 4. Update docs if needed
```

**If you skip these steps, the work is NOT complete.**

## 🗂️ Project Context

**First, verify where you are:**
```bash
pwd  # Should show: .../cli/main or similar
ls -la .cursor/rules/  # Should show .mdc files
```

**This project (`main`) is the Ably CLI npm package.** It may be:
1. Part of a larger workspace (with sibling `cli-terminal-server`)
2. Opened standalone

## 📚 Essential Reading

**MANDATORY - Read these .cursor/rules files before ANY work:**

1. `Workflow.mdc` - The mandatory development workflow
2. `Development.mdc` - Coding standards  
3. `AI-Assistance.mdc` - How to work with this codebase

**Finding the rules:**
```bash
# From this project root:
cat .cursor/rules/Workflow.mdc
cat .cursor/rules/Development.mdc
cat .cursor/rules/AI-Assistance.mdc
```

## ❌ Common Pitfalls - DO NOT DO THESE

1. **Skip tests** - Only skip with documented valid reason
2. **Use `_` prefix for unused variables** - Remove the code instead
3. **Leave debug code** - Remove ALL console.log, DEBUG_TEST, test-*.mjs
4. **Use `// eslint-disable`** - Fix the root cause
5. **Remove tests without asking** - Always get permission first

## ✅ Correct Practices

### When Tests Fail
```typescript
// ❌ WRONG
it.skip('test name', () => {

// ✅ CORRECT - Document why
it.skip('should handle Ctrl+C on empty prompt', function(done) {
  // SKIPPED: This test is flaky in non-TTY environments
  // The readline SIGINT handler doesn't work properly with piped stdio
```

### When Linting Fails
```typescript
// ❌ WRONG - Workaround
let _unusedVar = getValue();

// ✅ CORRECT - Remove unused code
// Delete the line entirely
```

### Debug Cleanup Checklist
```bash
# After debugging, ALWAYS check:
find . -name "test-*.mjs" -type f
grep -r "DEBUG_TEST" src/ test/
grep -r "console.log" src/  # Except legitimate output
```

## 🚀 Quick Reference

```bash
# Full validation
pnpm validate

# Run specific test
pnpm test test/unit/commands/interactive.test.ts

# Lint specific file
pnpm exec eslint src/commands/interactive.ts

# Dev mode
pnpm dev
```

## 📁 Project Structure

```
.
├── src/
│   ├── commands/      # CLI commands (oclif)
│   ├── services/      # Business logic
│   ├── utils/         # Utilities
│   └── base-command.ts
├── test/
│   ├── unit/          # Fast, mocked
│   ├── integration/   # Real execution
│   └── e2e/           # Full scenarios
├── .cursor/
│   └── rules/         # MUST READ
└── package.json       # Scripts defined here
```

## 🔍 Related Projects

If this is part of a workspace, there may be:
- `../cli-terminal-server/` - WebSocket terminal server
- `../` - Workspace root with its own `.claude/CLAUDE.md`

But focus on THIS project unless specifically asked about others.

## ✓ Before Marking Complete

- [ ] `pnpm prepare` succeeds
- [ ] `pnpm exec eslint .` shows 0 errors  
- [ ] `pnpm test:unit` passes
- [ ] No debug artifacts remain
- [ ] Docs updated if needed
- [ ] Followed oclif patterns

**Quality matters. This is read by developers.**