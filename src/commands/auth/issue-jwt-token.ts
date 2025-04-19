import { Flags } from "@oclif/core";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

import { AblyBaseCommand } from "../../base-command.js";

interface JwtPayload {
  exp: number;
  iat: number;
  jti: string;
  "x-ably-appId": string;
  "x-ably-capability": Record<string, string[]>;
  "x-ably-clientId"?: string;
}

export default class IssueJwtTokenCommand extends AblyBaseCommand {
  static description = "Creates an Ably JWT token with capabilities";

  static examples = [
    "$ ably auth issue-jwt-token",
    '$ ably auth issue-jwt-token --capability \'{"*":["*"]}\'',
    '$ ably auth issue-jwt-token --capability \'{"chat:*":["publish","subscribe"], "status:*":["subscribe"]}\' --ttl 3600',
    "$ ably auth issue-jwt-token --client-id client123 --ttl 86400",
    "$ ably auth issue-jwt-token --json",
    "$ ably auth issue-jwt-token --pretty-json",
    "$ ably auth issue-jwt-token --token-only",
    '$ ably channels publish --token "$(ably auth issue-jwt-token --token-only)" my-channel "Hello"',
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
    const { flags } = await this.parse(IssueJwtTokenCommand);

    // Get app and key
    const appAndKey = await this.ensureAppAndKey(flags);
    if (!appAndKey) {
      return;
    }

    const { apiKey, appId } = appAndKey;

    try {
      // Parse the API key to get keyId and keySecret
      const [keyId, keySecret] = apiKey.split(":");

      if (!keyId || !keySecret) {
        this.error("Invalid API key format. Expected format: keyId:keySecret");
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

      // Create JWT payload
      const jwtPayload: JwtPayload = {
        exp: Math.floor(Date.now() / 1000) + flags.ttl, // expiration
        iat: Math.floor(Date.now() / 1000), // issued at
        jti: randomUUID(), // unique token ID
        "x-ably-appId": appId,
        "x-ably-capability": capabilities,
      };

      // Handle client ID - use special "none" value to explicitly indicate no clientId
      let clientId: null | string = null;
      if (flags["client-id"]) {
        if (flags["client-id"].toLowerCase() === "none") {
          // No client ID - don't add it to the token
          clientId = null;
        } else {
          // Use the provided client ID
          jwtPayload["x-ably-clientId"] = flags["client-id"];
          clientId = flags["client-id"];
        }
      } else {
        // Generate a default client ID
        const defaultClientId = `ably-cli-${randomUUID().slice(0, 8)}`;
        jwtPayload["x-ably-clientId"] = defaultClientId;
        clientId = defaultClientId;
      }

      // Sign the JWT
      const token = jwt.sign(jwtPayload, keySecret, {
        algorithm: "HS256",
        keyid: keyId,
      });

      // If token-only flag is set, output just the token string
      if (flags["token-only"]) {
        this.log(token);
        return;
      }

      if (this.shouldOutputJson(flags)) {
        this.log(
          this.formatJsonOutput(
            {
              appId,
              capability: capabilities,
              clientId,
              expires: new Date(jwtPayload.exp * 1000).toISOString(),
              issued: new Date(jwtPayload.iat * 1000).toISOString(),
              keyId,
              token,
              ttl: flags.ttl,
              type: "jwt",
            },
            flags,
          ),
        );
      } else {
        this.log("Generated Ably JWT Token:");
        this.log(`Token: ${token}`);
        this.log(`Type: JWT`);
        this.log(`Issued: ${new Date(jwtPayload.iat * 1000).toISOString()}`);
        this.log(`Expires: ${new Date(jwtPayload.exp * 1000).toISOString()}`);
        this.log(`TTL: ${flags.ttl} seconds`);
        this.log(`App ID: ${appId}`);
        this.log(`Key ID: ${keyId}`);
        this.log(`Client ID: ${clientId || "None"}`);
        this.log(`Capability: ${this.formatJsonOutput(capabilities, flags)}`);
      }
    } catch (error) {
      this.error(
        `Error issuing JWT token: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
