import { AblyBaseCommand } from "../../base-command.js";

// Track execution in each process run, not globally across all runs
const executionTracker = new (class {
  private isExecuting = false;
  private lastExecutionTimestamp = 0;

  done(): void {
    this.isExecuting = false;
  }

  shouldExecute(): boolean {
    // If we're already in an execution, don't run again
    if (this.isExecuting) return false;

    // If this is the first execution or if more than 1 second has passed since the last execution
    // (to avoid issues with rapid sequential command execution), allow execution
    const now = Date.now();
    if (now - this.lastExecutionTimestamp > 1000) {
      this.isExecuting = true;
      this.lastExecutionTimestamp = now;
      return true;
    }

    return false;
  }
})();

export default class McpCommands extends AblyBaseCommand {
  static description =
    "Experimental Model Context Protocol (MCP) commands for AI tools to interact with Ably";

  static examples = ["<%= config.bin %> <%= command.id %> start-server"];

  async run(): Promise<void> {
    // Check if we should execute this command to avoid duplication
    if (!executionTracker.shouldExecute()) {
      return;
    }

    try {
      // Display available MCP commands
      this.log("Model Context Protocol (MCP) commands:");
      this.log("");
      this.log(
        "  ably mcp start-server      - Start an MCP server for AI tools to interact with Ably (currently experimental)",
      );
      this.log("");
      this.log(
        "Run `ably mcp COMMAND --help` for more information on a command.",
      );
    } finally {
      // Mark execution as complete
      executionTracker.done();
    }
  }
}
