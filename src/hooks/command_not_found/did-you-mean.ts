import { Hook } from '@oclif/core';
import chalk from 'chalk';
import inquirer from 'inquirer';
import closest from '../../utils/string-distance.js';

/**
 * Hook that runs when a command is not found. Suggests similar commands
 * and runs them if confirmed, in a similar style to the official oclif plugin.
 */
const hook: Hook<'command_not_found'> = async function (opts) {
  const { id, argv, config } = opts;

  // Get all command IDs to compare against
  const commandIDs = config.commandIDs;

  // Find the closest match
  const suggestion = closest(id, commandIDs);

  // Format the input command for display (replace colons with spaces)
  const displayOriginal = id.replaceAll(':', ' ');

  if (suggestion) {
    // Format the suggestion for display (replace colons with spaces)
    const displaySuggestion = suggestion.replaceAll(':', ' ');

    // Warn about command not found and suggest alternative with colored command names
    this.warn(`${chalk.cyan(displayOriginal)} is not an ably command.`);

    // Skip confirmation in tests
    const skipConfirmation = process.env.SKIP_CONFIRMATION === 'true';

    // Variable to hold confirmation state
    let confirmed = false;

    if (skipConfirmation) {
      // Auto-confirm in test environment
      confirmed = true;
    } else {
      // Prompt user for confirmation in normal usage
      const result = await inquirer.prompt([{
        name: 'confirmed',
        type: 'confirm',
        message: `Did you mean ${chalk.green(displaySuggestion)}?`,
        default: true
      }]);
      confirmed = result.confirmed;
    }

    if (confirmed) {
      try {
        // Run the suggested command with original arguments
        return await config.runCommand(suggestion, argv);
      } catch (error: unknown) {
        // Handle the error in the same way as direct command execution
        const err = error as { message?: string; oclif?: { exit?: number } };
        const exitCode = typeof err.oclif?.exit === 'number' ? err.oclif.exit : 1;

        // Check if it's a missing arguments error
        const isMissingArgsError = err.message?.includes('Missing') &&
                                  (err.message?.includes('required arg') ||
                                   err.message?.includes('required flag'));

        // Get command details to show help if it's a missing args error
        if (isMissingArgsError) {
          try {
            // Find the command and load it
            const cmd = config.findCommand(suggestion);
            if (cmd) {
              // Get command help
              const commandHelp = cmd.load ? await cmd.load() : null;
              if (commandHelp && commandHelp.id) {
                // Format usage to use spaces instead of colons
                const usage = commandHelp.usage || commandHelp.id;
                const formattedUsage = typeof usage === 'string' ? usage.replaceAll(':', ' ') : usage;

                // Extract error details for later display
                const errorMsg = err.message || '';

                // Show command help/usage info without duplicating error
                this.log('\nUSAGE');
                this.log(`  $ ${config.bin} ${formattedUsage}`);

                if (commandHelp.args && Object.keys(commandHelp.args).length > 0) {
                  this.log('\nARGUMENTS');
                  for (const [name, arg] of Object.entries(commandHelp.args)) {
                    this.log(`  ${name}  ${arg.description || ''}`);
                  }
                }

                // Add a line of vertical space
                this.log('');

                // Show the full help command with color
                const fullHelpCommand = `${config.bin} ${displaySuggestion} --help`;
                this.log(`${chalk.dim('See more help with:')} ${chalk.cyan(fullHelpCommand)}`);

                // Add a line of vertical space
                this.log('');

                // Show the error message at the end, without the "See more help" line
                const errorLines = errorMsg.split('\n');
                // Filter out the "See more help with --help" line if present
                const filteredErrorLines = errorLines.filter((line: string) => !line.includes('See more help with --help'));

                // If we filtered out a help line, add our custom one
                const customError = filteredErrorLines.join('\n');

                // Show the styled error message
                this.error(customError, { exit: exitCode });
              }
            }
          } catch {
            // If something goes wrong showing help, just show the original error
          }
        }

        // Default error handling if not a missing args error or if showing help failed
        if (err.message && err.message.includes('See more help with --help') && suggestion) {
          // Format the error message to use the full command for help
          const displaySuggestion = suggestion.replaceAll(':', ' ');
          const lines = err.message.split('\n');
          const filteredLines = lines.map((line: string) => {
            if (line.includes('See more help with --help')) {
              return `See more help with: ${config.bin} ${displaySuggestion} --help`;
            }
            return line;
          });
          this.error(filteredLines.join('\n'), { exit: exitCode });
        } else {
          // Original error message
          this.error(err.message || 'Unknown error', { exit: exitCode });
        }

        // This won't be reached due to this.error/this.exit, but TypeScript needs it
        return;
      }
    }
  } else {
    // No suggestion found - display generic error message for completely unknown command
    this.error(`Command ${displayOriginal} not found.\nRun ${config.bin} help for a list of available commands.`, { exit: 127 });
  }
};

export default hook;
