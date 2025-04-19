import { Command } from "@oclif/core";

export default class SpacesLocationsIndex extends Command {
  static override description =
    "Commands for location management in Ably Spaces";

  static override examples = [
    "$ ably spaces locations set my-space",
    "$ ably spaces locations subscribe my-space",
    "$ ably spaces locations get-all my-space",
    "$ ably spaces locations clear my-space",
  ];

  async run(): Promise<void> {
    this.log("Ably Spaces locations commands:");
    this.log("");
    this.log(
      "  ably spaces locations set        - Set location for a client in the space",
    );
    this.log(
      "  ably spaces locations subscribe  - Subscribe to location updates in a space",
    );
    this.log(
      "  ably spaces locations get-all    - Get all current locations in a space",
    );
    this.log(
      "  ably spaces locations clear      - Clear location for the current client",
    );
    this.log("");
    this.log(
      "Run `ably spaces locations COMMAND --help` for more information on a command.",
    );
  }
}
