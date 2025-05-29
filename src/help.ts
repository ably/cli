import { Command, Help, Config, Interfaces } from "@oclif/core";
import chalk from "chalk";
import stripAnsi from "strip-ansi";

import { ConfigManager } from "./services/config-manager.js";
import { displayLogo } from "./utils/logo.js";

import { WEB_CLI_RESTRICTED_COMMANDS } from "./base-command.js"; // Import the single source of truth

export default class CustomHelp extends Help {
  static skipCache = true; // For development - prevents help commands from being cached

  protected webCliMode: boolean;
  protected configManager: ConfigManager;
  // Flag to track if we're already showing root help to prevent duplication
  protected isShowingRootHelp: boolean = false;

  constructor(config: Config, opts?: Record<string, unknown>) {
    super(config, opts);
    this.webCliMode = process.env.ABLY_WEB_CLI_MODE === "true";
    this.configManager = new ConfigManager();
  }

  // Override formatHelpOutput to apply stripAnsi when necessary
  formatHelpOutput(output: string): string {
    // Check if we're generating readme (passed as an option from oclif)
    if (this.opts?.stripAnsi || process.env.GENERATING_README === "true") {
      return stripAnsi(output);
    }
    return output;
  }

  // Helper to ensure no trailing whitespace
  private removeTrailingWhitespace(text: string): string {
    // Remove all trailing newlines completely
    return text.replace(/\n+$/, "");
  }

  // Override the display method to clean up trailing whitespace and exit cleanly
  async showHelp(argv: string[]): Promise<void> {
    // Get the help subject which is the last argument that is not a flag
    if (argv.length === 0) {
      return super.showHelp(argv); // No command provided, show general help
    }

    let subject: string = "";
    for (let arg of argv) {
      if (arg.startsWith("-")) {
        // If it's a flag, skip it
        continue;
      }
      subject = arg; // The last non-flag argument is the subject
    }

    const command = this.config.findCommand(subject);
    if (!command) return super.showHelp(argv);

    // Get formatted output
    const output = this.formatCommand(command);
    const cleanedOutput = this.removeTrailingWhitespace(output);
    // Apply stripAnsi when needed
    console.log(this.formatHelpOutput(cleanedOutput));
    process.exit(0);
  }

  // Override for root help as well
  async showRootHelp(): Promise<void> {
    // Get formatted output
    const output = this.formatRoot();
    const cleanedOutput = this.removeTrailingWhitespace(output);
    // Apply stripAnsi when needed
    console.log(this.formatHelpOutput(cleanedOutput));
    process.exit(0);
  }

  formatRoot(): string {
    let output: string;
    // Set flag to indicate we're showing root help
    this.isShowingRootHelp = true;

    const args = process.argv || [];
    const isWebCliHelp = args.includes("web-cli") || args.includes("webcli");

    if (this.webCliMode || isWebCliHelp) {
      output = this.formatWebCliRoot();
    } else {
      output = this.formatStandardRoot();
    }
    return output; // Let the overridden render handle stripping
  }

  formatStandardRoot(): string {
    // Manually construct root help (bypassing super.formatRoot)
    const { config } = this;
    const lines: string[] = [];

    // 1. Logo (conditionally)
    const logoLines: string[] = [];
    if (process.stdout.isTTY) {
      displayLogo((m: string) => logoLines.push(m)); // Use capture
    }
    lines.push(...logoLines);

    // 2. Title & Usage
    const headerLines = [
      chalk.bold("ably.com CLI for Pub/Sub, Chat, Spaces and the Control API"),
      "",
      `${chalk.bold("USAGE")}`,
      `  $ ${config.bin} [COMMAND]`,
      "",
      chalk.bold("COMMANDS"), // Use the desired single heading
    ];
    lines.push(...headerLines);

    // 3. Get, filter, combine, sort, and format visible commands/topics
    // Use a Map to ensure unique entries by command/topic name
    const uniqueEntries = new Map();

    // Process commands first
    config.commands
      .filter((c) => !c.hidden && !c.id.includes(":")) // Filter hidden and top-level only
      .filter((c) => this.shouldDisplay(c)) // Apply web mode filtering
      .forEach((c) => {
        uniqueEntries.set(c.id, {
          id: c.id,
          description: c.description,
          isCommand: true,
        });
      });

    // Then add topics if they don't already exist as commands
    config.topics
      .filter((t) => !t.hidden && !t.name.includes(":")) // Filter hidden and top-level only
      .filter((t) => this.shouldDisplay({ id: t.name } as Command.Loadable)) // Apply web mode filtering
      .forEach((t) => {
        if (!uniqueEntries.has(t.name)) {
          uniqueEntries.set(t.name, {
            id: t.name,
            description: t.description,
            isCommand: false,
          });
        }
      });

    // Convert to array and sort
    const combined = [...uniqueEntries.values()].sort((a, b) => {
      return a.id.localeCompare(b.id);
    });

    if (combined.length > 0) {
      const commandListString = this.renderList(
        combined.map((c) => {
          const description =
            c.description && this.render(c.description.split("\n")[0]);
          const descString = description ? chalk.dim(description) : undefined;
          return [chalk.cyan(c.id), descString];
        }),
        { indentation: 2, spacer: "\n" }, // Adjust spacing if needed
      );
      lines.push(commandListString);
    } else {
      lines.push("  No commands found.");
    }

    // 4. Login prompt (if needed and not in web mode)
    if (!this.webCliMode) {
      const accessToken =
        process.env.ABLY_ACCESS_TOKEN || this.configManager.getAccessToken();
      const apiKey = process.env.ABLY_API_KEY;
      if (!accessToken && !apiKey) {
        lines.push(
          "",
          chalk.yellow(
            "You are not logged in. Run the following command to log in:",
          ),
          chalk.cyan("  $ ably accounts login"),
        );
      }
    }

    // Join lines and return
    return lines.join("\n");
  }

  formatWebCliRoot(): string {
    const lines: string[] = [];
    if (process.stdout.isTTY) {
      displayLogo((m: string) => lines.push(m)); // Add logo lines directly
    }
    lines.push(
      chalk.bold(
        "ably.com browser-based CLI for Pub/Sub, Chat, Spaces and the Control API",
      ),
      "",
    );

    // 3. Show the web CLI specific instructions
    const webCliCommands = [
      `${chalk.bold("COMMON COMMANDS")}`,
      `  ${chalk.cyan("View Ably commands:")} ably --help`,
      `  ${chalk.cyan("Publish a message:")} ably channels publish [channel] [message]`,
      `  ${chalk.cyan("View live channel lifecycle events:")} ably channels logs`,
    ];
    lines.push(...webCliCommands);

    // 4. Check if login recommendation is needed
    const accessToken =
      process.env.ABLY_ACCESS_TOKEN || this.configManager.getAccessToken();
    const apiKey = process.env.ABLY_API_KEY;

    if (!accessToken && !apiKey) {
      lines.push(
        "",
        chalk.yellow(
          "You are not logged in. Run the following command to log in:",
        ),
        chalk.cyan("  $ ably login"),
      );
    }

    // Join lines and return
    return lines.join("\n");
  }

  formatCommand(command: Command.Loadable): string {
    let output: string;
    // Special case handling for web-cli help command
    if (command.id === "help:web-cli" || command.id === "help:webcli") {
      this.isShowingRootHelp = true; // Prevent further sections
      output = this.formatWebCliRoot();
    } else {
      // Reset root help flag when showing individual command help
      this.isShowingRootHelp = false;
      // Use super's formatCommand
      output = super.formatCommand(command);

      // Modify based on web CLI mode using the imported list
      if (
        this.webCliMode &&
        WEB_CLI_RESTRICTED_COMMANDS.some(
          (restricted) =>
            command.id === restricted ||
            command.id.startsWith(restricted + ":"),
        )
      ) {
        output = [
          `${chalk.bold("This command is not available in the web CLI mode.")}`,
          "",
          "Please use the standalone CLI installation instead.",
        ].join("\n");
      }
    }
    return output; // Let the overridden render handle stripping
  }

  // Re-add the check for web CLI mode command availability
  shouldDisplay(command: Command.Loadable): boolean {
    if (!this.webCliMode) {
      return true; // Always display if not in web mode
    }

    // In web mode, check if the command should be hidden using the imported list
    // Check if the commandId starts with any restricted command base
    return !WEB_CLI_RESTRICTED_COMMANDS.some(
      (restricted) =>
        command.id === restricted || command.id.startsWith(restricted + ":"),
    );
  }

  formatCommands(commands: Command.Loadable[]): string {
    // Skip if we're already showing root help to prevent duplication
    if (this.isShowingRootHelp) {
      return "";
    }

    // Filter commands based on webCliMode using shouldDisplay
    const visibleCommands = commands.filter((c) => this.shouldDisplay(c));

    if (visibleCommands.length === 0) return ""; // Return empty if no commands should be shown

    return this.section(
      chalk.bold("COMMANDS"),
      this.renderList(
        visibleCommands.map((c) => {
          const description =
            c.description && this.render(c.description.split("\n")[0]);
          return [
            chalk.cyan(c.id),
            description ? chalk.dim(description) : undefined,
          ];
        }),
        { indentation: 2 },
      ),
    );
  }

  formatTopics(topics: Interfaces.Topic[]): string {
    // Skip if we're already showing root help to prevent duplication
    if (this.isShowingRootHelp) {
      return "";
    }

    // Filter topics based on webCliMode using shouldDisplay logic
    const visibleTopics = topics.filter((t) => {
      if (!this.webCliMode) return true;
      // Check if the topic name itself is restricted or if any restricted command starts with the topic name
      return !WEB_CLI_RESTRICTED_COMMANDS.some(
        (restricted) =>
          t.name === restricted ||
          (restricted.startsWith(t.name + ":") && t.name !== "help"), // Check if command starts with topic: avoids hiding 'help'
      );
    });

    if (visibleTopics.length === 0) return "";

    return this.section(
      chalk.bold("TOPICS"),
      topics
        .filter((t) => this.shouldDisplay({ id: t.name } as Command.Loadable)) // Reuse shouldDisplay logic
        .map((c) => {
          const description =
            c.description && this.render(c.description.split("\n")[0]);
          return [
            chalk.cyan(c.name),
            description ? chalk.dim(description) : undefined,
          ];
        })
        .map(([left, right]) =>
          this.renderList([[left, right]], { indentation: 2 }),
        )
        .join("\n"),
    );
  }
}
