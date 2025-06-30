#!/usr/bin/env node

/**
 * Manual test script to verify arrow keys work after "did you mean" prompts
 * 
 * To test:
 * 1. Run: node test/manual/test-readline-arrows.js
 * 2. Type a misspelled command like "channles publish"
 * 3. Press 'n' to decline the suggestion
 * 4. Press the up arrow key
 * 5. The previous command should appear (not ^[[A)
 */

const readline = require('readline');
const inquirer = require('inquirer');

// Helper function that mimics our fix
async function runInquirerWithReadlineRestore(promptFn, rl) {
  if (!rl) {
    return await promptFn();
  }

  // Pause readline and save its state
  rl.pause();
  const lineListeners = rl.listeners('line');
  rl.removeAllListeners('line');

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
    lineListeners.forEach((listener) => {
      rl.on('line', listener);
    });
    
    // Resume readline with a small delay to ensure terminal is ready
    setTimeout(() => {
      rl.resume();
      
      // Force readline to redraw its prompt to ensure proper state
      if ('_refreshLine' in rl) {
        rl._refreshLine();
      }
    }, 20);
  }
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '$ ',
  terminal: true
});

console.log('Test readline arrow keys after inquirer prompt');
console.log('Type "test" to trigger a did-you-mean prompt');
console.log('Type "exit" to quit\n');

rl.prompt();

rl.on('line', async (input) => {
  if (input === 'exit') {
    rl.close();
    process.exit(0);
  }
  
  if (input === 'test') {
    // Simulate a "did you mean" prompt
    const result = await runInquirerWithReadlineRestore(
      async () => inquirer.prompt([{
        name: 'confirmed',
        type: 'confirm',
        message: 'Did you mean "test-command"?',
        default: true
      }]),
      rl
    );
    
    console.log(`You answered: ${result.confirmed ? 'Yes' : 'No'}`);
    console.log('Now try pressing the up arrow key - it should show "test" (not ^[[A)\n');
  } else {
    console.log(`You typed: ${input}`);
  }
  
  // Small delay before showing prompt
  setTimeout(() => {
    rl.prompt();
  }, 50);
});

rl.on('close', () => {
  console.log('\nGoodbye!');
  process.exit(0);
});