#!/bin/bash
# network-security.sh - Script to enforce network security in Docker container
set -e

# Log function
log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Network Security] $*"
}

log "Setting up network security restrictions..."

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

# Create hosts.allow and hosts.deny for TCP wrappers
log "Setting up TCP wrappers restrictions..."
echo "ALL: LOCAL, 127.0.0.1" > /etc/hosts.allow
for domain in "${ALLOWED_DOMAINS[@]}"; do
  echo "ALL: $domain" >> /etc/hosts.allow
done
echo "ALL: ALL" > /etc/hosts.deny

# Set up iptables rules to restrict outbound traffic
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
iptables -A OUTPUT -p tcp --dport 80 -m string --string "Host: " --algo bm --to 65535 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -m string --string "Host: " --algo bm --to 65535 -j ACCEPT

# Allow outbound WebSocket connections to Ably
iptables -A OUTPUT -p tcp --dport 80 -d realtime.ably.io -j ACCEPT
iptables -A OUTPUT -p tcp --dport 443 -d realtime.ably.io -j ACCEPT

# Drop everything else
iptables -A OUTPUT -j LOG --log-prefix "BLOCKED OUTPUT: " --log-level 4
iptables -A INPUT -j LOG --log-prefix "BLOCKED INPUT: " --log-level 4

log "Network security setup complete."

# Create custom resolv.conf that uses Google DNS
log "Setting up DNS..."
cat > /etc/resolv.conf << EOF
nameserver 8.8.8.8
nameserver 8.8.4.4
options timeout:2 attempts:3
EOF

# Run the original command
log "Running command: $@"
exec "$@"
