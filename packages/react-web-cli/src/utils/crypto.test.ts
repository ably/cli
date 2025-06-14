import { describe, it, expect } from 'vitest';
import { hashCredentials } from './crypto.js';

describe('hashCredentials', () => {
  it('should generate consistent hashes for the same credentials', async () => {
    const hash1 = await hashCredentials('test-api-key', 'test-token');
    const hash2 = await hashCredentials('test-api-key', 'test-token');
    expect(hash1).toBe(hash2);
  });

  it('should generate different hashes for different API keys', async () => {
    const hash1 = await hashCredentials('api-key-1', 'test-token');
    const hash2 = await hashCredentials('api-key-2', 'test-token');
    expect(hash1).not.toBe(hash2);
  });

  it('should generate different hashes for different access tokens', async () => {
    const hash1 = await hashCredentials('test-api-key', 'token-1');
    const hash2 = await hashCredentials('test-api-key', 'token-2');
    expect(hash1).not.toBe(hash2);
  });

  it('should handle undefined API key', async () => {
    const hash1 = await hashCredentials(undefined, 'test-token');
    const hash2 = await hashCredentials(undefined, 'test-token');
    expect(hash1).toBe(hash2);
  });

  it('should handle undefined access token', async () => {
    const hash1 = await hashCredentials('test-api-key');
    const hash2 = await hashCredentials('test-api-key');
    expect(hash1).toBe(hash2);
  });

  it('should handle both undefined credentials', async () => {
    const hash1 = await hashCredentials();
    const hash2 = await hashCredentials();
    expect(hash1).toBe(hash2);
  });

  it('should treat empty string same as undefined', async () => {
    const hash1 = await hashCredentials('', '');
    const hash2 = await hashCredentials();
    expect(hash1).toBe(hash2);
  });

  it('should generate non-empty hash for valid credentials', async () => {
    const hash = await hashCredentials('test-api-key', 'test-token');
    expect(hash).toBeTruthy();
    expect(hash.length).toBeGreaterThan(0);
  });
});