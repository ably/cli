#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e
# Treat unset variables as an error when substituting.
# set -u # Disabled for now as some environment variables might be unset intentionally
# Pipe commands should fail if any command in the pipe fails.
set -o pipefail

# --- Configuration ---
GITHUB_REPO_URL="https://github.com/ably/cli.git" # Replace with your actual repo URL if different
PROJECT_BRANCH="main" # Or the branch/tag you want to deploy
INSTALL_DIR="/opt/ably-cli-terminal-server"
SERVICE_USER="ablysrv"
SERVICE_GROUP="ablysrv"
SERVICE_NAME="ably-terminal-server"
ENV_CONFIG_DIR="/etc/ably-terminal-server"
ENV_CONFIG_FILE="${ENV_CONFIG_DIR}/config.env"
NODE_MAJOR_VERSION="22" # Use Node.js LTS version 22.x

# --- Helper Functions ---
log() {
  echo "[INFO] $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
  echo "[ERROR] $(date '+%Y-%m-%d %H:%M:%S') - $1" >&2
}

# --- Sanity Checks ---
if [ "$(id -u)" -ne 0 ]; then
  log_error "This script must be run as root or with sudo."
  exit 1
fi

# Check Ubuntu version (Supports 22.04 Jammy or 24.04 Noble)
if ! grep -q -E 'VERSION_ID="(22\.04|24\.04)"' /etc/os-release; then
    log_error "This script is intended for Ubuntu 22.04 (Jammy) or 24.04 (Noble)."
    # exit 1 # Commented out to allow attempts on other versions, but unsupported.
    log "Warning: Running on an untested Ubuntu version."
fi

# --- Install Prerequisites ---
log "Updating package lists..."
apt-get update -y

log "Installing prerequisites: git, curl, ca-certificates, gnupg, apparmor-utils..."
apt-get install -y git curl ca-certificates gnupg apparmor-utils

# --- Install Docker ---
log "Setting up Docker repository..."
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository to Apt sources:
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null
apt-get update -y

log "Installing Docker Engine..."
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

log "Verifying Docker installation..."
if ! docker run hello-world; then
    log_error "Docker installation failed or Docker daemon is not running."
    exit 1
fi
log "Docker installed successfully."

# --- Install Node.js using NodeSource ---
log "Setting up NodeSource repository for Node.js v${NODE_MAJOR_VERSION}.x..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR_VERSION}.x | bash -

log "Installing Node.js..."
apt-get install -y nodejs

log "Verifying Node.js installation..."
node -v
npm -v

# --- Install pnpm ---
log "Installing pnpm globally via npm..."
npm install -g pnpm

log "Verifying pnpm installation..."
pnpm -v

# --- Create Service User and Group ---
log "Creating service group '${SERVICE_GROUP}'..."
if ! getent group "${SERVICE_GROUP}" > /dev/null; then
  groupadd --system "${SERVICE_GROUP}"
else
  log "Group '${SERVICE_GROUP}' already exists."
fi

log "Creating service user '${SERVICE_USER}'..."
if ! id "${SERVICE_USER}" > /dev/null 2>&1; then
  useradd --system --gid "${SERVICE_GROUP}" --home-dir "${INSTALL_DIR}" --shell /usr/sbin/nologin "${SERVICE_USER}"
else
  log "User '${SERVICE_USER}' already exists."
fi

log "Adding service user '${SERVICE_USER}' to the 'docker' group..."
usermod -aG docker "${SERVICE_USER}"

# --- Clone Repository ---
log "Cloning repository from ${GITHUB_REPO_URL} (branch: ${PROJECT_BRANCH})..."
rm -rf "${INSTALL_DIR}" # Remove existing directory if it exists
git clone --branch "${PROJECT_BRANCH}" --depth 1 "${GITHUB_REPO_URL}" "${INSTALL_DIR}"

# --- Set Permissions ---
log "Setting ownership for ${INSTALL_DIR}..."
chown -R "${SERVICE_USER}":"${SERVICE_GROUP}" "${INSTALL_DIR}"
chmod -R 770 "${INSTALL_DIR}" # Allow group write for build process

# --- Install Dependencies & Build ---
log "Changing directory to ${INSTALL_DIR}..."
cd "${INSTALL_DIR}"

log "Installing project dependencies with pnpm..."
# Run pnpm as the service user to ensure correct permissions for cache etc.
# Using sudo -u <user> -H ensures the home directory environment is set correctly
sudo -u "${SERVICE_USER}" -H pnpm install --frozen-lockfile --prod=false

log "Building the project..."
sudo -u "${SERVICE_USER}" -H pnpm prepare

# Optional: Adjust permissions after build if needed
# chmod -R 750 "${INSTALL_DIR}" # Tighten permissions after build

# --- Install AppArmor Profile (Optional but Recommended) ---
APPARMOR_PROFILE_SOURCE="${INSTALL_DIR}/docker/apparmor-profile.conf"
APPARMOR_PROFILE_DEST="/etc/apparmor.d/docker-ably-cli-sandbox"
if [ -f "${APPARMOR_PROFILE_SOURCE}" ]; then
    log "Installing AppArmor profile..."
    cp "${APPARMOR_PROFILE_SOURCE}" "${APPARMOR_PROFILE_DEST}"
    log "Reloading AppArmor profiles (this might show errors if AppArmor is disabled in kernel)..."
    # This command might fail if AppArmor isn't fully enabled/supported by the kernel/EC2 config
    apparmor_parser -r -W "${APPARMOR_PROFILE_DEST}" || log "Warning: Failed to load AppArmor profile. The terminal server might run unconfined."
else
    log "AppArmor profile source not found at ${APPARMOR_PROFILE_SOURCE}, skipping installation."
fi

# --- Create Environment Configuration File ---
log "Creating environment configuration directory ${ENV_CONFIG_DIR}..."
mkdir -p "${ENV_CONFIG_DIR}"

log "Creating environment file ${ENV_CONFIG_FILE}..."
cat << EOF > "${ENV_CONFIG_FILE}"
# Environment variables for the Ably Terminal Server service
# !!! IMPORTANT: Replace placeholder values below !!!

# The port the WebSocket server will listen on
PORT=8080

# Ably API Key for the terminal server itself (if needed for management/metrics)
# ABLY_SERVER_API_KEY=your_ably_api_key

# You may not need ABLY_API_KEY and ABLY_ACCESS_TOKEN here,
# as they seem to be passed by the client during connection.
# If the server needs its own credentials, uncomment and set them.
# ABLY_API_KEY=placeholder_api_key
# ABLY_ACCESS_TOKEN=placeholder_access_token

# Docker Image Name (defaults within the script if not set)
# DOCKER_IMAGE_NAME=ably-cli-sandbox

# Max concurrent sessions (defaults within the script if not set)
# MAX_SESSIONS=50

# Enable debug logging if needed
# DEBUG=true
EOF

log "Setting permissions for environment file..."
chown root:"${SERVICE_GROUP}" "${ENV_CONFIG_FILE}"
chmod 640 "${ENV_CONFIG_FILE}" # Read access only for root and service group

# --- Create systemd Service File ---
log "Creating systemd service file /etc/systemd/system/${SERVICE_NAME}.service..."

cat << EOF > "/etc/systemd/system/${SERVICE_NAME}.service"
[Unit]
Description=Ably CLI Terminal Server
Documentation=https://github.com/ably/cli # Replace with your repo URL
After=network.target docker.service apparmor.service
Requires=docker.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${INSTALL_DIR}

# Load environment variables from config file
EnvironmentFile=${ENV_CONFIG_FILE}

# Command to start the server
# Make sure the path to node and the script are correct
# Using the compiled JS output in dist/
ExecStart=$(command -v node) ${INSTALL_DIR}/dist/scripts/terminal-server.js

# Restart policy
Restart=always
RestartSec=5

# Standard output/error logging
StandardOutput=journal
StandardError=journal

# Security settings
# NoNewPrivileges=true # Consider enabling if compatible
# PrivateTmp=true # Consider enabling if compatible

[Install]
WantedBy=multi-user.target
EOF

# --- Enable and Start Service ---
log "Reloading systemd daemon..."
systemctl daemon-reload

log "Enabling ${SERVICE_NAME} service to start on boot..."
systemctl enable "${SERVICE_NAME}.service"

# Delay starting until configuration is done manually
# log "Starting ${SERVICE_NAME} service..."
# systemctl start "${SERVICE_NAME}.service"

# log "Checking service status..."
# Give the service a moment to start
# sleep 5
# systemctl status "${SERVICE_NAME}.service" --no-pager || log_error "Service may have failed to start. Check logs with 'journalctl -u ${SERVICE_NAME}'"

# --- Final Instructions ---
log "-----------------------------------------------------"
log "Setup Complete!"
log ""
log "IMPORTANT: You MUST edit the environment file to configure required settings:"
log "  sudo nano ${ENV_CONFIG_FILE}"
log "Update at least the PORT if needed, and any necessary Ably credentials if the server requires them."
log ""
log "After editing the file, START the service for the first time:"
log "  sudo systemctl start ${SERVICE_NAME}"
log ""
log "To check the service status:"
log "  sudo systemctl status ${SERVICE_NAME}"
log ""
log "To view live logs:"
log "  sudo journalctl -f -u ${SERVICE_NAME}"
log "-----------------------------------------------------"

exit 0
