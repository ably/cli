import * as crypto from 'node:crypto';

/**
 * Compute a deterministic SHA-256 hash of the credentials supplied during
 * authentication. We concatenate the apiKey and accessToken with a pipe so
 * that an empty value is still represented in the input string.
 */
export function computeCredentialHash(apiKey: string | undefined, accessToken: string | undefined): string {
  const input = `${apiKey ?? ''}|${accessToken ?? ''}`;
  return crypto.createHash('sha256').update(input).digest('hex');
} 