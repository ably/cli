import { Flags } from "@oclif/core";
import * as Ably from "ably";
import { randomUUID } from "node:crypto";

import { AblyBaseCommand } from "../../base-command.js";

export default class IssueAblyTokenCommand extends AblyBaseCommand {
  static description = "Creates an Ably Token with capabilities";

  static examples = [
    "$ ably auth issue-ably-token",
    '$ ably auth issue-ably-token --capability \'{"*":["*"]}\'',
    '$ ably auth issue-ably-token --capability \'{"chat:*":["publish","subscribe"], "status:*":["subscribe"]}\' --ttl 3600',
    "$ ably auth issue-ably-token --client-id client123 --ttl 86400",
    '$ ably auth issue-ably-token --client-id "none" --ttl 3600',
    "$ ably auth issue-ably-token --json",
    "$ ably auth issue-ably-token --pretty-json",
    "$ ably auth issue-ably-token --token-only",
    '$ ably channels publish --token "$(ably auth issue-ably-token --token-only)" my-channel "Hello"',
  ];

  static flags = {
    ...AblyBaseCommand.globalFlags,
    app: Flags.string({
      description: "App ID to use (uses current app if not specified)",
      env: "ABLY_APP_ID",
    }),
    capability: Flags.string({
      default: '{"*":["*"]}',
      description:
        'Capabilities JSON string (e.g. {"channel":["publish","subscribe"]})',
    }),
    "client-id": Flags.string({
      description:
        'Client ID to associate with the token. Use "none" to explicitly issue a token with no client ID, otherwise a default will be generated.',
    }),
    "token-only": Flags.boolean({
      default: false,
      description:
        "Output only the token string without any formatting or additional information",
    }),

    ttl: Flags.integer({
      default: 3600, // 1 hour
      description: "Time to live in seconds",
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(IssueAblyTokenCommand);

    // Get app and key
    const appAndKey = await this.ensureAppAndKey(flags);
    if (!appAndKey) {
      return;
    }

    const { apiKey } = appAndKey;

    try {
      // Display auth info if not token-only output
      if (!flags["token-only"]) {
        this.showAuthInfoIfNeeded(flags);
      }

      // Parse capabilities
      let capabilities;
      try {
        capabilities = JSON.parse(flags.capability);
      } catch (error) {
        this.error(
          `Invalid capability JSON: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Create token params
      const tokenParams: Ably.TokenParams = {
        capability: capabilities,
        ttl: flags.ttl * 1000, // Convert to milliseconds for Ably SDK
      };

      // Handle client ID - use special "none" value to explicitly indicate no clientId
      if (flags["client-id"]) {
        if (flags["client-id"].toLowerCase() === "none") {
          // No client ID - leave clientId undefined in the token params
        } else {
          // Use the provided client ID
          tokenParams.clientId = flags["client-id"];
        }
      } else {
        // Generate a default client ID
        tokenParams.clientId = `ably-cli-${randomUUID().slice(0, 8)}`;
      }

      // Create Ably REST client and request token
      const rest = this.createAblyRestClient({ key: apiKey });
      const tokenRequest = await rest.auth.createTokenRequest(tokenParams);

      // Use the token request to get an actual token
      const tokenDetails = await rest.auth.requestToken(tokenRequest);

      // If token-only flag is set, output just the token string
      if (flags["token-only"]) {
        this.log(tokenDetails.token);
        return;
      }

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput({ capability: tokenDetails.capability }, flags),
        );
      } else {
        this.log("Generated Ably Token:");
        this.log(`Token: ${tokenDetails.token}`);
        this.log(`Type: Ably`);
        this.log(`Issued: ${new Date(tokenDetails.issued).toISOString()}`);
        this.log(`Expires: ${new Date(tokenDetails.expires).toISOString()}`);
        this.log(`TTL: ${flags.ttl} seconds`);
        this.log(`Client ID: ${tokenDetails.clientId || "None"}`);
        this.log(
          `Capability: ${this.formatJsonOutput({ capability: tokenDetails.capability }, flags)}`,
        );
      }
    } catch (error) {
      this.error(
        `Error issuing Ably token: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
