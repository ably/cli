import { Command } from "@oclif/core";

export default class RoomsIndex extends Command {
  static override description = "Interact with Ably Chat rooms";

  static override examples = [
    "$ ably rooms list",
    '$ ably rooms messages send my-room "Hello world!"',
    "$ ably rooms messages subscribe my-room",
    "$ ably rooms messages get my-room",
    "$ ably rooms typing subscribe my-room",
    "$ ably rooms typing keystroke my-room",
  ];

  async run(): Promise<void> {
    this.log("Ably Chat rooms commands:");
    this.log("");
    this.log("  ably rooms list                  - List chat rooms");
    this.log(
      "  ably rooms messages              - Commands for managing messages in chat rooms",
    );
    this.log(
      "  ably rooms messages send         - Send a message to a chat room",
    );
    this.log(
      "  ably rooms messages subscribe    - Subscribe to messages in a chat room",
    );
    this.log(
      "  ably rooms messages get          - Get historical messages from a chat room",
    );
    this.log(
      "  ably rooms typing                - Commands for typing indicators in chat rooms",
    );
    this.log(
      "  ably rooms typing subscribe      - Subscribe to typing indicators in a chat room",
    );
    this.log(
      "  ably rooms typing keystroke       - Start typing in a chat room",
    );
    this.log(
      "  ably rooms presence              - Manage presence on chat rooms",
    );
    this.log(
      "  ably rooms reactions             - Manage reactions in chat rooms",
    );
    this.log("");
    this.log(
      "Run `ably rooms COMMAND --help` for more information on a command.",
    );
  }
}
