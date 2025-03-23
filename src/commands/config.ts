import { Flags } from '@oclif/core'
import { AblyBaseCommand } from '../base-command.js'
import { execSync } from 'child_process'
import * as fs from 'fs'

export default class Config extends AblyBaseCommand {
  static override description = 'Open the Ably config file in the default text editor'
  
  static override examples = [
    '<%= config.bin %> <%= command.id %> edit',
  ]
  
  static override flags = {
    ...AblyBaseCommand.globalFlags,
    editor: Flags.string({
      char: 'e',
      description: 'Text editor to use (defaults to $EDITOR environment variable)',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Config)
    
    // Get the path to the config file
    const configPath = this.configManager.getConfigPath()
    
    // Create the config file if it doesn't exist
    if (!fs.existsSync(configPath)) {
      this.log(`Config file does not exist. Creating it at ${configPath}`)
      this.configManager.saveConfig()
    }
    
    // Determine which editor to use
    const editor = flags.editor || process.env.EDITOR || process.env.VISUAL || this.getDefaultEditor()
    
    if (!editor) {
      this.error('No text editor found. Please set one with the --editor flag or set the $EDITOR environment variable.')
      return
    }
    
    this.log(`Opening config file at ${configPath} with ${editor}...`)
    
    try {
      // Open the editor
      execSync(`${editor} "${configPath}"`, { stdio: 'inherit' })
      this.log('Configuration file has been opened for editing.')
    } catch (error) {
      this.error(`Failed to open editor: ${error}`)
    }
  }
  
  private getDefaultEditor(): string | undefined {
    // Platform-specific default editors
    if (process.platform === 'win32') {
      return 'notepad'
    } else if (process.platform === 'darwin') {
      return 'open -e'  // TextEdit on macOS
    } else {
      // Try common editors on Linux
      try {
        execSync('which nano', { stdio: 'ignore' })
        return 'nano'
      } catch {
        try {
          execSync('which vim', { stdio: 'ignore' })
          return 'vim'
        } catch {
          try {
            execSync('which vi', { stdio: 'ignore' })
            return 'vi'
          } catch {
            return undefined
          }
        }
      }
    }
  }
}
