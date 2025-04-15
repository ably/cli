import { Command, Errors, Hook, toConfiguredId } from '@oclif/core';
import { blueBright, cyan, red, reset, yellow } from 'ansis';
import levenshtein from 'fast-levenshtein';

import CustomHelp from '../../help.js'; // Import our custom help class

// Helper function to format Arguments section (simplified)
function formatArgumentsSection(args: any): string {
  // Handle both array and object input for args
  const argsArray = Array.isArray(args) ? args : (args ? Object.values(args) : []);
  if (!argsArray || argsArray.length === 0) return '';

  const body = argsArray.map(arg => {
    const name = arg.name.toUpperCase();
    const description = arg.description ? ` ${arg.description}` : '';
    return `  ${name}${description}`;
  }).join('\n');

  return `ARGUMENTS\n${body}`;
}

// Helper function to format Flags section (simplified)
function formatFlagsSection(flags: any): string {
  // Handle flags as an object
  const flagsObject = flags || {}; 
  // Ensure flag is treated as having expected properties, add type assertion if necessary
  const flagEntries = Object.entries(flagsObject).filter(([, flag]: [string, any]) => !flag?.hidden);
  if (flagEntries.length === 0) return '';

  const body = flagEntries.map(([name, flag]: [string, any]) => {
    const flagName = flag?.char ? `-${flag.char}, --${name}` : `    --${name}`;
    const description = flag?.description ? ` ${flag.description}` : '';
    // Basic formatting, could be enhanced for wrapping, types, defaults etc.
    return `  ${flagName}${description}`;
  }).join('\n');

  return `FLAGS\n${body}`;
}

/**
 * Finds the closest command ID to the target command ID from a list of possibilities
 * using the Levenshtein distance algorithm.
 */
const findClosestCommand = (target: string, possibilities: string[]): string => {
  if (possibilities.length === 0) return '';
  
  const distances = possibilities
    .map((id) => ({ distance: levenshtein.get(target, id, { useCollator: true }), id }));
    
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
const hook: Hook.CommandNotFound = async function (opts) {
  const hiddenCommandIds = new Set(opts.config.commands.filter((c) => c.hidden).map((c) => c.id));
  const commandIDs = [...opts.config.commandIDs, ...opts.config.commands.flatMap((c) => c.aliases)]
    .filter((c) => !hiddenCommandIds.has(c));

  if (commandIDs.length === 0) return; // No commands to suggest

  const suggestion = findClosestCommand(opts.id, commandIDs);
  
  // DEBUGGING: Log suggestion found
  console.log('[DEBUG] Input ID:', opts.id, 'Suggestion:', suggestion);

  // 1. Handle no suggestion FIRST
  if (!suggestion) {
    const originalCmd = toConfiguredId(opts.id, this.config);
    const binHelp = `${opts.config.bin} help`;
    this.error(`Command ${yellow(originalCmd)} not found. Run ${cyan.bold(binHelp)} for a list of available commands.`, { exit: 127 });
    return; 
  }

  // Suggestion exists - declare readable versions here
  const readableSuggestion = toConfiguredId(suggestion, this.config);
  const originalCmd = toConfiguredId(opts.id, this.config);

  // 2. Warn about the typo
  this.warn(`${yellow(originalCmd)} is not an ${opts.config.bin} command.`);

  // 3. Assume user confirmed "yes" (prompt is removed)
  const userConfirmed = true;

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
        // If it's a CLIError (including missing args), re-throw for default handling
        if (error instanceof Errors.CLIError) {
           throw error; 
        } 
        // Handle only truly unexpected non-CLI errors here.
        else {
           this.error(`An unexpected error occurred while running the suggested command: ${error instanceof Error ? error.message : String(error)}`, { exit: 1 });
            
        }
      }
    }
  } 
  // No 'else' needed as prompt is removed
};

export default hook; 