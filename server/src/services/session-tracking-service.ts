import { 
  MAX_ANONYMOUS_SESSIONS,
  MAX_AUTHENTICATED_SESSIONS,
  MAX_SESSIONS,
  isAuthenticatedSession,
  getSessionLimit,
  getSessionType
} from "../config/server-config.js";
import { logSecure } from "../utils/logger.js";

// =============================================================================
// SESSION TRACKING DATA STRUCTURES
// =============================================================================

interface SessionMetrics {
  anonymous: number;
  authenticated: number;
  total: number;
}

// Track sessions by type
const anonymousSessions = new Set<string>();
const authenticatedSessions = new Set<string>();

// =============================================================================
// SESSION LIMIT MANAGEMENT
// =============================================================================

/**
 * Check if a new session can be created based on authentication status
 */
export function canCreateSession(accessToken?: string): {
  allowed: boolean;
  reason?: string;
  sessionType: string;
  currentCount: number;
  limit: number;
} {
  const isAuthenticated = isAuthenticatedSession(accessToken);
  const sessionType = getSessionType(isAuthenticated);
  const limit = getSessionLimit(isAuthenticated);
  
  const currentCount = isAuthenticated ? authenticatedSessions.size : anonymousSessions.size;
  const totalSessions = anonymousSessions.size + authenticatedSessions.size;

  // Check total session limit first (legacy compatibility)
  if (totalSessions >= MAX_SESSIONS) {
    return {
      allowed: false,
      reason: `Total session limit reached (${totalSessions}/${MAX_SESSIONS})`,
      sessionType,
      currentCount,
      limit
    };
  }

  // Check specific session type limit
  if (currentCount >= limit) {
    return {
      allowed: false,
      reason: `${sessionType} session limit reached (${currentCount}/${limit})`,
      sessionType,
      currentCount,
      limit
    };
  }

  return {
    allowed: true,
    sessionType,
    currentCount,
    limit
  };
}

/**
 * Register a new session
 */
export function registerSession(sessionId: string, accessToken?: string): boolean {
  const isAuthenticated = isAuthenticatedSession(accessToken);
  const sessionType = getSessionType(isAuthenticated);
  
  // Double-check limits before registering
  const canCreate = canCreateSession(accessToken);
  if (!canCreate.allowed) {
    logSecure("Session registration denied", {
      sessionId: sessionId.slice(0, 8),
      sessionType,
      reason: canCreate.reason
    });
    return false;
  }

  // Register the session
  if (isAuthenticated) {
    authenticatedSessions.add(sessionId);
  } else {
    anonymousSessions.add(sessionId);
  }

  logSecure("Session registered", {
    sessionId: sessionId.slice(0, 8),
    sessionType,
    currentCount: canCreate.currentCount + 1,
    limit: canCreate.limit,
    totalSessions: anonymousSessions.size + authenticatedSessions.size
  });

  return true;
}

/**
 * Unregister a session
 */
export function unregisterSession(sessionId: string): void {
  const wasAuthenticated = authenticatedSessions.has(sessionId);
  const wasAnonymous = anonymousSessions.has(sessionId);

  if (wasAuthenticated) {
    authenticatedSessions.delete(sessionId);
    logSecure("Authenticated session unregistered", {
      sessionId: sessionId.slice(0, 8),
      remainingAuthenticated: authenticatedSessions.size,
      totalSessions: anonymousSessions.size + authenticatedSessions.size
    });
  } else if (wasAnonymous) {
    anonymousSessions.delete(sessionId);
    logSecure("Anonymous session unregistered", {
      sessionId: sessionId.slice(0, 8),
      remainingAnonymous: anonymousSessions.size,
      totalSessions: anonymousSessions.size + authenticatedSessions.size
    });
  } else {
    logSecure("Session not found in tracking", {
      sessionId: sessionId.slice(0, 8)
    });
  }
}

/**
 * Update session authentication status (for late authentication scenarios)
 */
export function updateSessionAuthentication(sessionId: string, accessToken?: string): boolean {
  const isAuthenticated = isAuthenticatedSession(accessToken);
  const wasAuthenticated = authenticatedSessions.has(sessionId);
  const wasAnonymous = anonymousSessions.has(sessionId);

  // If already in correct category, no change needed
  if (isAuthenticated && wasAuthenticated) {
    return true;
  }
  if (!isAuthenticated && wasAnonymous) {
    return true;
  }

  // If session not tracked, log warning but don't fail
  if (!wasAuthenticated && !wasAnonymous) {
    logSecure("Attempting to update authentication for untracked session", {
      sessionId: sessionId.slice(0, 8)
    });
    return false;
  }

  // Check if move is allowed
  if (isAuthenticated) {
    // Moving from anonymous to authenticated
    if (authenticatedSessions.size >= MAX_AUTHENTICATED_SESSIONS) {
      logSecure("Cannot upgrade to authenticated - limit reached", {
        sessionId: sessionId.slice(0, 8),
        authenticatedCount: authenticatedSessions.size,
        limit: MAX_AUTHENTICATED_SESSIONS
      });
      return false;
    }

    // Move session
    anonymousSessions.delete(sessionId);
    authenticatedSessions.add(sessionId);
    
    logSecure("Session upgraded to authenticated", {
      sessionId: sessionId.slice(0, 8),
      authenticatedCount: authenticatedSessions.size,
      anonymousCount: anonymousSessions.size
    });
  } else {
    // Moving from authenticated to anonymous (unlikely but possible)
    if (anonymousSessions.size >= MAX_ANONYMOUS_SESSIONS) {
      logSecure("Cannot downgrade to anonymous - limit reached", {
        sessionId: sessionId.slice(0, 8),
        anonymousCount: anonymousSessions.size,
        limit: MAX_ANONYMOUS_SESSIONS
      });
      return false;
    }

    // Move session
    authenticatedSessions.delete(sessionId);
    anonymousSessions.add(sessionId);
    
    logSecure("Session downgraded to anonymous", {
      sessionId: sessionId.slice(0, 8),
      authenticatedCount: authenticatedSessions.size,
      anonymousCount: anonymousSessions.size
    });
  }

  return true;
}

// =============================================================================
// MONITORING & STATISTICS
// =============================================================================

/**
 * Get current session metrics
 */
export function getSessionMetrics(): SessionMetrics {
  return {
    anonymous: anonymousSessions.size,
    authenticated: authenticatedSessions.size,
    total: anonymousSessions.size + authenticatedSessions.size
  };
}

/**
 * Get detailed session statistics
 */
export function getSessionStatistics(): {
  current: SessionMetrics;
  limits: {
    anonymous: number;
    authenticated: number;
    total: number;
  };
  utilization: {
    anonymous: number; // percentage
    authenticated: number; // percentage
    total: number; // percentage
  };
} {
  const current = getSessionMetrics();
  
  return {
    current,
    limits: {
      anonymous: MAX_ANONYMOUS_SESSIONS,
      authenticated: MAX_AUTHENTICATED_SESSIONS,
      total: MAX_SESSIONS
    },
    utilization: {
      anonymous: MAX_ANONYMOUS_SESSIONS > 0 ? Math.round((current.anonymous / MAX_ANONYMOUS_SESSIONS) * 100) : 0,
      authenticated: MAX_AUTHENTICATED_SESSIONS > 0 ? Math.round((current.authenticated / MAX_AUTHENTICATED_SESSIONS) * 100) : 0,
      total: MAX_SESSIONS > 0 ? Math.round((current.total / MAX_SESSIONS) * 100) : 0
    }
  };
}

/**
 * Check if sessions are close to limits (for monitoring alerts)
 */
export function getSessionAlerts(): {
  anonymousNearLimit: boolean;
  authenticatedNearLimit: boolean;
  totalNearLimit: boolean;
  alerts: string[];
} {
  const current = getSessionMetrics();
  const alerts: string[] = [];
  
  const anonymousUtilization = MAX_ANONYMOUS_SESSIONS > 0 ? (current.anonymous / MAX_ANONYMOUS_SESSIONS) : 0;
  const authenticatedUtilization = MAX_AUTHENTICATED_SESSIONS > 0 ? (current.authenticated / MAX_AUTHENTICATED_SESSIONS) : 0;
  const totalUtilization = MAX_SESSIONS > 0 ? (current.total / MAX_SESSIONS) : 0;
  
  const anonymousNearLimit = anonymousUtilization >= 0.8; // 80% threshold
  const authenticatedNearLimit = authenticatedUtilization >= 0.8;
  const totalNearLimit = totalUtilization >= 0.8;
  
  if (anonymousNearLimit) {
    alerts.push(`Anonymous sessions at ${Math.round(anonymousUtilization * 100)}% capacity (${current.anonymous}/${MAX_ANONYMOUS_SESSIONS})`);
  }
  
  if (authenticatedNearLimit) {
    alerts.push(`Authenticated sessions at ${Math.round(authenticatedUtilization * 100)}% capacity (${current.authenticated}/${MAX_AUTHENTICATED_SESSIONS})`);
  }
  
  if (totalNearLimit) {
    alerts.push(`Total sessions at ${Math.round(totalUtilization * 100)}% capacity (${current.total}/${MAX_SESSIONS})`);
  }
  
  return {
    anonymousNearLimit,
    authenticatedNearLimit,
    totalNearLimit,
    alerts
  };
}

/**
 * Clear all session tracking (for testing or reset scenarios)
 */
export function clearAllSessionTracking(): void {
  const beforeCount = anonymousSessions.size + authenticatedSessions.size;
  
  anonymousSessions.clear();
  authenticatedSessions.clear();
  
  logSecure("All session tracking cleared", {
    previousTotal: beforeCount
  });
}

/**
 * Validate session tracking consistency
 */
export function validateSessionTracking(): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check for duplicate sessions across categories
  for (const sessionId of anonymousSessions) {
    if (authenticatedSessions.has(sessionId)) {
      issues.push(`Session ${sessionId.slice(0, 8)} exists in both anonymous and authenticated sets`);
    }
  }
  
  // Check for negative session counts (shouldn't be possible but good to verify)
  if (anonymousSessions.size < 0) {
    issues.push(`Negative anonymous session count: ${anonymousSessions.size}`);
  }
  
  if (authenticatedSessions.size < 0) {
    issues.push(`Negative authenticated session count: ${authenticatedSessions.size}`);
  }
  
  // Check for session count exceeding limits
  if (anonymousSessions.size > MAX_ANONYMOUS_SESSIONS) {
    issues.push(`Anonymous sessions exceed limit: ${anonymousSessions.size} > ${MAX_ANONYMOUS_SESSIONS}`);
  }
  
  if (authenticatedSessions.size > MAX_AUTHENTICATED_SESSIONS) {
    issues.push(`Authenticated sessions exceed limit: ${authenticatedSessions.size} > ${MAX_AUTHENTICATED_SESSIONS}`);
  }
  
  const total = anonymousSessions.size + authenticatedSessions.size;
  if (total > MAX_SESSIONS) {
    issues.push(`Total sessions exceed limit: ${total} > ${MAX_SESSIONS}`);
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
} 