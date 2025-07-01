# Interactive ([Immersive](https://github.com/dthree/vorpal)) CLI

The Ably CLI is designed to be run as a traditional command line tool, where commands are run individually from a bash-like shell. Between each invocation of commands, the entire CLI environment is loaded and executed. This model works very well for a locally installed CLI.

However, the Ably CLI is also available as a Web Terminal CLI as a convenience for Ably customers who are logged in or browsing the docs, with a CLI drawer available to slide up and execute commands. This is made possible with a local restricted shell within a secure container being spawned for each session, with STDIN/STDOUT streamed over a WebSocket connection.

This model is operational today and works largely as expected, however it has some unexpected tradeoffs:

- There is some lag loading the Ably CLI within a restricted container for each request, typically a few hundred milliseconds. This coupled with the roundtrip latency becomes noticeable, although definitely still workable.
- Auto-complete does not work because of the security restrictions in place in the container and restricted shell. Working around this is proving very difficult, hacky or compromises on the security posture we were aiming for.

I would like to explore an alternative route where the Ably CLI supports an interactive ([immersive](https://github.com/dthree/vorpal)) CLI mode which would:

- Allow the CLI to be launched and remain running between commands (this will reduce latency by removing the need for the bootstrap sequence for every command)
- Offer all the same commands with the same Ably CLI syntax (commands and arguments) within the interactive mode. This consistency is important so that users dropping into the local CLI will get the same experience.
- Provide rich autocomplete functionality to ensure we deliver a great developer experience, similar to what `zsh` offers
- Provide history (Cmd+R / up)
- Handle Ctrl-C naturally - interrupt running commands, show helpful message at prompt
- Interactive REPL should feel like a standard shell, with the $ prompt for example
- Support for rich TUI terminal functionality such as progress indicators and inline table updates

## Technical considerations

There are some relevant Node.js projects we can draw inspiration from:

- [Vorpal interactive CLI](https://vorpal.js.org/) with source code at https://github.com/dthree/vorpal
- [Inquirer package](https://www.npmjs.com/package/inquirer) for common interactive command line user interface commands

[oclif](https://oclif.io/) does not appear to have any plugins to support an interactive/embedded CLI mode.
However, a [REPL plugin](https://github.com/sisou/oclif-plugin-repl) exists, although that's unlikely to share much with the goals of interactive CLI.

If there are any existing libraries that we can depend on to enable this functionality, taht that should be our preference to keep the CLI complexity low. However, any dependencies used should be well maintained and popular. If the additional dependencies to support this functionality add any material bloat, we should consider how this functionality can be added as an optional plugin so that the standard locally installed CLI has minimal dependencies.

## Execution Plan

### Overview

This execution plan implements an interactive REPL mode using a bash wrapper approach with inline command execution. The design prioritizes simplicity, natural Ctrl+C handling, and seamless user experience.

### Architecture: Bash Wrapper with Inline Execution

The chosen approach runs commands inline (no spawning/forking) with a bash wrapper script that automatically restarts the CLI after Ctrl+C interruptions. Key features:

- **Inline execution**: Commands run in the same process, eliminating spawn overhead
- **Natural Ctrl+C**: Interrupting commands exits the process, wrapper restarts seamlessly
- **Persistent history**: Command history saved to `~/.ably/history` across restarts
- **Special exit handling**: Typing 'exit' uses exit code 42 to signal wrapper to terminate

**Expected Performance**:
- Command execution: 0ms spawn overhead (runs inline)
- Ctrl+C to new prompt: ~200-300ms (CLI restart time)
- Memory usage: Shared with main process

### Implementation Phases

#### Phase 1: Basic REPL with Bash Wrapper (2-3 days)

**Goal**: Create functioning interactive shell with inline execution and bash wrapper.

**Tasks**:
1. Create `src/commands/interactive.ts` command (hidden initially)
2. Implement inline command execution using oclif's `execute()` API
3. Basic readline loop with `$ ` prompt
4. Create bash wrapper script for auto-restart
5. Implement special exit code handling

**Key Files**:

```typescript
// src/commands/interactive.ts
import { Command, execute } from '@oclif/core';
import * as readline from 'readline';
import { HistoryManager } from '../services/history-manager.js';

export default class Interactive extends Command {
  static description = 'Launch interactive Ably shell';
  static hidden = true;
  static EXIT_CODE_USER_EXIT = 42; // Special code for 'exit' command

  private rl!: readline.Interface;
  private historyManager!: HistoryManager;
  private isWrapperMode = process.env.ABLY_WRAPPER_MODE === '1';

  async run() {
    // Show welcome message only on first run
    if (!process.env.ABLY_SUPPRESS_WELCOME) {
      console.log('Welcome to Ably interactive shell. Type "exit" to quit.');
      if (this.isWrapperMode) {
        console.log('Press Ctrl+C to interrupt running commands.');
      }
      console.log();
    }

    this.historyManager = new HistoryManager();
    this.setupReadline();
    await this.historyManager.loadHistory(this.rl);
    this.rl.prompt();
  }

  private setupReadline() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '$ ',
      terminal: true
    });

    this.rl.on('line', async (input) => {
      await this.handleCommand(input.trim());
    });

    this.rl.on('SIGINT', () => {
      // Show yellow warning message
      console.log('\n\x1b[33mSignal received. To exit this shell, type \'exit\' and press Enter.\x1b[0m');
      this.rl.prompt();
    });

    this.rl.on('close', () => {
      this.cleanup();
      // Use special exit code when in wrapper mode
      const exitCode = this.isWrapperMode ? Interactive.EXIT_CODE_USER_EXIT : 0;
      process.exit(exitCode);
    });
  }

  private async handleCommand(input: string) {
    if (input === 'exit' || input === '.exit') {
      this.rl.close();
      return;
    }

    if (input === '') {
      this.rl.prompt();
      return;
    }

    // Save to history
    await this.historyManager.saveCommand(input);

    try {
      const args = this.parseCommand(input);
      
      // Execute command inline (no spawning)
      await execute({
        args,
        dir: import.meta.url
      });
      
    } catch (error: any) {
      if (error.code === 'EEXIT') {
        // Normal oclif exit - don't treat as error
        return;
      }
      console.error('Error:', error.message);
    } finally {
      this.rl.prompt();
    }
  }

  private parseCommand(input: string): string[] {
    // Handle quoted strings properly
    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const args: string[] = [];
    let match;
    
    while ((match = regex.exec(input))) {
      args.push(match[1] || match[2] || match[0]);
    }
    
    return args;
  }

  private cleanup() {
    console.log('\nGoodbye!');
  }
}
```

```bash
#!/bin/bash
# bin/ably-interactive

# Configuration
ABLY_BIN="$(dirname "$0")/run.js"
ABLY_CONFIG_DIR="$HOME/.ably"
HISTORY_FILE="$ABLY_CONFIG_DIR/history"
EXIT_CODE_USER_EXIT=42
WELCOME_SHOWN=0

# Create config directory if it doesn't exist
mkdir -p "$ABLY_CONFIG_DIR" 2>/dev/null || true

# Initialize history file
touch "$HISTORY_FILE" 2>/dev/null || true

# Main loop
while true; do
    # Run the CLI
    env ABLY_HISTORY_FILE="$HISTORY_FILE" \
        ABLY_WRAPPER_MODE=1 \
        ${ABLY_SUPPRESS_WELCOME:+ABLY_SUPPRESS_WELCOME=1} \
        node "$ABLY_BIN" interactive
    
    EXIT_CODE=$?
    
    # Mark welcome as shown after first run
    WELCOME_SHOWN=1
    export ABLY_SUPPRESS_WELCOME=1
    
    # Check exit code
    case $EXIT_CODE in
        $EXIT_CODE_USER_EXIT)
            # User typed 'exit'
            break
            ;;
        130)
            # SIGINT (Ctrl+C) - continue loop
            ;;
        0)
            # Should not happen in interactive mode
            break
            ;;
        *)
            # Other error
            echo -e "\033[31m\nProcess exited unexpectedly (code: $EXIT_CODE)\033[0m"
            sleep 0.5
            ;;
    esac
done

echo "Goodbye!"
```

**Testing**:
- Verify inline command execution works
- Test Ctrl+C during long-running commands
- Verify wrapper restarts seamlessly
- Test exit command with special exit code
- Verify history persistence across restarts

#### Phase 2: History Persistence (1-2 days)

**Goal**: Implement persistent command history that survives restarts.

**Tasks**:
1. Create `HistoryManager` service
2. Load history on startup
3. Save commands before execution
4. Implement history file trimming
5. Test history across restarts

**Implementation**:
```typescript
// src/services/history-manager.ts
import * as fs from 'fs';
import * as readline from 'readline';

export class HistoryManager {
  private historyFile: string;
  private maxHistorySize = 1000;
  
  constructor(historyFile?: string) {
    this.historyFile = historyFile || process.env.ABLY_HISTORY_FILE || 
                       `${process.env.HOME}/.ably/history`;
  }
  
  async loadHistory(rl: readline.Interface): Promise<void> {
    try {
      if (!fs.existsSync(this.historyFile)) return;
      
      const history = fs.readFileSync(this.historyFile, 'utf-8')
        .split('\n')
        .filter(line => line.trim())
        .slice(-this.maxHistorySize);
      
      // Access internal history
      const internalRl = rl as any;
      internalRl.history = history.reverse();
    } catch (error) {
      // Silently ignore history load errors
    }
  }
  
  async saveCommand(command: string): Promise<void> {
    if (!command.trim()) return;
    
    try {
      fs.appendFileSync(this.historyFile, command + '\n');
      
      // Trim history file if too large
      const lines = fs.readFileSync(this.historyFile, 'utf-8').split('\n');
      if (lines.length > this.maxHistorySize * 2) {
        const trimmed = lines.slice(-this.maxHistorySize).join('\n');
        fs.writeFileSync(this.historyFile, trimmed);
      }
    } catch (error) {
      // Silently ignore history save errors
    }
  }
}
```

#### Phase 3: Autocomplete Implementation (3-4 days)

**Goal**: Add tab completion for commands, subcommands, and flags.

**Tasks**:
1. Extract command metadata from oclif config
2. Implement readline completer function
3. Support nested command completion
4. Add flag completion

**Implementation**:
```typescript
// Add to Interactive class
private completer(line: string): [string[], string] {
  const commands = this.getAvailableCommands();
  const words = line.trim().split(/\s+/);
  
  if (words.length <= 1) {
    // Complete command names
    const partial = words[0] || '';
    const matches = commands.filter(cmd => cmd.startsWith(partial));
    return [matches, partial];
  } else {
    // Complete subcommands or flags
    const cmdPath = words.slice(0, -1).join(' ');
    const partial = words[words.length - 1];
    
    if (partial.startsWith('--')) {
      // Complete flags
      const flags = this.getFlagsForCommand(cmdPath);
      const matches = flags.filter(flag => flag.startsWith(partial));
      return [matches, partial];
    } else {
      // Complete subcommands
      const subcommands = this.getSubcommands(cmdPath);
      const matches = subcommands.filter(cmd => cmd.startsWith(partial));
      return [matches, partial];
    }
  }
}

private getAvailableCommands(): string[] {
  // Cache this on initialization
  return Array.from(this.config.commands.keys())
    .map(cmd => cmd.replace(/:/g, ' '))
    .sort();
}
```

#### Phase 4: Enhanced Parsing & Error Handling (2 days)

**Goal**: Improve command parsing and error handling.

**Tasks**:
1. Better quote handling in command parsing
2. Enhanced error messages
3. Worker crash recovery
4. Timeout handling

#### Phase 5: Testing & Polish (3 days)

**Goal**: Comprehensive testing and refinement.

**Tasks**:
1. Cross-platform testing (Windows, macOS, Linux)
2. Performance benchmarking
3. Edge case handling
4. Documentation

### Performance Metrics

**Target Performance**:
- Command execution: 0ms spawn overhead (inline execution)
- Ctrl+C to new prompt: < 300ms (CLI restart time)
- Autocomplete response: < 50ms
- History load time: < 50ms

### Risk Mitigation

1. **Oclif inline execution issues**: Test execute() API thoroughly
2. **Memory growth**: Monitor memory usage over time
3. **Platform compatibility**: Create PowerShell wrapper for Windows
4. **Rapid restart loops**: Add restart counter and backoff

### Success Criteria

1. **Latency**: 0ms spawn overhead for command execution
2. **Reliability**: Natural Ctrl+C handling with seamless restart
3. **Features**: Full autocomplete and persistent history
4. **Compatibility**: All existing commands work unchanged
5. **User Experience**: Invisible restart after Ctrl+C

### Deployment Strategy

1. **Week 1**: Core implementation (Phases 1-2)
2. **Week 2**: Autocomplete and enhancements (Phases 3-4)
3. **Week 3**: Testing and polish (Phase 5)
4. **Week 4**: Beta testing with web terminal
5. **Week 5**: Production rollout

### Advantages of Bash Wrapper Approach

1. **Simplicity**: No complex process management or signal forwarding
2. **Natural Ctrl+C**: Works exactly as users expect
3. **Performance**: Zero spawn overhead for commands
4. **Maintainability**: Much less code to maintain
5. **Reliability**: Leverages OS-level process management

This plan delivers a responsive interactive shell with natural Ctrl+C handling and seamless user experience through the bash wrapper approach.
