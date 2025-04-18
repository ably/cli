import { Errors, Hook } from '@oclif/core';
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { setTimeout } from "node:timers/promises";
// Correctly import from CommonJS module in ESM project
import pkg from "fast-levenshtein";
const { get: levenshteinDistance } = pkg;

// Re-introduce getConfirmation based on oclif example
const getConfirmation = async (suggestion: string): Promise<boolean> => {
  // Skip confirmation in test mode
  if (process.env.NODE_ENV === 'test' || process.env.SKIP_CONFIRMATION === 'true') {
    return true; // Auto-confirm in test mode
  }

  const ac = new AbortController();
  const { signal } = ac;

  const confirmation = confirm({
    default: true,
    message: `Did you mean ${chalk.blueBright(suggestion)}?`, // Use chalk for styling
    theme: {
      prefix: '', // Keep theme simple or customize as needed
      style: {
        message: (text: string) => text, // Keep default styling
      },
    },
  });

  // Timeout logic from example
  setTimeout(10_000, 'timeout', { signal })
    .catch(() => false) // Treat timeout as rejection
    .then(() => confirmation.cancel());

  // Return the confirmation result or false on timeout/error
  return confirmation.then((value) => {
    ac.abort(); // Clean up abort controller
    return value;
  }).catch(() => {
    ac.abort(); // Ensure abort on error too
    return false;
  });
};

/**
 * Finds the closest command ID to the target command ID from a list of possibilities
 * using the Levenshtein distance algorithm.
 */
const findClosestCommand = (target: string, possibilities: string[]): string => {
  if (possibilities.length === 0) return '';
  
  const distances = possibilities
    .map((id) => ({ distance: levenshteinDistance(target, id, { useCollator: true }), id }));
    
  distances.sort((a, b) => a.distance - b.distance);
  
  const closest = distances[0];
  
  // Set a threshold - e.g., distance must be less than half the target length, or <= 3
  const threshold = Math.max(1, Math.floor(target.length / 2)); // At least 1, < half length
  const maxDistance = 3; // Or a fixed max distance
  
  if (closest.distance <= Math.min(threshold, maxDistance)) {
    return closest.id;
  }
  
  return ''; // No suggestion found within threshold
};

/**
 * Custom command_not_found hook implementation.
 */
const hook: Hook<"command_not_found"> = async function (opts) {
  const hiddenCommandIds = new Set(opts.config.commands.filter((c) => c.hidden).map((c) => c.id));
  const commandIDs = [...opts.config.commandIDs, ...opts.config.commands.flatMap((c) => c.aliases)]
    .filter((c) => !hiddenCommandIds.has(c));

  if (commandIDs.length === 0) return; // No commands to suggest

  const suggestion = findClosestCommand(opts.id, commandIDs);
  
  // Define these variables outside the conditional blocks
  const originalCmd = opts.id;
  const binHelp = `${opts.config.bin} help`;

  // 1. Handle no suggestion
  if (!suggestion) {
    this.error(`Command ${chalk.yellow(originalCmd)} not found. Run ${chalk.cyan.bold(binHelp)} for a list of available commands.`, { exit: 127 });
    return; 
  }

  // Suggestion exists
  // 2. Warn about the typo
  this.warn(`${chalk.yellow(originalCmd)} is not an ${opts.config.bin} command.`);

  // 3. Get confirmation from the user
  const userConfirmed = await getConfirmation(suggestion);

  // Add a blank line for spacing after the prompt interaction
  console.log(''); 

  if (userConfirmed) {
    let argv = opts.argv?.length ? opts.argv : opts.id.split(':').slice(suggestion.split(':').length);

    // 4. Handle HELP suggestion path
    if (suggestion.startsWith('help:')) {
      argv = suggestion.split(':').slice(1);
      try {
        return await this.config.runCommand('help', argv);
      } catch (error: unknown) {
        // Let oclif handle errors from the help command itself, or log unexpected ones
        if (error instanceof Errors.CLIError) throw error;
        this.error(`An unexpected error occurred while running help: ${error instanceof Error ? error.message : String(error)}`, { exit: 1 });
         
      }
    } 
    // 5. Handle REGULAR suggestion path
    else {
      try {
        return await this.config.runCommand(suggestion, argv);
      } catch (error: unknown) {
        // If it's a CLIError (including missing args), let the command context handle it
        if (error instanceof Errors.CLIError) {
           this.error(error); // Use this.error to show formatted error + help
        } 
        // Handle only truly unexpected non-CLI errors here.
        else {
           this.error(`An unexpected error occurred while running the suggested command: ${error instanceof Error ? error.message : String(error)}`, { exit: 1 });
            
        }
      }
    }
  } else {
    // User rejected the suggestion or timed out
    // Blank line already added above
    this.error(`Run ${chalk.cyan.bold(binHelp)} for a list of available commands.`, { exit: 127 });
  }
};

export default hook; 