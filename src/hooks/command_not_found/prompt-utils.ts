import { confirm } from '@inquirer/prompts';
import { blueBright, reset } from 'ansis';
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
      message: `Did you mean ${blueBright(suggestion)}?`,
      theme: {
        prefix: '',
        style: {
          message: (text: string) => reset(text),
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