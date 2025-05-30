#!/bin/bash
# security-monitor.sh - Script to monitor container security events
set -e

# Log function
log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] [Security Monitor] $*"
}

log "Starting security monitoring service..."

# Check requirements
if ! command -v docker &> /dev/null; then
  log "Error: Docker is not installed or not in the PATH."
  exit 1
fi

# Set constants
OUTPUT_DIR="${OUTPUT_DIR:-/var/log/ably-cli-security}"
SYSCALL_LOG="${OUTPUT_DIR}/syscall_violations.log"
APPARMOR_LOG="${OUTPUT_DIR}/apparmor_violations.log"
RESOURCE_LOG="${OUTPUT_DIR}/resource_usage.log"
ALERT_LOG="${OUTPUT_DIR}/security_alerts.log"
MONITOR_INTERVAL=30  # seconds

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"
touch "$SYSCALL_LOG" "$APPARMOR_LOG" "$RESOURCE_LOG" "$ALERT_LOG"

# Function to monitor Docker events
monitor_docker_events() {
  if command -v docker &> /dev/null; then
    log "Starting Docker events monitoring..."
    docker events --filter type=container --filter label=managed-by=ably-cli-terminal-server \
      --format '{{.Status}} {{.Actor.ID}} {{.Time}}' &
    DOCKER_EVENTS_PID=$!
  else
    log "Docker command not found. Docker events monitoring disabled."
  fi
}

# Function to monitor AppArmor violations
monitor_apparmor() {
  log "Starting AppArmor violations monitoring..."
  if [ -d "/sys/kernel/security/apparmor" ]; then
    if [ -f "/var/log/audit/audit.log" ]; then
      grep "apparmor=\"DENIED\"" /var/log/audit/audit.log > "$APPARMOR_LOG" 2>/dev/null || true
      tail -f /var/log/audit/audit.log | grep --line-buffered "apparmor=\"DENIED\"" >> "$APPARMOR_LOG" &
      APPARMOR_PID=$!
    elif [ -f "/var/log/syslog" ]; then
      grep "apparmor=\"DENIED\"" /var/log/syslog > "$APPARMOR_LOG" 2>/dev/null || true
      tail -f /var/log/syslog | grep --line-buffered "apparmor=\"DENIED\"" >> "$APPARMOR_LOG" &
      APPARMOR_PID=$!
    else
      log "AppArmor log not found. AppArmor monitoring disabled."
    fi
  else
    log "AppArmor is not available on this system. AppArmor monitoring disabled."
  fi
}

# Function to monitor seccomp violations
monitor_seccomp() {
  log "Starting seccomp violations monitoring..."
  if [ -f "/var/log/kern.log" ]; then
    grep "auid=[0-9]* uid=[0-9]* gid=[0-9]* ses=[0-9]* pid=[0-9]* comm=\".*\" exe=\".*\" sig=SIG" /var/log/kern.log > "$SYSCALL_LOG" 2>/dev/null || true
    tail -f /var/log/kern.log | grep --line-buffered "auid=[0-9]* uid=[0-9]* gid=[0-9]* ses=[0-9]* pid=[0-9]* comm=\".*\" exe=\".*\" sig=SIG" >> "$SYSCALL_LOG" &
    SECCOMP_PID=$!
  elif [ -f "/var/log/messages" ]; then
    grep "auid=[0-9]* uid=[0-9]* gid=[0-9]* ses=[0-9]* pid=[0-9]* comm=\".*\" exe=\".*\" sig=SIG" /var/log/messages > "$SYSCALL_LOG" 2>/dev/null || true
    tail -f /var/log/messages | grep --line-buffered "auid=[0-9]* uid=[0-9]* gid=[0-9]* ses=[0-9]* pid=[0-9]* comm=\".*\" exe=\".*\" sig=SIG" >> "$SYSCALL_LOG" &
    SECCOMP_PID=$!
  else
    log "Kernel log not found. Seccomp monitoring disabled."
  fi
}

# Function to monitor resource usage
monitor_resources() {
  log "Starting resource usage monitoring (interval: ${MONITOR_INTERVAL}s)..."

  # Check if we have bc for floating point comparison
  HAS_BC=false
  if command -v bc &> /dev/null; then
    HAS_BC=true
  fi

  while true; do
    if command -v docker &> /dev/null; then
      local containers
      containers=$(docker ps --filter label=managed-by=ably-cli-terminal-server -q 2>/dev/null || echo "")

      if [ -n "$containers" ]; then
        local timestamp
        timestamp=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

        echo "=== Resource Usage Report at $timestamp ===" >> "$RESOURCE_LOG"

        for container in $containers; do
          local stats
          stats=$(docker stats --no-stream --format "{{.Container}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.PIDs}}" "$container" 2>/dev/null || echo "")

          if [ -n "$stats" ]; then
            echo "$timestamp: $stats" >> "$RESOURCE_LOG"

            # Check for resource abuse if bc is available
            if [ "$HAS_BC" = true ]; then
              local cpu_perc
              local mem_perc
              local pids

              # Extract values (basic CSV parsing)
              IFS=',' read -r _ cpu_perc mem_usage mem_perc pids <<< "$stats"

              # Remove % signs and convert to numbers
              cpu_perc=${cpu_perc//%/}
              mem_perc=${mem_perc//%/}

              # Check thresholds
              if (( $(echo "$cpu_perc > 90" | bc -l) )); then
                echo "$timestamp: ALERT: High CPU usage ($cpu_perc%) in container $container" | tee -a "$ALERT_LOG"
              fi

              if (( $(echo "$mem_perc > 90" | bc -l) )); then
                echo "$timestamp: ALERT: High memory usage ($mem_perc%) in container $container" | tee -a "$ALERT_LOG"
              fi

              if [ "$pids" -gt 40 ]; then
                echo "$timestamp: ALERT: High number of processes ($pids) in container $container" | tee -a "$ALERT_LOG"
              fi
            fi
          fi
        done
      fi
    else
      log "Docker command not found. Resource monitoring disabled."
      break
    fi

    sleep "$MONITOR_INTERVAL"
  done
}

# Cleanup function
cleanup() {
  log "Stopping security monitoring..."

  # Kill background processes
  [ -n "${DOCKER_EVENTS_PID+x}" ] && kill $DOCKER_EVENTS_PID 2>/dev/null || true
  [ -n "${APPARMOR_PID+x}" ] && kill $APPARMOR_PID 2>/dev/null || true
  [ -n "${SECCOMP_PID+x}" ] && kill $SECCOMP_PID 2>/dev/null || true
  [ -n "${RESOURCE_PID+x}" ] && kill $RESOURCE_PID 2>/dev/null || true

  log "Security monitoring stopped."
  exit 0
}

# Handle signals
trap cleanup SIGINT SIGTERM

# Start monitoring
monitor_docker_events
monitor_apparmor
monitor_seccomp
monitor_resources & # Start in background
RESOURCE_PID=$!

log "Security monitoring started. Log files are in $OUTPUT_DIR"
log "Press Ctrl+C to stop monitoring."

# Keep script running
wait $RESOURCE_PID || true
