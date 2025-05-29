import * as jwt from "jsonwebtoken";
import * as crypto from "node:crypto";
import { logSecure, logError } from "../utils/logger.js";

/**
 * Create a secure hash of sensitive data for logging purposes
 */
function createSecureHash(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').slice(0, 12);
}

/**
 * Securely purge sensitive string from memory (best effort)
 * Note: JavaScript strings are immutable, so this is primarily about 
 * removing references and triggering garbage collection
 */
function purgeFromMemory(obj: any, key: string): void {
  if (obj && typeof obj[key] === 'string') {
    // Since strings are immutable in JavaScript, we can't actually overwrite memory
    // But we can remove the reference and encourage garbage collection
    const originalValue = obj[key];
    delete obj[key];
    
    // Set to undefined to help GC
    obj[key] = undefined;
    delete obj[key];
    
    // Create some temporary objects to encourage garbage collection
    // This is a best-effort approach to memory security
    for (let i = 0; i < 10; i++) {
      const _temp = crypto.randomBytes(originalValue.length);
    }
  }
}

export function isValidToken(token: string): boolean {
  if (!token || typeof token !== "string") {
    logError("Token validation failed: Token is missing or not a string.");
    return false;
  }

  // Create a hash of the token for secure logging (instead of logging prefix)
  const tokenHash = createSecureHash(token);

  // Basic JWT structure check (three parts separated by dots)
  if (token.split(".").length !== 3) {
    logSecure("Token validation failed: Invalid JWT structure.", { tokenHash });
    return false;
  }

  try {
    // Decode the token without verification to check payload
    const decoded = jwt.decode(token);

    if (!decoded || typeof decoded !== "object") {
      logSecure("Token validation failed: Could not decode token payload.", { tokenHash });
      return false;
    }

    // Check for expiration claim (exp)
    if (typeof decoded.exp !== "number") {
      logSecure("Token validation failed: Missing or invalid expiration claim (exp).", { tokenHash });
      // Allow tokens without expiry for now, but log it.
      // Consider making this stricter if Control API tokens always have expiry.
      logSecure("Warning: Provided token does not have a standard expiration claim.", { tokenHash });
      return true; // Allow for now
    }

    // Check if the token is expired
    const nowInSeconds = Date.now() / 1000;
    if (decoded.exp < nowInSeconds) {
      logSecure("Token validation failed: Token has expired.", { 
        tokenHash, 
        expiry: new Date(decoded.exp * 1000).toISOString() 
      });
      return false;
    }

    logSecure("Token structure and expiry check passed.", { 
      tokenHash, 
      expiry: new Date(decoded.exp * 1000).toISOString() 
    });
    return true;
  } catch (error: unknown) {
    logSecure("Token validation failed with unexpected decoding error.", { 
      tokenHash, 
      error: String(error) 
    });
    return false;
  }
}

/**
 * Securely validate and then purge credentials from memory
 * Returns the credential hash for session tracking
 */
export function validateAndPurgeCredentials(
  authPayload: { apiKey?: string; accessToken?: string; [key: string]: any }
): { valid: boolean; credentialHash?: string } {
  try {
    const hasApiKey = typeof authPayload.apiKey === 'string' && authPayload.apiKey.trim().length > 0;
    const hasAccessToken = typeof authPayload.accessToken === 'string' && authPayload.accessToken.trim().length > 0;

    // If neither credential is supplied, return invalid
    if (!hasApiKey && !hasAccessToken) {
      logError("No credentials supplied in auth payload.");
      return { valid: false };
    }

    let tokenValid = true;
    
    // If an access token is supplied and looks like a JWT, validate it
    if (hasAccessToken && authPayload.accessToken!.split('.').length === 3) {
      tokenValid = isValidToken(authPayload.accessToken!);
    }

    if (!tokenValid) {
      // Purge invalid credentials from memory
      purgeFromMemory(authPayload, 'apiKey');
      purgeFromMemory(authPayload, 'accessToken');
      return { valid: false };
    }

    // Create credential hash before purging
    const credentialHash = crypto.createHash('sha256')
      .update(`${authPayload.apiKey ?? ''}|${authPayload.accessToken ?? ''}`)
      .digest('hex');

    // Log successful validation with secure hash
    logSecure("Credentials validated successfully.", { 
      credentialHash: credentialHash.slice(0, 12) + '...',
      hasApiKey: Boolean(hasApiKey),
      hasAccessToken: Boolean(hasAccessToken)
    });

    // Purge credentials from memory after validation
    purgeFromMemory(authPayload, 'apiKey');
    purgeFromMemory(authPayload, 'accessToken');

    return { valid: true, credentialHash };
  } catch (error) {
    logError(`Error during credential validation: ${String(error)}`);
    // Ensure cleanup even on error
    purgeFromMemory(authPayload, 'apiKey');
    purgeFromMemory(authPayload, 'accessToken');
    return { valid: false };
  }
} 