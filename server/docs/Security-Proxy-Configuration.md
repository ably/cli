# Security Configuration for Reverse Proxy Deployment

## Overview

This document explains the critical security configurations needed when deploying the Ably CLI Terminal Server behind a reverse proxy (like Caddy, nginx, or Apache).

## Security Vulnerability: Localhost Rate Limiting Bypass

### The Problem

By default, the server provides localhost connections with 50x higher rate limits for development convenience. However, when deployed behind a reverse proxy:

1. **All traffic appears to come from localhost** (127.0.0.1) 
2. **Rate limiting exemptions apply to ALL users**
3. **This completely bypasses production rate limiting**

### The Solution

The server now includes secure proxy detection that:

- Only trusts `X-Forwarded-For` headers from whitelisted proxy IPs
- Extracts the real client IP for rate limiting
- Disables localhost exemptions when running behind a trusted proxy

## Configuration

### Environment Variables

```bash
# Enable trusted proxy mode (REQUIRED for production behind proxy)
TRUSTED_PROXY_ENABLED=true

# Whitelist proxy IP addresses (REQUIRED when TRUSTED_PROXY_ENABLED=true)
TRUSTED_PROXY_IPS=127.0.0.1,::1,10.0.0.1

# Disable localhost exemptions (RECOMMENDED for production)
DISABLE_LOCALHOST_EXEMPTIONS=true
```

### Automated Setup Script

The `server/scripts/setup-server.sh` script automatically configures all proxy security settings with secure defaults for production deployment. The script:

1. **Sets secure defaults**: `TRUSTED_PROXY_ENABLED=true`, `DISABLE_LOCALHOST_EXEMPTIONS=true`
2. **Configures Caddy properly**: Sets up X-Forwarded-For headers in Caddyfile
3. **Loads all environment variables**: SystemD service loads security settings from config file
4. **Provides upgrade warnings**: Alerts administrators about critical security settings

When using the setup script, the security configuration is automatically created in `/etc/ably-terminal-server/config.env` with secure production defaults.

### Production Example (Caddy)

```bash
# Production configuration behind Caddy
TRUSTED_PROXY_ENABLED=true
TRUSTED_PROXY_IPS=127.0.0.1,::1
DISABLE_LOCALHOST_EXEMPTIONS=true

# Standard rate limits will apply to all clients
MAX_CONNECTIONS_PER_IP_PER_MINUTE=10
```

### Development Example

```bash
# Development configuration (direct connection)
TRUSTED_PROXY_ENABLED=false
DISABLE_LOCALHOST_EXEMPTIONS=false

# Localhost gets 50x higher limits for testing
# Remote connections get standard limits
```

## Caddy Configuration

Ensure Caddy forwards the real client IP:

```caddy
example.com {
    reverse_proxy localhost:8080 {
        header_up X-Forwarded-For {remote_host}
        header_up X-Real-IP {remote_host}
    }
}
```

## Security Validation

The server logs security warnings for misconfiguration:

```
⚠️  WARNING: Trusted proxy enabled but no proxy IPs configured!
⚠️  WARNING: Localhost exemptions enabled while behind proxy - this may bypass rate limiting!
```

## Testing Proxy Configuration

### 1. Check Client IP Detection

```bash
curl -H "X-Forwarded-For: 203.0.113.1" http://localhost:8080/stats
```

Logs should show:
```
Using X-Forwarded-For IP from trusted proxy: clientIP=203.0.113.1
```

### 2. Verify Rate Limiting

```bash
# Should be rate limited based on real client IP, not proxy IP
for i in {1..15}; do
  curl -H "X-Forwarded-For: 203.0.113.1" ws://localhost:8080 &
done
```

### 3. Check Security Warnings

Look for security warnings in server logs:
- No warnings = properly configured
- Warnings = misconfiguration detected

## Migration Guide

### From Unprotected to Protected

1. **Before deployment**: Test with `TRUSTED_PROXY_ENABLED=false`
2. **During deployment**: Set `TRUSTED_PROXY_ENABLED=true` and `TRUSTED_PROXY_IPS`
3. **After deployment**: Set `DISABLE_LOCALHOST_EXEMPTIONS=true`
4. **Verify**: Monitor logs for security warnings

### Rollback Plan

If issues occur:

1. Set `TRUSTED_PROXY_ENABLED=false` (emergency fallback)
2. Check proxy IP whitelist in `TRUSTED_PROXY_IPS`
3. Verify Caddy forwards correct headers
4. Review server logs for IP detection issues

## Security Best Practices

1. **Always whitelist specific proxy IPs** - Never trust all sources
2. **Use HTTPS between proxy and server** - Even on localhost
3. **Monitor rate limiting stats** - Watch for bypass attempts
4. **Enable security audit logging** - Set `SECURITY_AUDIT_LOG=true`
5. **Regular security reviews** - Check proxy configuration changes

## Troubleshooting

### Common Issues

**Issue**: All requests show 127.0.0.1 as client IP
- **Cause**: `TRUSTED_PROXY_ENABLED=false` but running behind proxy
- **Fix**: Set `TRUSTED_PROXY_ENABLED=true`

**Issue**: Rate limiting not working
- **Cause**: Localhost exemptions bypassing limits
- **Fix**: Set `DISABLE_LOCALHOST_EXEMPTIONS=true`

**Issue**: "Ignoring X-Forwarded-For from untrusted proxy"
- **Cause**: Proxy IP not in whitelist
- **Fix**: Add proxy IP to `TRUSTED_PROXY_IPS`

### Debug Commands

```bash
# Check current configuration
curl http://localhost:8080/stats

# Test with different client IPs
curl -H "X-Forwarded-For: 1.2.3.4" http://localhost:8080/health

# Monitor rate limiting in real-time
tail -f server.log | grep "rate limit"
``` 