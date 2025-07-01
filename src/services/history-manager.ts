import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as readline from 'node:readline';

export class HistoryManager {
  private historyFile: string;
  private maxHistorySize = 1000;
  
  constructor(historyFile?: string) {
    this.historyFile = historyFile || process.env.ABLY_HISTORY_FILE || 
                       path.join(os.homedir(), '.ably', 'history');
  }
  
  async loadHistory(rl: readline.Interface): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      if (!fs.existsSync(this.historyFile)) {
        if (process.env.ABLY_DEBUG_KEYS === 'true') {
          console.error(`[DEBUG] History file does not exist: ${this.historyFile}`);
        }
        return;
      }
      
      const history = fs.readFileSync(this.historyFile, 'utf8')
        .split('\n')
        .filter(line => line.trim())
        .slice(-this.maxHistorySize);
      
      // Access internal history
      // Note: This is accessing private property, but it's the only way
      // to populate history in Node.js readline
      const internalRl = rl as readline.Interface & {history?: string[]};
      internalRl.history = history.reverse();
      
      if (process.env.ABLY_DEBUG_KEYS === 'true') {
        console.error(`[DEBUG] Loaded ${history.length} history items from ${this.historyFile}`);
        console.error(`[DEBUG] First few history items:`, history.slice(0, 3));
      }
    } catch (error) {
      if (process.env.ABLY_DEBUG_KEYS === 'true') {
        console.error(`[DEBUG] Error loading history:`, error);
      }
      // Silently ignore history load errors
      // History is a nice-to-have feature, shouldn't break the shell
    }
  }
  
  async saveCommand(command: string): Promise<void> {
    if (!command.trim()) return;
    
    try {
      // Ensure directory exists
      const dir = path.dirname(this.historyFile);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.appendFileSync(this.historyFile, command + '\n');
      
      // Trim history file if too large
      const lines = fs.readFileSync(this.historyFile, 'utf8').split('\n');
      if (lines.length > this.maxHistorySize * 2) {
        const trimmed = lines
          .filter(line => line.trim())
          .slice(-this.maxHistorySize)
          .join('\n') + '\n';
        fs.writeFileSync(this.historyFile, trimmed);
      }
    } catch {
      // Silently ignore history save errors
      // History is a nice-to-have feature, shouldn't break the shell
    }
  }

  getHistoryFile(): string {
    return this.historyFile;
  }
}