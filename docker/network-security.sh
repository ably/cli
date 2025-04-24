#!/bin/bash
# network-security.sh - Script to enforce network security in Docker container
set -e

# Log function that only shows output when running as root or when critical
log() {
  if [ "$2" = "critical" ] || [ "$(id -u)" -eq 0 ]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Network Security] $1"
  fi
}

log "Setting up network security restrictions..." "critical"

# Define allowed domains (must match the ALLOWED_DOMAINS in terminal-server.ts)
ALLOWED_DOMAINS=(
  "rest.ably.io"
  "realtime.ably.io"
  "api.ably.io"
  "*.ably.io"
  "ably.com"
  "*.ably.com"
  "*.ably.net"
  "npmjs.org"
  "registry.npmjs.org"
)

# Check if running as root
if [ "$(id -u)" -eq 0 ]; then
  log "Setting up iptables rules..."

  # Flush existing rules
  iptables -F
  iptables -X
  iptables -t nat -F
  iptables -t nat -X
  iptables -t mangle -F
  iptables -t mangle -X

  # Set default policies
  iptables -P INPUT DROP
  iptables -P FORWARD DROP
  iptables -P OUTPUT DROP

  # Allow loopback traffic
  iptables -A INPUT -i lo -j ACCEPT
  iptables -A OUTPUT -o lo -j ACCEPT

  # Allow established and related connections
  iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  iptables -A OUTPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

  # Allow DNS resolution
  iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

  # Allow outbound HTTP/HTTPS to allowed domains only
  for domain in "${ALLOWED_DOMAINS[@]}"; do
    # Handle wildcards by extracting the base domain
    if [[ "$domain" == *"*"* ]]; then
      base_domain=${domain/\*./}
      log "Adding wildcard rule for domain: $base_domain"
      iptables -A OUTPUT -p tcp -m tcp --dport 80 -m string --string "$base_domain" --algo bm -j ACCEPT
      iptables -A OUTPUT -p tcp -m tcp --dport 443 -m string --string "$base_domain" --algo bm -j ACCEPT
    else
      log "Adding rule for domain: $domain"
      iptables -A OUTPUT -p tcp -m tcp --dport 80 -m string --string "$domain" --algo bm -j ACCEPT
      iptables -A OUTPUT -p tcp -m tcp --dport 443 -m string --string "$domain" --algo bm -j ACCEPT
    fi
  done

  # Allow outbound WebSocket connections to Ably
  iptables -A OUTPUT -p tcp --dport 80 -d realtime.ably.io -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 443 -d realtime.ably.io -j ACCEPT

  # Drop everything else
  iptables -A OUTPUT -j LOG --log-prefix "BLOCKED OUTPUT: " --log-level 4
  iptables -A INPUT -j LOG --log-prefix "BLOCKED INPUT: " --log-level 4

  log "Network security setup complete."

  # Create custom resolv.conf that uses Google DNS
  log "Setting up DNS..."
  if [ -w /etc/resolv.conf ]; then
    cat > /etc/resolv.conf << EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
options timeout:2 attempts:3
EOF
  else
    log "Cannot write to /etc/resolv.conf - DNS setup skipped"
  fi
else
  log "Not running as root, skipping network security setup." "critical"
fi

# Execute the command silently
exec "$@"
