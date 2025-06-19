import { BaseTopicCommand } from '../../base-topic-command.js';

export default class McpCommands extends BaseTopicCommand {
  protected topicName = 'mcp';
  protected commandGroup = 'Model Context Protocol (MCP)';
  
  static description = 'Experimental Model Context Protocol (MCP) commands for AI tools to interact with Ably';
  
  static examples = ['<%= config.bin %> <%= command.id %> start-server'];
}