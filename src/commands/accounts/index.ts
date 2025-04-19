import { ControlBaseCommand } from "../../control-base-command.js";

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

export default class AccountsCommand extends ControlBaseCommand {
  static description = "Manage Ably accounts and your configured access tokens";

  static examples = [
    "ably accounts login",
    "ably accounts list",
    "ably accounts current",
    "ably accounts logout",
    "ably accounts switch my-account",
    "ably accounts stats",
  ];

  async run(): Promise<void> {
    // Check if we should execute this command to avoid duplication
    if (!executionTracker.shouldExecute()) {
      return;
    }

    try {
      // Continue with normal execution
      this.log("Ably accounts management commands:");
      this.log("");
      this.log("  ably accounts login        - Log in to your Ably account");
      this.log("  ably accounts list         - List all configured accounts");
      this.log(
        "  ably accounts current      - Show the currently selected account",
      );
      this.log("  ably accounts logout       - Log out from your Ably account");
      this.log("  ably accounts switch       - Switch to a different account");
      this.log(
        "  ably accounts stats        - Get account stats with optional live updates",
      );
      this.log("");
      this.log(
        "Run `ably accounts COMMAND --help` for more information on a command.",
      );
    } finally {
      // Mark execution as complete
      executionTracker.done();
    }
  }
}
