/**
 * Simple hash function for credential validation
 * Uses a basic string hash algorithm suitable for browser environments
 * This is not cryptographically secure but sufficient for credential validation
 */
export async function hashCredentials(apiKey?: string, accessToken?: string): Promise<string> {
  const input = `${apiKey || ''}:${accessToken || ''}`;
  
  // Use Web Crypto API if available
  if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(input);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      // Fall back to simple hash if Web Crypto fails
    }
  }
  
  // Simple fallback hash function
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(16);
}