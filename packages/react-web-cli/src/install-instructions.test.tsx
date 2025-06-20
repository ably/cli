import { describe, test, expect } from 'vitest';
import { getConnectionMessage } from './connection-messages';

describe('Install Instructions', () => {
  test('all connection messages include npm install instructions', () => {
    const messageTypes = [
      'connectionFailed',
      'serverDisconnect', 
      'maxReconnects',
      'capacityReached',
      'connectionTimeout',
      'reconnectCancelled',
      'reconnectingWithInstall'
    ] as const;

    messageTypes.forEach(type => {
      const message = getConnectionMessage(type);
      
      // Verify structure
      expect(message).toHaveProperty('title');
      expect(message).toHaveProperty('lines');
      expect(Array.isArray(message.lines)).toBe(true);
      
      // Verify npm install instruction is present
      const hasNpmInstall = message.lines.some(line => 
        line.includes('npm install -g @ably/web-cli')
      );
      expect(hasNpmInstall).toBe(true);
      
      // Verify no pnpm or yarn instructions
      const hasPnpm = message.lines.some(line => line.includes('pnpm'));
      const hasYarn = message.lines.some(line => line.includes('yarn'));
      expect(hasPnpm).toBe(false);
      expect(hasYarn).toBe(false);
    });
  });

  test('connection messages have appropriate titles', () => {
    expect(getConnectionMessage('connectionFailed').title).toBe('CONNECTION FAILED');
    expect(getConnectionMessage('serverDisconnect').title).toBe('SERVER DISCONNECTED');
    expect(getConnectionMessage('maxReconnects').title).toBe('SERVICE UNAVAILABLE');
    expect(getConnectionMessage('capacityReached').title).toBe('AT CAPACITY');
    expect(getConnectionMessage('connectionTimeout').title).toBe('CONNECTION TIMEOUT');
    expect(getConnectionMessage('reconnectCancelled').title).toBe('RECONNECTION CANCELLED');
    expect(getConnectionMessage('reconnectingWithInstall').title).toBe('RECONNECTING');
  });

  test('reconnecting message has appropriate content', () => {
    const message = getConnectionMessage('reconnectingWithInstall');
    expect(message.lines).toContain('Reconnecting to Ably CLI server...');
    expect(message.lines).toContain('Having trouble? Install the CLI locally:');
    expect(message.lines).toContain('  npm install -g @ably/web-cli');
    expect(message.lines).toContain('Press ⏎ to cancel reconnection');
  });
});