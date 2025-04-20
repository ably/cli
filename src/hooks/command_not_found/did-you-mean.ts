import { Errors, Hook } from "@oclif/core";
import chalk from "chalk";
import { confirm } from "@inquirer/prompts";
import { setTimeout } from "node:timers/promises";
// Correctly import from CommonJS module in ESM project
import pkg from "fast-levenshtein";
const { get: levenshteinDistance } = pkg;

// Helper to format command ID using the configured separator
const formatCommandId = (id: string, separator: string): string => {
  // Replace colons with the configured separator for display purposes
  return id.replaceAll(':', separator);
};

// Re-introduce getConfirmation based on oclif example
// Pass separator for formatting the prompt message
const getConfirmation = async (suggestion: string, separator: string): Promise<boolean> => {
  // Skip confirmation in test mode
  if (
    process.env.NODE_ENV === "test" ||
    process.env.SKIP_CONFIRMATION === "true"
  ) {
    return true; // Auto-confirm in test mode
  }

  const ac = new AbortController();
  const { signal } = ac;

  // Format the suggestion using the separator for display
  const formattedSuggestion = formatCommandId(suggestion, separator);

  const confirmation = confirm({
    default: true,
    // Use the formatted suggestion in the message
    message: `Did you mean ${chalk.blueBright(formattedSuggestion)}?`,
    theme: {
      prefix: "", // Keep theme simple or customize as needed
      style: {
        message: (text: string) => text, // Keep default styling
      },
    },
  });

  // Timeout logic from example
  setTimeout(10_000, "timeout", { signal })
    .catch(() => false) // Treat timeout as rejection
    .then(() => confirmation.cancel());

  // Return the confirmation result or false on timeout/error
  return confirmation
    .then((value) => {
      ac.abort(); // Clean up abort controller
      return value;
    })
    .catch(() => {
      ac.abort(); // Ensure abort on error too
      return false;
    });
};

/**
 * Finds the closest command ID to the target command ID from a list of possibilities
 * using the Levenshtein distance algorithm.
 * Oclif command IDs use colons internally, regardless of configured topicSeparator.
 * The user input `target` might use spaces or colons.
 */
const findClosestCommand = (
  target: string, // User input, might use spaces or colons
  possibilities: string[], // Canonical command IDs (colon-separated)
): string => {
  if (possibilities.length === 0) return "";

  // Normalize the target input to use colons for consistent comparison
  // against the canonical colon-separated possibilities.
  const normalizedTarget = target.replaceAll(' ', ':'); // Assume space separator if not colon

  const distances = possibilities.map((id) => ({
    // Compare normalized target with canonical ID
    distance: levenshteinDistance(normalizedTarget, id, { useCollator: true }),
    id, // Return the canonical (colon-separated) ID
  }));

  distances.sort((a, b) => a.distance - b.distance);

  const closest = distances[0];

  // Use the normalized target length for threshold calculation
  const threshold = Math.max(1, Math.floor(normalizedTarget.length / 2));
  const maxDistance = 3; // Or a fixed max distance

  if (closest.distance <= Math.min(threshold, maxDistance)) {
    // Return the canonical colon-separated ID
    return closest.id;
  }

  return ""; // No suggestion found within threshold
};

/**
 * Custom command_not_found hook implementation.
 */
const hook: Hook<"command_not_found"> = async function (opts) {
  // Get the configured separator for display formatting, default to space if needed
  const displaySeparator = opts.config.topicSeparator ?? ' ';
  // Format the original user input ID for display
  const formattedInputId = opts.id.replaceAll(':', displaySeparator); // Ensure input is displayed correctly

  const hiddenCommandIds = new Set(
    opts.config.commands.filter((c) => c.hidden).map((c) => c.id),
  );
  // Command IDs from oclif are always colon-separated internally
  const commandIDs = [
    ...opts.config.commandIDs,
    ...opts.config.commands.flatMap((c) => c.aliases),
  ].filter((c) => !hiddenCommandIds.has(c));

  if (commandIDs.length === 0) return; // No commands to suggest

  // Find closest command using the raw input `opts.id` and colon-separated possibilities
  const suggestion = findClosestCommand(opts.id, commandIDs);

  const binHelp = `${opts.config.bin} help`;

  // 1. Handle no suggestion
  if (!suggestion) {
    this.error(
      // Use the formatted input ID for the error message
      `Command ${chalk.yellow(formattedInputId)} not found. Run ${chalk.cyan.bold(binHelp)} for a list of available commands.`,
      { exit: 127 },
    );
    return;
  }

  // Suggestion exists (it's a colon-separated ID from oclif)
  // 2. Warn about the typo
  this.warn(
    // Use the formatted input ID in the warning
    `${chalk.yellow(formattedInputId)} is not an ${opts.config.bin} command.`,
  );

  // 3. Get confirmation from the user, passing the display separator for formatting
  // The suggestion itself is still the colon-separated ID needed to run the command
  const userConfirmed = await getConfirmation(suggestion, displaySeparator);

  // Add a blank line for spacing after the prompt interaction
  console.log("");

  if (userConfirmed) {
    // Oclif needs the colon-separated command ID to run it.
    // Determine argv by comparing the original input parts (split by space or colon)
    // with the suggested command parts (split by colon).
    const suggestionParts = suggestion.split(":");
    const inputParts = opts.id.includes(':') ? opts.id.split(':') : opts.id.split(' '); // Handle space or colon in input

    let argv = opts.argv?.length
      ? opts.argv
      : inputParts.slice(suggestionParts.length);

    // 4. Handle HELP suggestion path (help commands still use ':')
    if (suggestion.startsWith("help:")) {
      argv = suggestion.split(":").slice(1); // Help command structure uses ':'
      try {
        // Run 'help' command with its specific args
        return await this.config.runCommand("help", argv);
      } catch (error: unknown) {
        if (error instanceof Errors.CLIError) throw error;
        this.error(
          `An unexpected error occurred while running help: ${error instanceof Error ? error.message : String(error)}`,
          { exit: 1 },
        );
      }
    }
    // 5. Handle REGULAR suggestion path
    else {
      try {
        // Run the suggested command (using the colon-separated ID) with determined argv
        return await this.config.runCommand(suggestion, argv);
      } catch (error: unknown) {
        if (error instanceof Errors.CLIError) {
           this.error(error); // Let oclif handle CLI errors
        } else {
          this.error(
            `An unexpected error occurred while running the suggested command: ${error instanceof Error ? error.message : String(error)}`,
            { exit: 1 },
          );
        }
      }
    }
  } else {
    // User rejected the suggestion or timed out
    this.error(
      `Run ${chalk.cyan.bold(binHelp)} for a list of available commands.`,
      { exit: 127 },
    );
  }
};

export default hook;
