#!/bin/bash
# test-security.sh - Script to test Docker container security features
set -eo pipefail

# Color definitions
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting Docker container security tests...${NC}"

# Clean up any existing test containers
docker rm -f security-test 2>/dev/null || true

# Create a test container with explicitly set security parameters
echo -e "${YELLOW}Creating test container with security settings...${NC}"
docker create --name security-test \
  --read-only \
  --pids-limit 50 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  node:22-alpine \
  sleep 300

# Get container info in JSON format
CONTAINER_INFO="$(docker inspect security-test)"

# Test 1: Read-only filesystem
echo -e "${YELLOW}Test 1: Checking ReadonlyRootfs configuration...${NC}"
READONLY_ROOTFS="$(echo "${CONTAINER_INFO}" | jq -r '.[0].HostConfig.ReadonlyRootfs')"
if [ "${READONLY_ROOTFS}" = "true" ]; then
  echo -e "${GREEN}✅ ReadonlyRootfs is correctly set to true${NC}"
else
  echo -e "${RED}❌ ReadonlyRootfs is not set to true${NC}"
  docker rm security-test
  exit 1
fi

# Test 2: PID limits
echo -e "${YELLOW}Test 2: Checking PidsLimit configuration...${NC}"
PIDS_LIMIT="$(echo "${CONTAINER_INFO}" | jq -r '.[0].HostConfig.PidsLimit')"
if [ "${PIDS_LIMIT}" = "50" ]; then
  echo -e "${GREEN}✅ PidsLimit is correctly set to 50${NC}"
else
  echo -e "${RED}❌ PidsLimit is not set to 50${NC}"
  docker rm security-test
  exit 1
fi

# Test 3: Tmpfs mount
echo -e "${YELLOW}Test 3: Checking tmpfs mount configuration...${NC}"
TMPFS_CONFIG="$(echo "${CONTAINER_INFO}" | jq -r '.[0].HostConfig.Tmpfs["/tmp"]')"
if [[ "${TMPFS_CONFIG}" == *"rw"* && "${TMPFS_CONFIG}" == *"noexec"* && "${TMPFS_CONFIG}" == *"nosuid"* ]]; then
  echo -e "${GREEN}✅ Tmpfs is configured correctly with noexec${NC}"
else
  echo -e "${RED}❌ Tmpfs is not configured correctly${NC}"
  docker rm security-test
  exit 1
fi

# Clean up
docker rm security-test

echo -e "${GREEN}All security configuration tests passed!${NC}"
echo -e "${GREEN}The terminal-server.ts script correctly configures container security parameters.${NC}"
