import { confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { setTimeout } from 'node:timers/promises';

export class PromptHelper {
  /**
   * Prompts the user for confirmation with a timeout.
   */
  async getConfirmation(suggestion: string): Promise<boolean> {
    const ac = new AbortController();
    const { signal } = ac;

    const confirmation = confirm({
      default: true,
      message: `Did you mean ${chalk.blueBright(suggestion)}?`,
      theme: {
        prefix: '',
        style: {
          message: (text: string) => chalk.reset(text),
        },
      },
    });

    // Timeout the prompt after 10 seconds
    setTimeout(10_000, 'timeout', { signal })
      .catch(() => false) // Ignore timeout errors, treat as 'No'
      .then(() => confirmation.cancel());

    try {
      const value = await confirmation;
      return value;
    } catch {
      // Handle cancellation (e.g., Ctrl+C) as 'No'
      return false;
    } finally {
      ac.abort(); // Clean up the AbortController
    }
  }
}

// Utility function to format a prompt message with chalk
export function formatPromptMessage(message: string, suggestion?: string): string {
  if (suggestion) {
    // Use chalk for styling
    return `${message} ${chalk.blueBright(suggestion)}?`; 
  } 
  return message;
}

// Note: The actual prompt logic (using inquirer) is now handled directly 
// within the did-you-mean.ts hook for better context management.
// This file now only contains utility functions if needed, 
// or can be removed if formatPromptMessage is moved/inlined.

// Example of how you might use chalk for other styling if needed:
// export function formatError(text: string): string {
//   return chalk.red(text);
// }

// export function formatWarning(text: string): string {
//   return chalk.yellow(text);
// }

// Example utility function using chalk (can be adapted or removed)
export function formatSuggestion(suggestion: string): string {
  return chalk.blueBright(suggestion);
}

// You can add other prompt-related utility functions here if needed. 