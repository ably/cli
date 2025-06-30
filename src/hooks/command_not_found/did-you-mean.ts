import { Hook } from '@oclif/core';
import chalk from 'chalk';
import inquirer from 'inquirer';
import pkg from "fast-levenshtein";
import { runInquirerWithReadlineRestore } from '../../utils/readline-helper.js';
const { get: levenshteinDistance } = pkg;

/**
 * Internal implementation of closest command matching
 * to avoid import issues between compiled and test code
 */
const findClosestCommand = (target: string, possibilities: string[]): string => {
  if (possibilities.length === 0) return "";

  // Normalize the target input to use colons for consistent comparison
  const normalizedTarget = target.replaceAll(' ', ':');

  const distances = possibilities.map((id) => ({
    distance: levenshteinDistance(normalizedTarget, id, { useCollator: true }),
    id,
  }));

  distances.sort((a, b) => a.distance - b.distance);

  const closestMatch = distances[0];
  if (!closestMatch) return "";

  // Use threshold based on word length
  const threshold = Math.max(1, Math.floor(normalizedTarget.length / 2));
  const maxDistance = 3; // Maximum acceptable distance

  if (closestMatch.distance <= Math.min(threshold, maxDistance)) {
    return closestMatch.id;
  }

  return ""; // No suggestion found within threshold
};

/**
 * Hook that runs when a command is not found. Suggests similar commands
 * and runs them if confirmed, in a similar style to the official oclif plugin.
 */
const hook: Hook<'command_not_found'> = async function (opts) {
  const { id, argv, config } = opts;
  const isInteractiveMode = process.env.ABLY_INTERACTIVE_MODE === 'true';

  // Get all command IDs to compare against
  const commandIDs = config.commandIDs;

  // In actual CLI usage, the id comes with colons as separators
  // For example "channels:publis:foo:bar" for "ably channels publis foo bar"
  // We need to split the command and try different combinations to find the closest match
  const commandParts = id.split(':');

  // Try to find a command match by considering progressively shorter prefixes
  let suggestion = '';
  let commandPartCount = 0;
  let argumentsFromId: string[] = [];

  // Try different command parts
  for (let i = commandParts.length; i > 0; i--) {
    const possibleCommandParts = commandParts.slice(0, i);
    const possibleCommand = possibleCommandParts.join(':');

    suggestion = findClosestCommand(possibleCommand, commandIDs);

    if (suggestion) {
      commandPartCount = i;
      // Extract potential arguments from the ID (for CLI execution)
      // These would be parts after the matched command parts
      argumentsFromId = commandParts.slice(i);
      break;
    }
  }

  // Format the input command for display (replace colons with spaces)
  const displayOriginal = commandPartCount > 0
    ? commandParts.slice(0, commandPartCount).join(' ')
    : id.replaceAll(':', ' ');

  if (suggestion) {
    // Format the suggestion for display (replace colons with spaces)
    const displaySuggestion = suggestion.replaceAll(':', ' ');

    // Get all arguments - either from id split or from argv
    // In tests, argv contains the arguments, but in CLI execution, we extract them from id
    const allArgs = (argv || []).length > 0 ? (argv || []) : argumentsFromId;

    // Warn about command not found and suggest alternative with colored command names
    const warningMessage = `${chalk.cyan(displayOriginal.replaceAll(':', ' '))} is not an ably command.`;
    if (isInteractiveMode) {
      console.log(chalk.yellow(`Warning: ${warningMessage}`));
    } else {
      this.warn(warningMessage);
    }

    // Skip confirmation in tests or non-interactive mode
    const skipConfirmation = process.env.SKIP_CONFIRMATION === 'true' || process.env.ABLY_CLI_NON_INTERACTIVE === 'true';

    // Variable to hold confirmation state
    let confirmed = false;

    if (skipConfirmation) {
      // Auto-confirm in test/non-interactive environment
      // Important: We still proceed to *try* running the command, but tests assert it *fails* correctly
      confirmed = true;
    } else {
      // In interactive mode, we need to handle readline carefully
      const interactiveReadline = isInteractiveMode ? (globalThis as any).__ablyInteractiveReadline : null;
      
      const result = await runInquirerWithReadlineRestore(
        async () => inquirer.prompt([{
          name: 'confirmed',
          type: 'confirm',
          message: `Did you mean ${chalk.green(displaySuggestion)}?`,
          default: true
        }]),
        interactiveReadline
      );
      confirmed = result.confirmed;
    }

    if (confirmed) {
      try {
        // Run the suggested command with all arguments
        return await config.runCommand(suggestion, allArgs);
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
                const logFn = isInteractiveMode ? console.log : this.log.bind(this);
                const binPrefix = isInteractiveMode ? '' : `${config.bin} `;
                
                logFn('\nUSAGE');
                logFn(`  $ ${binPrefix}${formattedUsage}`);

                if (commandHelp.args && Object.keys(commandHelp.args).length > 0) {
                  logFn('\nARGUMENTS');
                  for (const [name, arg] of Object.entries(commandHelp.args)) {
                    logFn(`  ${name}  ${arg.description || ''}`);
                  }
                }

                // Add a line of vertical space
                logFn('');

                // Show the full help command with color
                const fullHelpCommand = isInteractiveMode 
                  ? `${displaySuggestion} --help`
                  : `${config.bin} ${displaySuggestion} --help`;
                logFn(`${chalk.dim('See more help with:')} ${chalk.cyan(fullHelpCommand)}`);

                // Add a line of vertical space
                logFn('');

                // Show the error message at the end, without the "See more help" line
                const errorLines = errorMsg.split('\n');
                // Filter out the "See more help with --help" line if present
                const filteredErrorLines = errorLines.filter((line: string) => !line.includes('See more help with --help'));

                // If we filtered out a help line, add our custom one
                const customError = filteredErrorLines.join('\n');

                // Show the styled error message
                if (isInteractiveMode) {
                  // In interactive mode, don't exit - just throw the error
                  // The interactive command will display it
                  const error = new Error(customError);
                  (error as any).oclif = { exit: exitCode };
                  throw error;
                } else {
                  this.error(customError, { exit: exitCode });
                }
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
              return isInteractiveMode 
                ? `See more help with: ${displaySuggestion} --help`
                : `See more help with: ${config.bin} ${displaySuggestion} --help`;
            }
            return line;
          });
          if (isInteractiveMode) {
            const error = new Error(filteredLines.join('\n'));
            (error as any).oclif = { exit: exitCode };
            throw error;
          } else {
            this.error(filteredLines.join('\n'), { exit: exitCode });
          }
        } else {
          // Original error message
          if (isInteractiveMode) {
            const error = new Error(err.message || 'Unknown error');
            (error as any).oclif = { exit: exitCode };
            throw error;
          } else {
            this.error(err.message || 'Unknown error', { exit: exitCode });
          }
        }

        // This won't be reached due to this.error/this.exit, but TypeScript needs it
        return;
      }
    }
    
    // User declined the suggestion - check if we should show topic commands
    if (suggestion) {
      // Extract the topic from the suggestion (e.g., "accounts:current" -> "accounts")
      const topicParts = suggestion.split(':');
      if (topicParts.length > 1) {
        const topicCommand = topicParts[0];
        const topicCmd = config.findCommand(topicCommand);
        
        if (topicCmd) {
          // This is a topic command - run it to show available subcommands
          try {
            await config.runCommand(topicCommand, []);
            return;
          } catch {
            // If running the topic command fails, fall through to show generic error
          }
        }
      }
    }
  } else {
    // No suggestion found
    const displayCommand = id.replaceAll(':', ' ');
    const errorMessage = isInteractiveMode 
      ? `Command ${displayCommand} not found. Run 'help' for a list of available commands.`
      : `Command ${displayCommand} not found.\nRun ${config.bin} --help for a list of available commands.`;
    
    if (isInteractiveMode) {
      // In interactive mode, just throw the error without logging
      // The interactive command will handle displaying it
      const error = new Error(errorMessage);
      (error as any).isCommandNotFound = true;
      throw error;
    } else {
      this.error(errorMessage, { exit: 127 });
    }
  }
};

export default hook;
