import { AblyBaseCommand } from '../../base-command.js'
import { ConfigManager } from '../../services/config-manager.js'
import { AblyMcpServer } from '../../mcp/index.js'
import { Flags } from '@oclif/core'

export default class StartMcpServer extends AblyBaseCommand {
  static description = 'Start an MCP server for AI tools to interact with Ably (currently experimental)'
  
  static flags = {
    // AblyBaseCommand already defines control-host as a global flag
  }
  
  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    // Check if this command is allowed in web CLI mode
    this.checkWebCliRestrictions()
    
    // Parse flags
    const { flags } = await this.parse(StartMcpServer)
    
    // Initialize Config Manager
    const configManager = new ConfigManager()
    
    try {
      // Start the server, write to stderr only
      console.error('Starting Ably CLI MCP server...')
      
      const server = new AblyMcpServer(configManager, {
        controlHost: flags['control-host']
      })
      await server.start()
      
      // The server.start() will block until the server is terminated
    } catch (error) {
      console.error('Failed to start MCP server:', error instanceof Error ? error.message : String(error))
      this.error('Failed to start MCP server', { exit: 1 })
    }
  }
} 