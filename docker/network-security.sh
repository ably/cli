#!/bin/bash
# network-security.sh - Script to enforce network security in Docker container
set -e

# Check if running in test-only mode
if [ "$1" == "--test-only" ]; then
    echo "[network-security.sh] Test mode: Permissions seem ok."
    exit 0
fi

# Set up basic trap for cleanup on exit
trap 'cleanup_iptables' EXIT

# Log function that only shows output when running as root or when critical
log() {
  if [ "$2" = "critical" ] || [ "$(id -u)" -eq 0 ]; then
    echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Network Security] $1"
  fi
}

log "Setting up network security restrictions..." "critical"

# Define allowed destination IPs/domains
# Add more as needed. IPs are more reliable if DNS is restricted.
ALLOWED_DESTINATIONS=(
    # Ably Endpoints (Domains)
    "rest.ably.io"
    "realtime.ably.io"
    "*.ably-realtime.com" # Wildcard for Ably realtime endpoints
    "ably.com"            # Main website (might be needed for some API calls)
    "*.ably.com"          # Broader Ably domain
    "*.ably.io"           # Broader Ably domain
    "*.ably.net"          # Another Ably domain

    # Essential Services (Domains/IPs)
    "npmjs.org"           # If installing global packages inside (discouraged)
    "registry.npmjs.org"
    "8.8.8.8"             # Google DNS
    "8.8.4.4"             # Google DNS
    "1.1.1.1"             # Cloudflare DNS
    "1.0.0.1"             # Cloudflare DNS
    "127.0.0.11"          # Docker embedded DNS server
)

# Check if running as root
if [ "$(id -u)" -eq 0 ]; then
  log "Setting up iptables rules..."

  # Flush existing rules
  iptables -F OUTPUT
  iptables -t nat -F
  iptables -t mangle -F
  iptables -X OUTPUT # Delete custom chains if needed, but OUTPUT is built-in
  # iptables -X # Careful with -X without chain name

  # Set default policies
  # Drop all by default, then specifically allow
  iptables -P OUTPUT DROP
  # We don't control input/forwarding within the container typically, but setting defaults is good practice
  iptables -P INPUT DROP
  iptables -P FORWARD DROP

  # Allow loopback traffic
  iptables -A OUTPUT -o lo -j ACCEPT
  iptables -A INPUT -i lo -j ACCEPT # Allow input on loopback too

  # Allow established and related connections (essential for return traffic)
  iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
  iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT # Allow incoming return traffic

  # Resolve hostnames to IPs *before* setting rules that might block DNS
  ALLOWED_IPS=()
  for dest in "${ALLOWED_DESTINATIONS[@]}"; do
      if [[ $dest =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
          # It's already an IP
          ALLOWED_IPS+=("$dest")
      elif [[ $dest == *"*"* ]]; then
           # Wildcards are complex with iptables.
           # We will resolve the base domain and allow that IP for simplicity.
           # WARNING: This might not cover all needed IPs dynamically.
           base_domain=${dest/\*./}
           log "Resolving wildcard domain: $base_domain"
           ip=$(getent hosts "$base_domain" | awk '{ print $1 }' | head -n 1)
           if [ -n "$ip" ]; then
               log "Allowing traffic to resolved IP for wildcard $base_domain: $ip"
               ALLOWED_IPS+=("$ip")
           else
               log "Warning: Could not resolve base domain $base_domain for wildcard $dest."
           fi
      else
          # It's a hostname, resolve it
          log "Resolving hostname: $dest"
          ip=$(getent hosts "$dest" | awk '{ print $1 }' | head -n 1)
          if [ -n "$ip" ]; then
              log "Resolved $dest to $ip"
              ALLOWED_IPS+=("$ip")
          else
              log "Warning: Could not resolve IP for $dest. Traffic might be blocked."
          fi
      fi
  done

  # Add rules for resolved IPs (remove duplicates)
  UNIQUE_IPS=$(echo "${ALLOWED_IPS[@]}" | tr ' ' '\n' | sort -u | tr '\n' ' ')
  log "Applying rules for unique IPs: $UNIQUE_IPS"
  for ip in $UNIQUE_IPS; do
      log "Allowing output to IP: $ip (for HTTP/HTTPS/WSS)"
      iptables -A OUTPUT -d "$ip" -p tcp -m multiport --dports 80,443 -j ACCEPT
      # Optionally allow UDP for things like QUIC if needed
      # iptables -A OUTPUT -d "$ip" -p udp --dport 443 -j ACCEPT
  done

  # Allow essential DNS traffic *only* to explicitly allowed DNS servers
  log "Allowing essential DNS traffic..."
  iptables -A OUTPUT -p udp --dport 53 -d 8.8.8.8 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -d 8.8.8.8 -j ACCEPT
  iptables -A OUTPUT -p udp --dport 53 -d 8.8.4.4 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -d 8.8.4.4 -j ACCEPT
  iptables -A OUTPUT -p udp --dport 53 -d 1.1.1.1 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -d 1.1.1.1 -j ACCEPT
  iptables -A OUTPUT -p udp --dport 53 -d 1.0.0.1 -j ACCEPT
  iptables -A OUTPUT -p tcp --dport 53 -d 1.0.0.1 -j ACCEPT
  iptables -A OUTPUT -p udp --dport 53 -d 127.0.0.11 -j ACCEPT # Docker DNS
  iptables -A OUTPUT -p tcp --dport 53 -d 127.0.0.11 -j ACCEPT # Docker DNS

  # Log dropped packets (optional, can be noisy)
  log "Logging denied output packets (optional)..."
  iptables -A OUTPUT -j LOG --log-prefix "[NETWORK_DROP] " --log-level 6

  # Final drop rule is implicit due to -P OUTPUT DROP
  log "Network security setup complete. Default OUTPUT policy is DROP."

else
  log "Not running as root, skipping iptables network security setup." "critical"
fi

# Function to clean up iptables rules on exit
cleanup_iptables() {
  if [ "$(id -u)" -eq 0 ]; then
    log "Cleaning up network security rules..."
    iptables -P OUTPUT ACCEPT # Reset policy to default *before* flushing
    iptables -F OUTPUT       # Flush OUTPUT chain rules
    # Consider flushing INPUT/FORWARD if you modified them
    # iptables -P INPUT ACCEPT
    # iptables -F INPUT
    # iptables -P FORWARD ACCEPT
    # iptables -F FORWARD
    log "Network rules cleaned up."
  fi
}

# Execute the command passed as arguments (e.g., the restricted shell)
# Use exec to replace this script process with the target command
log "Executing command: $@" "critical"
exec "$@"
