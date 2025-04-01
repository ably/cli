import { Hook } from '@oclif/core'
import { spawnSync } from 'child_process'
import * as path from 'path'
import chalk from 'chalk'

// Map of singular command forms to their plural equivalents
// This is used to alias commands like 'account' to 'accounts'
const singularToPluralMap: Record<string, string> = {
  'account': 'accounts',
  'app': 'apps',
  'channel': 'channels',
  'connection': 'connections',
  'integration': 'integrations',
  'log': 'logs',
  'queue': 'queues',
  'room': 'rooms',
  'space': 'spaces'
}

/**
 * This hook handles command not found errors and redirects singular command forms to their plural equivalents
 * For example, if ably account:xyz is not found, it will try to run ably accounts xyz
 */
const hook: Hook<'command_not_found'> = async function(options) {
  // Extract the command ID being run (e.g., "account:current")
  const commandId = options.id
  
  // Skip if no command ID
  if (!commandId) return
  
  // Split by colon to get the first topic
  const parts = commandId.split(':')
  const firstTopic = parts[0]
  
  // Check if this is a singular form that has a plural equivalent
  const pluralForm = singularToPluralMap[firstTopic]
  
  // Two cases:
  // 1. This is a singular form we need to convert to plural (like account -> accounts)
  // 2. This is not a singular form, just a command we couldn't find

  // For case 1:
  if (pluralForm) {
    // Create a command with spaces instead of colons (e.g., "accounts current")
    // This matches what's configured in package.json: "topicSeparator": " "
    const spaceCommand = [pluralForm, ...parts.slice(1)].join(' ')
    
    try {
      // Get the bin script path (it's at the root of the project in bin/run.js)
      const binPath = path.resolve(this.config.root, 'bin', 'run.js')
      
      // Run the command directly with space separators
      const result = spawnSync('node', [binPath, pluralForm, ...parts.slice(1), ...(options.argv || [])], {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: process.env
      })
      
      // If the command execution was successful, exit with the same code
      process.exit(result.status || 0)
    } catch (error: unknown) {
      // If there was an error running the command, show that error
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(chalk.red(`Error executing command: ${errorMessage}`))
      process.exit(1)
    }
  }
  
  // For both cases:
  // If we get here, it's just a regular command not found error
  // Let's show it clearly for better user experience
  console.error(chalk.red(`Error: command ${commandId} not found`))
  process.exit(2)
}

export default hook 