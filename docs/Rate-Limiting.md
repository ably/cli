# Rate Limiting Documentation

This document describes the rate limiting mechanisms implemented in the Ably CLI Terminal Server to prevent abuse and ensure service stability.

## Overview

The terminal server implements multiple layers of rate limiting to protect against various types of abuse:

- **Session Resume Rate Limiting**: Prevents rapid session hijacking attempts
- **Connection Rate Limiting**: Limits concurrent connections per IP address
- **Command Execution Rate Limiting**: Prevents command spam within sessions
- **Resource-based Rate Limiting**: Limits based on container resource usage

## Session Resume Rate Limiting

### Purpose
Prevents attackers from rapidly attempting to resume sessions with different credentials, which could indicate session hijacking attempts.

### Configuration
```typescript
const RESUME_RATE_LIMIT = {
  maxAttempts: 3,           // Maximum resume attempts per time window
  windowMs: 60 * 1000,      // Time window in milliseconds (1 minute)
  cooldownMs: 5 * 60 * 1000 // Cooldown period after exceeding limit (5 minutes)
};
```

### Behavior
- Tracks resume attempts per session ID
- After 3 failed attempts within 1 minute, the session is blocked for 5 minutes
- Successful resume resets the counter
- Rate limit data is stored in memory (cleared on server restart)

### Environment Variables
```bash
# Customize resume rate limiting
RESUME_MAX_ATTEMPTS=3
RESUME_WINDOW_MS=60000
RESUME_COOLDOWN_MS=300000
```

### Monitoring
Rate limit violations are logged as audit events:
```json
{
  "type": "AUDIT",
  "event": "session_resume_rate_limited",
  "severity": "high",
  "sessionId": "abc123",
  "userIp": "192.168.1.100",
  "success": false,
  "details": "Too many resume attempts"
}
```

## Connection Rate Limiting

### Purpose
Prevents a single IP address from overwhelming the server with connection attempts.

### Default Configuration
```typescript
const CONNECTION_RATE_LIMIT = {
  maxConcurrentConnections: 5,  // Max concurrent connections per IP
  maxConnectionsPerMinute: 10,  // Max new connections per minute per IP
  blockDurationMs: 15 * 60 * 1000 // Block duration (15 minutes)
};
```

### Environment Variables
```bash
# Customize connection rate limiting
MAX_CONCURRENT_CONNECTIONS=5
MAX_CONNECTIONS_PER_MINUTE=10
CONNECTION_BLOCK_DURATION=900000
```

## Command Execution Rate Limiting

### Purpose
Prevents command spam within active sessions.

### Default Configuration
```typescript
const COMMAND_RATE_LIMIT = {
  maxCommandsPerMinute: 30,     // Max commands per minute per session
  burstLimit: 10,               // Allow short bursts of commands
  warningThreshold: 20          // Warn user when approaching limit
};
```

### Environment Variables
```bash
# Customize command rate limiting
MAX_COMMANDS_PER_MINUTE=30
COMMAND_BURST_LIMIT=10
COMMAND_WARNING_THRESHOLD=20
```

## Resource-based Rate Limiting

### Purpose
Automatically limits sessions based on resource consumption patterns.

### Metrics Monitored
- Container memory usage
- CPU usage
- Network bandwidth
- Disk I/O operations

### Automatic Actions
- **Warning**: User notification when approaching limits
- **Throttling**: Slower command execution when limits exceeded
- **Suspension**: Temporary session pause for severe violations
- **Termination**: Session termination for repeated violations

## Rate Limiting Configuration

### Server Configuration
Rate limiting settings can be configured via environment variables or configuration files:

```bash
# /etc/ably-terminal-server/config.env

# Session Resume Rate Limiting
RESUME_MAX_ATTEMPTS=3
RESUME_WINDOW_MS=60000
RESUME_COOLDOWN_MS=300000

# Connection Rate Limiting
MAX_CONCURRENT_CONNECTIONS=5
MAX_CONNECTIONS_PER_MINUTE=10
CONNECTION_BLOCK_DURATION=900000

# Command Rate Limiting
MAX_COMMANDS_PER_MINUTE=30
COMMAND_BURST_LIMIT=10
COMMAND_WARNING_THRESHOLD=20

# Resource-based Limits
MAX_MEMORY_MB=256
MAX_CPU_PERCENT=80
MAX_SESSIONS_PER_USER=3
```

### Development vs Production Settings

#### Development Settings (Relaxed)
```bash
NODE_ENV=development
RESUME_MAX_ATTEMPTS=10
MAX_CONCURRENT_CONNECTIONS=20
MAX_COMMANDS_PER_MINUTE=100
COMMAND_WARNING_THRESHOLD=80
```

#### Production Settings (Strict)
```bash
NODE_ENV=production
RESUME_MAX_ATTEMPTS=3
MAX_CONCURRENT_CONNECTIONS=5
MAX_COMMANDS_PER_MINUTE=30
COMMAND_WARNING_THRESHOLD=20
```

## Monitoring and Alerting

### Log Events
Rate limiting events are logged with structured data for monitoring:

```json
{
  "timestamp": "2024-12-31T10:30:00.000Z",
  "level": "WARN",
  "message": "Rate limit exceeded",
  "sessionId": "sess_abc123",
  "userIp": "192.168.1.100",
  "rateLimit": {
    "type": "session_resume",
    "current": 4,
    "limit": 3,
    "windowMs": 60000,
    "action": "blocked"
  }
}
```

### Metrics for Monitoring Systems

The following metrics should be monitored in production:

- `rate_limit_violations_total` - Total rate limit violations
- `active_connections_by_ip` - Current connections per IP
- `commands_per_minute_by_session` - Command rate per session
- `blocked_ips_total` - Number of currently blocked IPs
- `session_resume_attempts_total` - Total resume attempts

### Alerting Thresholds

Recommended alerting thresholds:

- **High**: >10 rate limit violations per minute
- **Critical**: >50 rate limit violations per minute
- **Warning**: Single IP with >3 concurrent connections
- **Critical**: Single IP with >10 connection attempts per minute

## Tuning Guidelines

### Identifying Optimal Limits

1. **Monitor Baseline Usage**
   - Collect metrics for 1-2 weeks
   - Identify 95th percentile usage patterns
   - Set limits at 150% of normal usage

2. **Gradual Adjustment**
   - Start with conservative limits
   - Monitor user complaints and legitimate usage patterns
   - Adjust incrementally (10-20% changes)

3. **A/B Testing**
   - Test different limits with different user groups
   - Measure impact on legitimate usage
   - Optimize for balance between security and usability

### Common Tuning Scenarios

#### High-Traffic Environments
```bash
# Increase limits for legitimate high usage
MAX_CONCURRENT_CONNECTIONS=10
MAX_COMMANDS_PER_MINUTE=60
COMMAND_BURST_LIMIT=20
```

#### Security-Focused Environments
```bash
# Stricter limits for high-security scenarios
RESUME_MAX_ATTEMPTS=2
RESUME_COOLDOWN_MS=600000  # 10 minutes
MAX_CONCURRENT_CONNECTIONS=3
MAX_COMMANDS_PER_MINUTE=20
```

#### Development/Testing Environments
```bash
# Relaxed limits for development
RESUME_MAX_ATTEMPTS=20
MAX_COMMANDS_PER_MINUTE=200
CONNECTION_BLOCK_DURATION=60000  # 1 minute
```

## Bypass Mechanisms

### Whitelisted IPs
For trusted IP addresses that should bypass rate limiting:

```bash
# Environment variable with comma-separated IPs
RATE_LIMIT_WHITELIST="192.168.1.100,10.0.0.50,172.16.0.10"
```

### Administrative Override
Administrators can temporarily disable rate limiting:

```bash
# Disable all rate limiting (emergency use only)
DISABLE_RATE_LIMITING=true

# Disable specific rate limits
DISABLE_CONNECTION_RATE_LIMITING=true
DISABLE_COMMAND_RATE_LIMITING=true
```

## Troubleshooting

### Common Issues

#### Users Reporting "Connection Blocked"
1. Check if IP is rate limited: Look for rate limit logs
2. Verify legitimate usage: Check command patterns and timing
3. Adjust limits if needed: Increase limits for legitimate high usage
4. Whitelist if necessary: Add trusted IPs to whitelist

#### False Positives
1. Monitor user behavior patterns
2. Implement grace periods for new users
3. Add user feedback mechanism
4. Consider progressive rate limiting (increasing limits for trusted users)

### Debugging Commands

```bash
# View rate limiting logs
sudo journalctl -u ably-terminal-server | grep -i "rate"

# Monitor real-time rate limiting events
sudo journalctl -f -u ably-terminal-server | grep -E "(rate|blocked|exceeded)"

# Check current configuration
cat /etc/ably-terminal-server/config.env | grep -E "(RATE|LIMIT|MAX_)"
```

### Rate Limit Reset

To reset rate limiting data without restarting the server:

```bash
# Send SIGUSR1 to reset rate limiting counters
sudo systemctl kill -s SIGUSR1 ably-terminal-server
```

## Security Considerations

### Rate Limiting as Defense in Depth
Rate limiting is one layer of security and should be combined with:

- Authentication and authorization
- Input validation and sanitization
- Container security measures
- Network security controls
- Monitoring and alerting

### Avoiding Security Through Obscurity
- Document rate limits clearly for legitimate users
- Provide clear error messages when limits are exceeded
- Offer mechanisms for legitimate high-usage scenarios

### Regular Review
- Review rate limiting effectiveness monthly
- Analyze attack patterns and adjust accordingly
- Update limits based on changing usage patterns
- Test rate limiting during security assessments

## API Integration

### Checking Rate Limit Status
```javascript
// Client-side API to check rate limit status
const response = await fetch('/api/rate-limit/status', {
  headers: { 'Authorization': 'Bearer ' + token }
});

const status = await response.json();
console.log('Remaining commands:', status.remainingCommands);
console.log('Reset time:', status.resetTime);
```

### Rate Limit Headers
The server includes rate limit information in response headers:

```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 25
X-RateLimit-Reset: 1609459200
X-RateLimit-Type: commands
```

## Migration and Upgrades

### Backwards Compatibility
- New rate limiting features are opt-in by default
- Existing deployments continue working without configuration changes
- Gradual migration path for enabling new features

### Configuration Migration
```bash
# Migrate old configuration format to new format
./scripts/migrate-rate-limit-config.sh /old/config.env /new/config.env
```

This documentation should be reviewed and updated as rate limiting features evolve and new requirements emerge. 