# Server-Side Rate Limit Error Implementation Guide

## Problem
Currently, when the server rejects a WebSocket connection due to rate limiting, it immediately closes the connection without sending any error message to the client. This results in the client showing a generic "Connection Failed" error instead of informing users about the rate limit.

## Solution
The server should send a WebSocket close frame with code 4003 and a descriptive reason before closing the connection.

## Implementation Steps

### 1. Update WebSocket Connection Handler

In the file that handles WebSocket connections (likely `server.js` or `websocket-handler.js`), find where rate limit checking occurs:

```javascript
// Current implementation (based on logs):
if (rateLimiter.isBlocked(clientIP)) {
  logger.info('Connection rejected due to IP rate limiting', { ip: clientIP });
  ws.close(); // Immediate close without explanation
  return;
}
```

Change to:

```javascript
// Improved implementation:
if (rateLimiter.isBlocked(clientIP)) {
  const blockedFor = rateLimiter.getBlockedTime(clientIP);
  const reason = `Rate limit exceeded. Please wait ${Math.ceil(blockedFor)} seconds before reconnecting.`;
  
  logger.info('Connection rejected due to IP rate limiting', { 
    ip: clientIP, 
    blockedFor,
    reason 
  });
  
  // Send close frame with rate limit error code and reason
  ws.close(4003, reason);
  return;
}
```

### 2. Define Custom Close Codes

Add a constants file or section for WebSocket close codes:

```javascript
// websocket-codes.js or similar
export const WS_CLOSE_CODES = {
  NORMAL: 1000,
  GOING_AWAY: 1001,
  PROTOCOL_ERROR: 1002,
  UNSUPPORTED_DATA: 1003,
  // ... standard codes ...
  
  // Custom application codes (4000-4999)
  GENERIC_ERROR: 4000,
  POLICY_VIOLATION: 4001,
  SESSION_RESUME_REJECTED: 4002,
  RATE_LIMIT_EXCEEDED: 4003,
  UNSUPPORTED_PROTOCOL_VERSION: 4004,
  TOKEN_EXPIRED: 4008,
  SERVER_AT_CAPACITY: 4009,
};
```

### 3. Update Rate Limiter to Provide Remaining Time

Ensure the rate limiter can provide information about how long until the rate limit resets:

```javascript
class RateLimiter {
  // ... existing code ...
  
  getBlockedTime(ip) {
    const entry = this.ipEntries.get(ip);
    if (!entry) return 0;
    
    const now = Date.now();
    const windowEnd = entry.firstConnectionTime + this.windowMs;
    const remainingMs = Math.max(0, windowEnd - now);
    
    return remainingMs / 1000; // Return seconds
  }
}
```

### 4. Handle Different Rate Limit Scenarios

Consider different types of rate limits:

```javascript
// For IP-based rate limits
if (rateLimiter.isIPBlocked(clientIP)) {
  const blockedFor = rateLimiter.getIPBlockedTime(clientIP);
  ws.close(4003, `IP rate limit: ${Math.ceil(blockedFor)}s cooldown`);
  return;
}

// For session resumption rate limits
if (sessionId && rateLimiter.isSessionBlocked(sessionId)) {
  const blockedFor = rateLimiter.getSessionBlockedTime(sessionId);
  ws.close(4003, `Session rate limit: ${Math.ceil(blockedFor)}s cooldown`);
  return;
}

// For global capacity limits
if (isServerAtCapacity()) {
  ws.close(4009, 'Server at capacity. Please try again later.');
  return;
}
```

### 5. Differentiate Between New Sessions and Resumptions

As suggested, implement more lenient rate limits for session resumptions:

```javascript
class RateLimiter {
  constructor() {
    // Different limits for different operations
    this.limits = {
      newSession: {
        maxPerWindow: 10,
        windowMs: 60000, // 1 minute
      },
      resumeSession: {
        maxPerWindow: 50, // Much more lenient
        windowMs: 60000,
      },
      global: {
        maxPerWindow: 1000,
        windowMs: 60000,
      }
    };
  }
  
  checkLimit(ip, operation = 'newSession') {
    const limit = this.limits[operation];
    // ... check against appropriate limit ...
  }
}

// In connection handler:
const isResume = authPayload.sessionId !== undefined;
const operation = isResume ? 'resumeSession' : 'newSession';

if (!rateLimiter.checkLimit(clientIP, operation)) {
  const blockedFor = rateLimiter.getBlockedTime(clientIP, operation);
  const message = isResume 
    ? `Session resume rate limit: ${Math.ceil(blockedFor)}s cooldown`
    : `New session rate limit: ${Math.ceil(blockedFor)}s cooldown`;
  ws.close(4003, message);
  return;
}
```

## Testing

### 1. Local Testing with Restrictive Limits

Create a test configuration:

```javascript
// config/test.js
export default {
  rateLimits: {
    newSession: {
      maxPerWindow: 2,  // Very restrictive for testing
      windowMs: 30000,  // 30 seconds
    },
    resumeSession: {
      maxPerWindow: 5,
      windowMs: 30000,
    }
  }
};
```

### 2. Test Script

```bash
#!/bin/bash
# test-rate-limits.sh

echo "Testing rate limits..."

# Test new session rate limit
for i in {1..5}; do
  echo "Attempt $i:"
  wscat -c ws://localhost:3000 &
  sleep 0.5
done

# Wait and check logs
sleep 5
echo "Check server logs for rate limit messages"
```

### 3. Unit Tests

```javascript
// test/rate-limiter.test.js
describe('RateLimiter', () => {
  it('should send proper close code for rate limited connections', async () => {
    const ws = new MockWebSocket();
    const rateLimiter = new RateLimiter({ maxPerWindow: 1, windowMs: 1000 });
    
    // First connection succeeds
    await handleConnection(ws, '192.168.1.1', rateLimiter);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    
    // Second connection should be rate limited
    const ws2 = new MockWebSocket();
    await handleConnection(ws2, '192.168.1.1', rateLimiter);
    
    expect(ws2.closeCode).toBe(4003);
    expect(ws2.closeReason).toMatch(/rate limit/i);
  });
});
```

## Recommended Rate Limits

Based on the ease of hitting limits, here are recommended values:

```javascript
const RATE_LIMITS = {
  // IP-based limits
  ip: {
    newSession: {
      maxPerWindow: 20,    // 20 new sessions per minute
      windowMs: 60000,     // 1 minute window
      blockDurationMs: 120000, // 2 minute block after exceeded
    },
    resumeSession: {
      maxPerWindow: 100,   // 100 resume attempts per minute
      windowMs: 60000,     // 1 minute window
      blockDurationMs: 60000,  // 1 minute block after exceeded
    }
  },
  
  // Global limits
  global: {
    maxConcurrentSessions: 1000,
    maxNewSessionsPerMinute: 500,
  },
  
  // Per-session limits
  session: {
    maxReconnectsPerHour: 100,  // Prevent session hijacking attempts
  }
};
```

## Additional Considerations

1. **Grace Period for Resumes**: When a session disconnects unexpectedly, allow immediate reconnection without counting against rate limit.

2. **Trusted IPs**: Consider allowing certain IPs (like monitoring services) to bypass rate limits.

3. **Gradual Backoff**: Instead of hard blocks, implement increasing delays:
   ```javascript
   const delay = Math.min(baseDelay * Math.pow(2, attempts), maxDelay);
   ```

4. **Clear Error Messages**: Always include:
   - What limit was exceeded
   - How long to wait
   - Why the limit exists

5. **Monitoring**: Add metrics for:
   - Rate limit hits by type
   - False positive rate
   - User impact

This implementation will ensure users get clear feedback when they hit rate limits, improving the user experience significantly.