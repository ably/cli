import * as jwt from "jsonwebtoken";
import { log, logError } from "../utils/logger.js";

export function isValidToken(token: string): boolean {
  if (!token || typeof token !== "string") {
    logError("Token validation failed: Token is missing or not a string.");
    return false;
  }

  // Basic JWT structure check (three parts separated by dots)
  if (token.split(".").length !== 3) {
    logError("Token validation failed: Invalid JWT structure.");
    return false;
  }

  try {
    // Decode the token without verification to check payload
    const decoded = jwt.decode(token);

    if (!decoded || typeof decoded !== "object") {
      logError("Token validation failed: Could not decode token payload.");
      return false;
    }

    // Check for expiration claim (exp)
    if (typeof decoded.exp !== "number") {
      logError(
        "Token validation failed: Missing or invalid expiration claim (exp).",
      );
      // Allow tokens without expiry for now, but log it.
      // Consider making this stricter if Control API tokens always have expiry.
      log("Warning: Provided token does not have a standard expiration claim.");
      return true; // Allow for now
    }

    // Check if the token is expired
    const nowInSeconds = Date.now() / 1000;
    if (decoded.exp < nowInSeconds) {
      logError("Token validation failed: Token has expired.");
      return false;
    }

    log(
      `Token structure and expiry check passed for token starting with: ${token.slice(0, 10)}... (Expiry: ${new Date(decoded.exp * 1000).toISOString()})`,
    );
    return true;
  } catch (error: unknown) {
    logError(
      `Token validation failed with unexpected decoding error: ${String(error)}`,
    );
    return false;
  }
} 