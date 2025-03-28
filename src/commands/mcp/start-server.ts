import { Command } from '@oclif/core'
import { ConfigManager } from '../../services/config-manager.js'
import { AblyMcpServer } from '../../mcp/index.js'

export default class StartMcpServer extends Command {
  static description = 'Start an MCP server for AI tools to interact with Ably'
  
  static flags = {}
  
  static examples = [
    '<%= config.bin %> <%= command.id %>',
  ]

  async run(): Promise<void> {
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