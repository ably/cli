# Auto-completion

The Ably CLI supports shell auto-completion for bash, zsh, and PowerShell. This feature helps you discover and use commands more efficiently by providing tab completion for commands, subcommands, and flags.

## Installation

To set up auto-completion for your shell, run:

```bash
ably autocomplete
```

This will display installation instructions specific to your shell. Follow the instructions to enable auto-completion.

### Shell-specific installation

#### Bash

```bash
ably autocomplete bash
```

Add the displayed completion script to your `.bashrc` or `.bash_profile`.

#### Zsh

```bash
ably autocomplete zsh
```

Add the displayed completion script to your `.zshrc`.

#### PowerShell

```powershell
ably autocomplete powershell
```

Follow the instructions to add the completion script to your PowerShell profile.

## Usage

Once installed, you can use tab completion to:

- Complete command names: `ably acc<TAB>` → `ably accounts`
- List available subcommands: `ably channels <TAB>`
- Complete flags: `ably channels publish --<TAB>`
- Navigate nested commands: `ably accounts li<TAB>` → `ably accounts list`

## Examples

```bash
# Complete the autocomplete command
ably autoc<TAB>
# Result: ably autocomplete

# List all accounts subcommands
ably accounts <TAB>
# Shows: current, list, login, logout, set

# Complete a flag
ably channels publish --ch<TAB>
# Result: ably channels publish --channel-id

# Navigate nested commands
ably inte<TAB> rules <TAB>
# Result: ably integrations rules (and shows available subcommands)
```

## Troubleshooting

### Auto-completion not working

1. Ensure you've followed the installation instructions for your shell
2. Restart your shell or source your configuration file:
   - Bash: `source ~/.bashrc`
   - Zsh: `source ~/.zshrc`
   - PowerShell: Restart PowerShell

### Refresh completion cache

If commands are not appearing in auto-completion after installing new plugins or updating the CLI:

```bash
ably autocomplete --refresh-cache
```

### Debugging

To check if auto-completion is properly installed:

1. Type `ably ` (with a space after) and press TAB twice
2. You should see a list of available commands

If you don't see any suggestions, verify that:
- The completion script was added to your shell configuration
- Your shell configuration file is being sourced
- You're using a supported shell (bash, zsh, or PowerShell)

## Supported Shells

- **Bash** 4.4+
- **Zsh** 5.1+
- **PowerShell** 5.0+

## Notes

- Auto-completion works with all Ably CLI commands and flags
- The completion system is context-aware and will only suggest valid options
- Custom aliases are not included in auto-completion