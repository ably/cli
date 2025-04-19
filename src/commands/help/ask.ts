import { Args, Flags } from "@oclif/core";
import chalk from "chalk";
import ora from "ora";

import { ControlBaseCommand } from "../../control-base-command.js";
import { Conversation, HelpResponse } from "../../services/control-api.js";

export default class AskCommand extends ControlBaseCommand {
  static args = {
    question: Args.string({
      description: "The question to ask the Ably AI agent",
      required: true,
    }),
  };

  static description = "Ask a question to the Ably AI agent for help";

  static examples = [
    '<%= config.bin %> <%= command.id %> "How do I get started with Ably?"',
    '<%= config.bin %> <%= command.id %> "What are the available capabilities for tokens?"',
    '<%= config.bin %> <%= command.id %> --continue "Can you explain more about token capabilities?"',
  ];

  static flags = {
    ...ControlBaseCommand.globalFlags,
    continue: Flags.boolean({
      default: false,
      description: "Continue the previous conversation with the Ably AI agent",
    }),
    help: Flags.help({ char: "h" }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AskCommand);

    const controlApi = this.createControlApi(flags);
    const spinner = ora("Thinking...").start();

    try {
      let response: HelpResponse;
      const existingContext = this.configManager.getHelpContext();

      if (flags.continue) {
        // Continue the conversation using stored context
        if (existingContext) {
          // Convert configManager's format to ControlApi's Conversation type
          const conversation: Conversation = {
            messages: existingContext.conversation.messages,
          };
          response = await controlApi.askHelp(args.question, conversation);
        } else {
          spinner.stop();
          this.log(
            chalk.yellow(
              "No previous conversation found. Starting a new conversation.",
            ),
          );
          response = await controlApi.askHelp(args.question);
        }
      } else {
        // Start a new conversation, clear previous context
        this.configManager.clearHelpContext();
        response = await controlApi.askHelp(args.question);
      }

      spinner.stop();

      // Display the AI agent's answer
      // Convert markdown to styled terminal output
      // Process code blocks first
      const processedWithCodeBlocks = response.answer.replaceAll(
        /```(?:javascript|js|html)?\n([\S\s]*?)```/g,
        (_, codeContent) =>
          // Return the code block with each line highlighted in cyan
          codeContent
            .split("\n")
            .map((line: string) => chalk.green(`  ${line}`))
            .join("\n"),
      );

      // Then apply other markdown formatting
      const formattedAnswer = processedWithCodeBlocks
        .replaceAll(/\*\*(.*?)\*\*/g, (_, text) => chalk.bold(text))
        .replaceAll(/\*(.*?)\*/g, (_, text) => chalk.italic(text))
        .replaceAll(/`(.*?)`/g, (_, text) => chalk.green(text))
        .replaceAll(
          /\[(.*?)]\((.*?)\)/g,
          (_, text, url) => `${text} (${chalk.blueBright(url)})`,
        )
        .replaceAll(/^# (.*?)$/gm, (_, text) => chalk.bold.underline(text))
        .replaceAll(/^## (.*?)$/gm, (_, text) => chalk.bold(text))
        .replaceAll(/^### (.*?)$/gm, (_, text) => chalk.yellow(text));

      this.log(formattedAnswer);

      // Display the links section if there are links
      if (response.links && response.links.length > 0) {
        this.log("");
        this.log(chalk.bold("Helpful Links:"));
        for (const [index, link] of response.links.entries()) {
          this.log(
            `${index + 1}. ${chalk.cyan(link.title)} - ${chalk.blue(link.url)}`,
          );
        }
      }

      // Store the conversation for future reference
      this.configManager.storeHelpContext(args.question, response.answer);

      // Suggest continuing the conversation
      this.log("");
      this.log(chalk.italic("To ask a follow-up question, run:"));
      this.log(
        chalk.yellow.italic(
          `  $ ${this.config.bin} help ask --continue "Your follow-up question"`,
        ),
      );
    } catch (error) {
      spinner.fail("Failed to get a response from the Ably AI agent");
      if (error instanceof Error) {
        this.error(error.message);
      } else {
        this.error("An unknown error occurred");
      }
    }
  }
}
