import { Command } from "@oclif/core";

export default class LogsPush extends Command {
  static override description =
    "Stream or retrieve push notification logs from [meta]log:push";

  static override examples = [
    "$ ably logs push subscribe",
    "$ ably logs push subscribe --rewind 10",
    "$ ably logs push history",
  ];

  async run() {
    this.log("Push notification logs commands:");
    this.log("");
    this.log(
      "  ably logs push subscribe    - Stream logs from the app push notifications",
    );
    this.log("  ably logs push history      - View historical push logs");
    this.log("");
    this.log(
      "Run `ably logs push COMMAND --help` for more information on a command.",
    );
  }
}
