/**
 * Enhanced logging utility with structured logging, security features, and audit capabilities
 */

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  AUDIT = 4  // Special level for security audit events
}

// Current log level (can be configured via environment variable)
const currentLogLevel = process.env.LOG_LEVEL ? 
  Number.parseInt(process.env.LOG_LEVEL) : 
  (process.env.NODE_ENV === 'development' ? LogLevel.DEBUG : LogLevel.INFO);

// Audit log enabled by default in production
const auditEnabled = process.env.AUDIT_LOGGING !== 'false';

interface LogContext {
  sessionId?: string;
  userIp?: string;
  userAgent?: string;
  action?: string;
  resource?: string;
  timestamp?: string;
  pid?: number;
  memory?: NodeJS.MemoryUsage;
  [key: string]: any;
}

interface AuditEvent extends LogContext {
  event: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  userId?: string;
  success: boolean;
  details?: string;
}

/**
 * Core logging function with level filtering and structured output
 */
function logWithLevel(level: LogLevel, message: string, context?: LogContext): void {
  if (level > currentLogLevel) {
    return; // Skip if log level is below threshold
  }

  const timestamp = new Date().toISOString();
  const levelName = LogLevel[level];
  
  const logEntry = {
    timestamp,
    level: levelName,
    message,
    ...context
  };

  // Add process info for debugging
  if (level === LogLevel.DEBUG) {
    logEntry.pid = process.pid;
    logEntry.memory = process.memoryUsage();
  }

  // Output based on level
  if (level === LogLevel.ERROR) {
    console.error(JSON.stringify(logEntry));
  } else if (level === LogLevel.WARN) {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

/**
 * Legacy function - maintained for backwards compatibility
 */
export function log(message: string): void {
  logWithLevel(LogLevel.INFO, message);
}

/**
 * Legacy function - maintained for backwards compatibility
 */
export function logError(message: string): void {
  logWithLevel(LogLevel.ERROR, message);
}

/**
 * Enhanced secure logging function with automatic redaction and structured data
 */
export function logSecure(message: string, context?: Record<string, any>): void {
  if (!context) {
    logWithLevel(LogLevel.INFO, message);
    return;
  }

  // Create a sanitized copy of the context for logging
  const sanitizedContext = sanitizeLogData(context);
  logWithLevel(LogLevel.INFO, message, sanitizedContext);
}

/**
 * Structured logging functions for different levels
 */
export function logInfo(message: string, context?: LogContext): void {
  logWithLevel(LogLevel.INFO, message, context);
}

export function logWarn(message: string, context?: LogContext): void {
  logWithLevel(LogLevel.WARN, message, context);
}

export function logDebug(message: string, context?: LogContext): void {
  logWithLevel(LogLevel.DEBUG, message, context);
}

export function logErrorWithContext(message: string, error?: Error, context?: LogContext): void {
  const errorContext = {
    ...context,
    error: error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : undefined
  };
  
  logWithLevel(LogLevel.ERROR, message, errorContext);
}

/**
 * Audit logging for security-sensitive events
 */
export function logAudit(event: AuditEvent): void {
  if (!auditEnabled) {
    return;
  }

  const auditEntry = {
    ...event,
    timestamp: event.timestamp || new Date().toISOString(),
    type: 'AUDIT',
    // Always include these fields for audit compliance
    environment: process.env.NODE_ENV || 'unknown',
    service: 'ably-terminal-server'
  };

  // Sanitize audit data to prevent sensitive information leakage
  const sanitizedAudit = sanitizeLogData(auditEntry);
  
  // Audit logs always go to console regardless of log level
  console.log(JSON.stringify(sanitizedAudit));

  // In production, you might want to send audit logs to a separate system
  if (process.env.NODE_ENV === 'production' && process.env.AUDIT_WEBHOOK_URL) {
    // This could be extended to send to external audit systems
    sendToAuditSystem(sanitizedAudit);
  }
}

/**
 * Log security events with predefined severity levels
 */
export function logSecurityEvent(
  event: string, 
  success: boolean, 
  context?: LogContext,
  severity: AuditEvent['severity'] = 'medium'
): void {
  logAudit({
    event,
    success,
    severity,
    ...context
  });
}

/**
 * Sanitize log data by redacting sensitive information
 */
function sanitizeLogData(data: Record<string, any>): Record<string, any> {
  const sanitized = { ...data };
  
  // List of sensitive field patterns (case-insensitive)
  const sensitivePatterns = [
    /token/i,
    /key/i,
    /secret/i,
    /password/i,
    /credential/i,
    /auth/i,
    /bearer/i,
    /authorization/i,
    /session/i
  ];

  for (const [key, value] of Object.entries(sanitized)) {
    const isSensitive = sensitivePatterns.some(pattern => pattern.test(key));
    
    if (isSensitive && typeof value === 'string') {
      if (value.length > 10) {
        // Show first 3 characters for debugging, rest as asterisks
        sanitized[key] = `${value.slice(0, 3)}${'*'.repeat(Math.min(value.length - 3, 8))}`;
      } else {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    // Recursively sanitize nested objects
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitized[key] = sanitizeLogData(value);
    }
    
    // Truncate very long strings to prevent log bloat
    if (typeof value === 'string' && value.length > 1000) {
      sanitized[key] = `${value.slice(0, 200)}...[truncated ${value.length - 200} characters]`;
    }
  }
  
  return sanitized;
}

/**
 * Create session-specific logger with automatic context injection
 */
export function createSessionLogger(sessionId: string, userIp?: string, userAgent?: string) {
  const sessionContext = {
    sessionId,
    userIp,
    userAgent: userAgent ? userAgent.slice(0, 100) : undefined // Truncate user agent
  };

  return {
    info: (message: string, context?: LogContext) => 
      logInfo(message, { ...sessionContext, ...context }),
    
    warn: (message: string, context?: LogContext) => 
      logWarn(message, { ...sessionContext, ...context }),
    
    error: (message: string, error?: Error, context?: LogContext) => 
      logErrorWithContext(message, error, { ...sessionContext, ...context }),
    
    debug: (message: string, context?: LogContext) => 
      logDebug(message, { ...sessionContext, ...context }),
    
    audit: (event: string, success: boolean, severity: AuditEvent['severity'] = 'medium', context?: LogContext) =>
      logSecurityEvent(event, success, { ...sessionContext, ...context }, severity)
  };
}

/**
 * Send audit events to external systems (placeholder for future implementation)
 */
function sendToAuditSystem(auditEvent: any): void {
  // This is a placeholder for sending audit events to external systems
  // Implementation would depend on the specific audit system being used
  // Examples: Elasticsearch, Splunk, AWS CloudWatch, etc.
  
  if (process.env.NODE_ENV === 'development') {
    logDebug('Audit event would be sent to external system', { auditEvent });
  }
}

/**
 * Performance logging utility
 */
export function logPerformance(operation: string, duration: number, context?: LogContext): void {
  logInfo(`Performance: ${operation}`, {
    ...context,
    operation,
    duration_ms: duration,
    performance: true
  });
} 