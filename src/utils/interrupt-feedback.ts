import chalk from 'chalk';

export function showInterruptFeedback(commandName?: string): void {
  // Get command name from environment if not provided
  if (!commandName && process.env.ABLY_CURRENT_COMMAND) {
    commandName = process.env.ABLY_CURRENT_COMMAND;
  }
  
  const message = commandName 
    ? `\n${chalk.yellow('↓ Stopping')} ${chalk.cyan(commandName)}...`
    : `\n${chalk.yellow('↓ Stopping command...')}`;
  console.error(message);
}