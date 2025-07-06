import { Flags } from "@oclif/core";
import { AblyBaseCommand } from "../../base-command.js";

export default class TestWait extends AblyBaseCommand {
  static override description = "Test command that waits for a specified duration";
  
  static override hidden = true; // Hide from help
  
  static override examples = [
    "$ ably test:wait --duration 10",
    "$ ably test:wait -d 5",
  ];

  static override flags = {
    duration: Flags.integer({
      char: 'd',
      description: 'Duration to wait in seconds',
      required: true,
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(TestWait);
    
    this.log(`Waiting for ${flags.duration} seconds. Press Ctrl+C to interrupt...`);
    
    
    // Use a simple promise with timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        this.log("Wait completed successfully.");
        resolve();
      }, flags.duration * 1000);
      
      // Handle cleanup on interrupt
      const cleanup = () => {
        clearTimeout(timeout);
        resolve();
      };
      
      process.once('SIGINT', cleanup);
      process.once('SIGTERM', cleanup);
    });
  }
}