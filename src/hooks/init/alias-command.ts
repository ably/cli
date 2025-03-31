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
  // Get the raw command arguments
  const rawArgs = process.argv.slice(2)
  
  // If no args or no first argument, exit early
  if (!rawArgs.length) return
  
  const firstArg = rawArgs[0]
  
  // Only handle singular forms that map to plural forms (e.g., account → accounts)
  // Skip for commands that are already in plural form
  const pluralForm = singularToPluralMap[firstArg]
  if (!pluralForm || firstArg === pluralForm) return
  
  // If we get here, we're handling a singular form that needs to be replaced with plural
  // Create the command by replacing singular with plural
  const newArgs = [pluralForm, ...rawArgs.slice(1)]
  
  // Try the command with space format first (as configured in package.json)
  try {
    const spaceCommand = newArgs.join(' ')
    await this.config.runCommand(spaceCommand)
    this.exit(0) // Success!
  } catch (spaceError) {
    // If space format fails, try with colon format
    try {
      const colonCommand = newArgs.join(':')
      await this.config.runCommand(colonCommand)
      this.exit(0) // Success!
    } catch (colonError) {
      // Both formats failed, let normal command processing continue
      // This will allow standard error messages to be shown
      return
    }
  }
}

export default hook 