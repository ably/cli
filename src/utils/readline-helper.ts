import * as readline from 'node:readline';
import inquirer from 'inquirer';

/**
 * Helper function to safely run inquirer prompts in interactive mode
 * while preserving readline state and terminal settings.
 * 
 * This prevents issues with arrow keys showing escape sequences (^[[A)
 * after inquirer prompts in interactive mode.
 */
export async function runInquirerWithReadlineRestore<T>(
  promptFn: () => Promise<T>,
  interactiveReadline: readline.Interface | null
): Promise<T> {
  if (!interactiveReadline) {
    // Not in interactive mode, just run the prompt normally
    return await promptFn();
  }

  // Pause readline and save its state
  interactiveReadline.pause();
  const lineListeners = interactiveReadline.listeners('line');
  interactiveReadline.removeAllListeners('line');

  // Save terminal settings if available
  const stdin = process.stdin;
  const isRaw = stdin.isRaw;
  
  try {
    // Run the inquirer prompt
    const result = await promptFn();
    
    // Give inquirer time to clean up its terminal state
    await new Promise(resolve => setTimeout(resolve, 10));
    
    return result;
  } finally {
    // Restore terminal settings
    if (stdin.isTTY && isRaw !== undefined) {
      stdin.setRawMode(isRaw);
    }
    
    // Restore line listeners
    lineListeners.forEach((listener: any) => {
      interactiveReadline.on('line', listener);
    });
    
    // Resume readline with a small delay to ensure terminal is ready
    setTimeout(() => {
      interactiveReadline.resume();
      
      // Force readline to redraw its prompt to ensure proper state
      if ('_refreshLine' in interactiveReadline) {
        (interactiveReadline as any)._refreshLine();
      }
    }, 20);
  }
}