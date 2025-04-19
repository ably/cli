import { Command } from "@oclif/core";

import ChannelRulesList from "../apps/channel-rules/list.js";

export default class ChannelRuleList extends Command {
  static override args = ChannelRulesList.args;
  static override description = 'Alias for "ably apps channel-rules list"';
  static override flags = ChannelRulesList.flags;
  static override hidden = true;

  // Special property to identify this as an alias command
  static isAlias = true;

  async run(): Promise<void> {
    // Forward to the channel-rules list command
    const command = new ChannelRulesList(this.argv, this.config);
    await command.run();
  }
}
