# Various Improvements Plan - 2025-07-06

This document outlines the plan to implement four key improvements across the Ably CLI and CLI Terminal Server repositories.

## Overview

The improvements will be implemented in the following order:

1. **Task 1**: Fix "ably" command feedback in interactive mode
2. **Task 2**: Fix `help status` UI issue and audit similar command paths
3. **Task 3**: Implement CLI help standardization 
4. **Task 4**: Review and implement applicable Docker-first test changes

## Task 1: Interactive Mode "ably" Command Feedback

### Problem
When users type `ably` in interactive mode, it should inform them that the `ably` prefix is not needed since they're already in interactive mode.

### Solution
1. **Location**: `main/src/interactive-base-command.ts` or the REPL handler
2. **Implementation**:
   - Detect when user enters "ably" as a command in interactive mode
   - Display helpful message: "You're already in interactive mode. Type 'help' or press TAB to see available commands"
   - Ensure this doesn't interfere with commands that contain "ably" as part of their name

### Files to modify:
- `main/src/interactive-base-command.ts`
- `main/src/commands/interactive.ts`

### Testing:
- Unit test for the "ably" command detection
- Integration test to verify message display
- Test that partial matches (e.g., "ablything") don't trigger the message

## Task 2: Fix `help status` UI Issue and Audit Command Paths

### Problem
Running `help status` in interactive mode clears the UI completely. Need to fix this and audit for similar issues.

### Investigation Plan
1. **Root Cause Analysis**:
   - Trace the execution path of `help status` in interactive mode
   - Identify why it clears the terminal
   - Check if it's calling process.exit() or similar

2. **Audit Scope**:
   - All commands under the `help` topic
   - Commands that might call `process.exit()` 
   - Commands that manipulate terminal directly
   - Commands marked as `INTERACTIVE_UNSUITABLE_COMMANDS`

### Commands to audit:
- All help subcommands: `help ask`, `help contact`, `help support`, `help status`, `help web-cli`
- Terminal manipulation commands: `clear`, `exit`, `quit`
- System commands: `version`, `mcp`
- Config commands that might exit: `config`, `login`, `logout`

### Files to examine:
- `main/src/help.ts`
- `main/src/base-command.ts`
- `main/src/interactive-base-command.ts`
- All command files in `main/src/commands/`
- `cli-terminal-server/src/services/websocket-server.ts`

### Fix Strategy:
1. Add guards in interactive mode to prevent terminal clearing
2. Replace `process.exit()` calls with proper command completion
3. Ensure all output goes through the proper interactive output handlers
4. Add command safeguards for interactive mode execution

## Task 3: CLI Help Standardization

### Overview
Major restructuring of the help system to align with industry standards.

### Implementation Steps:

#### Step 1: Create `support` topic structure
1. Create `main/src/commands/support.ts` as a topic command
2. Move existing help subcommands:
   - `help ask` → `support ask`
   - `help contact` → `support contact` 
   - `help support` → `support info`
3. Ensure proper command registration and help text

#### Step 2: Promote `status` to top-level
1. Move `help status` → `status`
2. Create `main/src/commands/status.ts`
3. Add `--open` flag to launch browser

#### Step 3: Fix `help` command behavior
1. Update `main/src/help.ts`:
   - Remove topic behavior (no more subcommands)
   - Ensure `help <command>` works properly
   - Make `help` show standard usage
2. Update command discovery to exclude help subcommands

#### Step 4: Update help web-cli handling
1. Remove `help web-cli` command
2. Add `--web-cli` flag to root help command
3. Update terminal server to handle new structure

#### Step 5: Update interactive mode
1. Update command listings to show new structure
2. Update tab completion
3. Update welcome messages to mention `support ask`

#### Step 6: Update Terminal Server
1. Update restricted commands list
2. Update any hardcoded references to old commands
3. Update tests that depend on old structure

### Files to modify:
- `main/src/help.ts`
- `main/src/commands/` (create support.ts, status.ts)
- `main/src/base-command.ts`
- `main/src/interactive-base-command.ts`
- `cli-terminal-server/src/services/websocket-server.ts`
- Various test files

## Task 4: Docker-First Test Review and Implementation

### Overview
Review the proposed test changes and implement applicable improvements.

### Analysis:
Many of the proposed changes relate to features that may not be fully implemented yet (wrapper script, signal handling changes). We'll focus on tests that can be implemented with current functionality.

### Applicable Test Improvements:

#### 1. WebSocket Message Handling Tests
- Test JSON payload parsing
- Test control message separation
- Test that raw JSON is never displayed

#### 2. Interactive Mode Command Tests
- Test blocked commands in interactive mode
- Test version command availability
- Test command restrictions

#### 3. Terminal Server Integration Tests
- Replace placeholder tests
- Add WebSocket connection tests
- Add authentication flow tests

#### 4. Help Command Tests
- Test new help structure
- Test support commands
- Test status command

### Files to create/modify:
- `cli-terminal-server/tests/integration/terminal-server.test.ts`
- `main/test/unit/help.test.ts`
- `main/test/unit/commands/support.test.ts`
- `main/test/integration/interactive-mode.test.ts`

## Execution Plan

### Phase 1: Task 1 (Interactive "ably" feedback)
1. Implement detection logic
2. Add unit tests
3. Test manually in interactive mode
4. Run full test suite

### Phase 2: Task 2 (Fix help status and audit)
1. Debug `help status` issue
2. Audit all commands for similar issues
3. Implement fixes with proper guards
4. Add regression tests
5. Test all commands in interactive mode

### Phase 3: Task 3 (Help standardization)
1. Create new command structure
2. Move existing commands
3. Update help system
4. Update terminal server
5. Update all tests
6. Prepare for version bump

### Phase 4: Task 4 (Test improvements)
1. Implement WebSocket message tests
2. Add interactive mode tests
3. Update terminal server tests
4. Ensure all tests pass

## Success Criteria

1. **Task 1**: Users see helpful message when typing "ably" in interactive mode
2. **Task 2**: No commands clear the terminal or exit unexpectedly in interactive mode
3. **Task 3**: New help structure works in both CLI and terminal server, all tests pass
4. **Task 4**: Improved test coverage for critical functionality

## Version Management

After Task 3 is complete:
1. Bump version from 0.9.0-alpha.4 to 0.9.0-alpha.5
2. Publish to NPM
3. Update terminal server to use new version
4. Test terminal server with new CLI version

## Risk Mitigation

1. **Backward Compatibility**: Old help commands will be removed, need clear migration path
2. **Terminal Server**: Must coordinate changes between repositories
3. **Test Coverage**: Ensure no regressions in existing functionality
4. **Interactive Mode**: Thoroughly test all commands to prevent UI issues

## Notes

- Each task should have tests passing before moving to the next
- Commits will be made after each task completion
- Terminal server tests can only be fully validated after CLI version is published