import { AblyBaseCommand } from '../../base-command.js'
import { ConfigManager } from '../../services/config-manager.js'
import { AblyMcpServer } from '../../mcp/index.js'

export default class StartMcpServer extends AblyBaseCommand {
  static description = 'Start an MCP server for AI tools to interact with Ably (currently experimental)'
  
  static flags = {}
  
  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
    // Check if this command is allowed in web CLI mode
    this.checkWebCliRestrictions()
    
    // Initialize Config Manager
    const configManager = new ConfigManager()
    
    try {
      // Start the server, write to stderr only
      console.error('Starting Ably CLI MCP server...')
      
      const server = new AblyMcpServer(configManager)
      await server.start()
      
      // The server.start() will block until the server is terminated
    } catch (error) {
      console.error('Failed to start MCP server:', error instanceof Error ? error.message : String(error))
      this.error('Failed to start MCP server', { exit: 1 })
    }
  }
} 