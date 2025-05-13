import { AblyBaseCommand } from "../base-command.js";
import { getVersionInfo, formatVersionString, formatVersionJson } from "../utils/version.js";

export default class Version extends AblyBaseCommand {
  static description = "Display CLI version information";
  static examples = ["<%= config.bin %> version", "<%= config.bin %> version --json"];

  // Hide this command from help output (users should use --version flag instead)
  static hidden = true;

  // Import global flags (like --json and --pretty-json)
  static flags = {
    ...AblyBaseCommand.globalFlags,
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Version);

    // Get CLI version information using the shared utility
    const versionInfo = getVersionInfo(this.config);

    // Check if output should be in JSON format
    if (this.shouldOutputJson(flags)) {
      this.log(formatVersionJson(versionInfo, Boolean(flags["pretty-json"])));
    } else {
      // Use shared string formatting
      this.log(formatVersionString(this.config));
    }
  }
}
