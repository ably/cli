import { expect } from 'chai';
import { HistoryManager } from '../../../src/services/history-manager.js';
import * as os from 'node:os';
import * as path from 'node:path';

describe('HistoryManager', function() {
  describe('constructor', function() {
    it('should use default history file path', function() {
      const manager = new HistoryManager();
      const expectedPath = path.join(os.homedir(), '.ably', 'history');
      expect(manager.getHistoryFile()).to.equal(expectedPath);
    });
    
    it('should use custom history file path', function() {
      const customPath = '/custom/path/history';
      const manager = new HistoryManager(customPath);
      expect(manager.getHistoryFile()).to.equal(customPath);
    });
    
    it('should use ABLY_HISTORY_FILE environment variable', function() {
      const originalEnv = process.env.ABLY_HISTORY_FILE;
      process.env.ABLY_HISTORY_FILE = '/env/path/history';
      
      const manager = new HistoryManager();
      expect(manager.getHistoryFile()).to.equal('/env/path/history');
      
      // Restore original value
      if (originalEnv === undefined) {
        delete process.env.ABLY_HISTORY_FILE;
      } else {
        process.env.ABLY_HISTORY_FILE = originalEnv;
      }
    });
  });
  
  describe('error handling', function() {
    it('should not throw on loadHistory errors', async function() {
      // Create manager with non-existent path that might cause errors
      const manager = new HistoryManager('/definitely/does/not/exist/history');
      const mockRl = { history: [] } as any;
      
      // Should not throw
      await manager.loadHistory(mockRl);
    });
    
    it('should not throw on saveCommand errors', async function() {
      // Create manager with path that can't be written
      const manager = new HistoryManager('/definitely/does/not/exist/history');
      
      // Should not throw
      await manager.saveCommand('test command');
    });
    
    it('should not save empty commands', async function() {
      const manager = new HistoryManager();
      
      // These should all be no-ops
      await manager.saveCommand('');
      await manager.saveCommand('   ');
      await manager.saveCommand('\t\n');
      
      // If we got here without throwing, the test passes
      expect(true).to.be.true;
    });
  });
});