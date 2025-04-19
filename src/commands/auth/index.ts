import { AblyBaseCommand } from "../../base-command.js";

export default class Auth extends AblyBaseCommand {
  static description =
    "Authentication for Ably including key management and token generation";

  static examples = [
    "$ ably auth keys list",
    "$ ably auth keys get KEY_ID",
    "$ ably auth keys revoke KEY_ID",
    "$ ably auth keys update KEY_ID",
    "$ ably auth keys switch KEY_ID",
    "$ ably auth issue-jwt-token",
    "$ ably auth issue-ably-token",
    "$ ably auth revoke-token TOKEN",
  ];

  async run(): Promise<void> {
    this.log("Ably authentication commands:");
    this.log("");
    this.log("  ably auth keys               - Key management commands");
    this.log("  ably auth keys list          - List all keys in the app");
    this.log("  ably auth keys get           - View details for a key");
    this.log("  ably auth keys revoke        - Revoke a key");
    this.log("  ably auth keys update        - Update a key's properties");
    this.log(
      "  ably auth keys switch        - Switch to a key for all client requests",
    );
    this.log(
      "  ably auth issue-jwt-token    - Create an Ably JWT token with capabilities",
    );
    this.log(
      "  ably auth issue-ably-token   - Create an Ably Token with capabilities",
    );
    this.log("  ably auth revoke-token       - Revoke a token");
    this.log("");
    this.log(
      "Run `ably auth COMMAND --help` for more information on a command.",
    );
  }
}
