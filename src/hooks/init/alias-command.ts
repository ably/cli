import { Hook } from '@oclif/core'

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
 * This hook intercepts command execution and redirects singular command forms to their plural equivalents
 * This allows commands like 'ably account stats' to work as an alias for 'ably accounts stats'
 * without requiring separate alias files for each command
 */
const hook: Hook<'init'> = async function() {
  // We need access to the arguments to modify them
  // The first two arguments are node and the script path, 
  // so process.argv[2] contains the first CLI command (e.g., 'account')
  if (process.argv.length <= 2) return // Not enough arguments
  
  const firstArg = process.argv[2]
  
  // Check if this is a singular form that has a plural equivalent
  const pluralForm = singularToPluralMap[firstArg]
  if (!pluralForm || firstArg === pluralForm) return
  
  // If we have a match, replace the singular form with its plural version
  process.argv[2] = pluralForm 
  
  // We're relying on the command_not_found hook to handle executing 
  // the command properly and handle any errors.
}

export default hook 