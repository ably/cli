#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

IMAGE_NAME="ably-cli-sandbox"
CONTAINER_NAME="ably-cli-test-container"

log() {
  echo "[TEST_CONTAINER] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
  echo "[TEST_CONTAINER_ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

cleanup() {
  log "Cleaning up test container ${CONTAINER_NAME}..."
  docker rm -f "${CONTAINER_NAME}" > /dev/null 2>&1 || true
}

trap cleanup EXIT

log "Starting container test..."

# 1. Build the image (ensure it's up-to-date)
log "Building image ${IMAGE_NAME}..."
# Redirect build output to /dev/null to keep test output clean
if docker build -t "${IMAGE_NAME}" . > /dev/null 2>&1; then
  log "Image built successfully."
else
  log_error "Failed to build Docker image."
  exit 1
fi

# 2. Run container with a simple command to check basic execution and user
log "Running container to check user and basic permissions..."
if docker run --rm --name "${CONTAINER_NAME}_check" "${IMAGE_NAME}" id; then
  log "Container basic check successful (ran as correct user)."
else
  log_error "Failed basic container check (user or execution issue)."
  exit 1
fi

# 3. Run container and check script permissions from within
log "Running container to check internal script permissions..."
COMMAND_TO_RUN="ls -la /scripts && echo '---' && /scripts/network-security.sh --test-only && echo '---' && /scripts/restricted-shell.sh --test-only"
if docker run --rm --name "${CONTAINER_NAME}_perm_check" "${IMAGE_NAME}" bash -c "${COMMAND_TO_RUN}"; then
  log "Internal script permission check successful."
else
  log_error "Failed internal script permission check. One of the scripts might not be executable."
  exit 1
fi

# 4. Run container, override entrypoint, and check basic command execution as appuser
log "Running container to check command execution as appuser (overriding entrypoint)..."
# Override entrypoint to directly test a simple command like 'id'
DUMMY_API_KEY='dummy.key:secret'
DUMMY_ACCESS_TOKEN='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkaWFnbm9zdGljIiwiaWF0IjoxNTE2MjM5MDIyfQ.dummy_signature'

if docker run --rm --name "${CONTAINER_NAME}_exec_check" --entrypoint="/bin/bash" \
  -e "ABLY_API_KEY=${DUMMY_API_KEY}" \
  -e "ABLY_ACCESS_TOKEN=${DUMMY_ACCESS_TOKEN}" \
  "${IMAGE_NAME}" -c "id"; then # Use simple 'id' command
  log "Container command execution check successful."
else
  log_error "Failed container command execution check. There might be issues with user permissions or basic execution within the container."
  exit 1
fi

# 5. Run container and test 'ably help status' command
log "Running container to test 'ably help status' command (requires network access)..."
# Run interactively, execute 'ably help status', capture output
# Use --entrypoint="" to bypass the default entrypoint and run bash directly
if OUTPUT=$(docker run --rm --name "${CONTAINER_NAME}_ably_status" --entrypoint="" \
  -e "ABLY_API_KEY=${DUMMY_API_KEY}" \
  -e "ABLY_ACCESS_TOKEN=${DUMMY_ACCESS_TOKEN}" \
  "${IMAGE_NAME}" bash -c "ably help status" 2>&1); then
  # Check if output contains expected success indicators
  if echo "${OUTPUT}" | grep -q "Ably service status" && echo "${OUTPUT}" | grep -q "operational"; then
    log "'ably help status' command executed successfully and received operational status."
    log "Output snippet: $(echo "${OUTPUT}" | head -n 5)"
  else
    log_error "'ably help status' command ran but did not return expected operational status. Output:"
    # Print the full output for debugging
    echo "-------------------- Start Output --------------------"
    echo "${OUTPUT}"
    echo "--------------------- End Output ---------------------"
    exit 1
  fi
else
  # The docker run command itself failed
  log_error "Failed to run 'ably help status' command inside the container. Exit code: $?. Output:"
  # Print the full output for debugging
  echo "-------------------- Start Output --------------------"
  echo "${OUTPUT}"
  echo "--------------------- End Output ---------------------"
  exit 1
fi

log "Container test completed successfully!"
exit 0
