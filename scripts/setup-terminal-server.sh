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
NODE_SERVICE_NAME="ably-terminal-server" # Renamed for clarity
CADDY_SERVICE_NAME="caddy"
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

log "Installing prerequisites: git, curl, ca-certificates, gnupg, apparmor-utils, ufw, debian-keyring, debian-archive-keyring, apt-transport-https..."
apt-get install -y git curl ca-certificates gnupg apparmor-utils ufw debian-keyring debian-archive-keyring apt-transport-https

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

# --- Install Caddy ---
log "Installing Caddy web server..."
apt-get install -y curl gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt-get update -y
apt-get install -y caddy
log "Caddy installed successfully."

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
# Environment variables for Ably Terminal Server & Caddy
# !!! IMPORTANT: Replace placeholder values below !!!

# == Terminal Server Settings ==
# The port the Node.js WebSocket server will listen on (internal only)
TERMINAL_SERVER_PORT=8080

# == Caddy Reverse Proxy Settings ==
# The domain name Caddy will use for automatic HTTPS (REQUIRED)
SERVER_DOMAIN=your-domain.example.com

# The email address Caddy will use for Let's Encrypt registration (REQUIRED)
ADMIN_EMAIL=your-email@example.com

# == Optional Terminal Server Settings ==
# Docker Image Name (defaults within the script if not set)
# DOCKER_IMAGE_NAME=ably-cli-sandbox
# Max concurrent sessions (defaults within the script if not set)
# MAX_SESSIONS=50
# Enable debug logging if needed
# DEBUG=true
EOF

log "Setting permissions for environment file..."
chown root:root "${ENV_CONFIG_FILE}"
chmod 600 "${ENV_CONFIG_FILE}" # Restrict access to root only

# --- Create Node.js systemd Service File ---
log "Creating systemd service file for Node.js server /etc/systemd/system/${NODE_SERVICE_NAME}.service..."

cat << EOF > "/etc/systemd/system/${NODE_SERVICE_NAME}.service"
[Unit]
Description=Ably CLI Terminal Server (Node.js Backend)
Documentation=${GITHUB_REPO_URL}
After=network.target docker.service apparmor.service
Requires=docker.service

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_GROUP}
WorkingDirectory=${INSTALL_DIR}

# Load ONLY the Terminal Server Port from the config file
# Caddy will use its own environment loading mechanism if needed
Environment="PORT=$(grep -E '^TERMINAL_SERVER_PORT=' ${ENV_CONFIG_FILE} | cut -d '=' -f2)"
# Pass other optional env vars if they exist in the file
Environment="DOCKER_IMAGE_NAME=$(grep -E '^DOCKER_IMAGE_NAME=' ${ENV_CONFIG_FILE} | cut -d '=' -f2 || echo '')"
Environment="MAX_SESSIONS=$(grep -E '^MAX_SESSIONS=' ${ENV_CONFIG_FILE} | cut -d '=' -f2 || echo '')"
Environment="DEBUG=$(grep -E '^DEBUG=' ${ENV_CONFIG_FILE} | cut -d '=' -f2 || echo '')"

ExecStart=$(command -v node) ${INSTALL_DIR}/dist/scripts/terminal-server.js

Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# --- Create Caddyfile for Reverse Proxy ---
log "Creating Caddyfile /etc/caddy/Caddyfile..."
# Use environment variables within Caddyfile
cat << EOF > "/etc/caddy/Caddyfile"
{
    # Email for ACME TLS certificates
    email {$ADMIN_EMAIL}
    # Optional: Increase TLS handshake timeout
    # tls {
    #    handshake_timeout 60s
    # }
}

# The domain Caddy will manage
{$SERVER_DOMAIN} {
    # Reverse proxy requests to the Node.js terminal server
    reverse_proxy localhost:{$TERMINAL_SERVER_PORT} {
        # Required for WebSocket connections
        header_up Host {host}
        header_up X-Real-IP {remote_ip}
        header_up X-Forwarded-For {remote_ip}
        header_up X-Forwarded-Proto {scheme}
    }

    # Optional: Add security headers
    # header {
    #    Strict-Transport-Security "max-age=31536000;"
    #    X-Content-Type-Options "nosniff"
    #    X-Frame-Options "DENY"
    #    Referrer-Policy "strict-origin-when-cross-origin"
    # }

    # Enable access logging
    log {
        output file /var/log/caddy/access.log {
            roll_size 100mb
            roll_keep 10
            roll_keep_for 720h
        }
        format json
    }
}
EOF

# --- Configure Caddy Systemd Service ---
log "Configuring Caddy systemd service to use environment variables..."
# Create an override file to load environment variables for Caddy
SYSTEMD_CADDY_OVERRIDE_DIR="/etc/systemd/system/${CADDY_SERVICE_NAME}.service.d"
mkdir -p "${SYSTEMD_CADDY_OVERRIDE_DIR}"
cat << EOF > "${SYSTEMD_CADDY_OVERRIDE_DIR}/override.conf"
[Service]
EnvironmentFile=${ENV_CONFIG_FILE}
EOF

# --- Configure Firewall (UFW) ---
log "Configuring firewall (UFW)..."
ufw allow ssh # Ensure SSH access is allowed
ufw allow http # Allow port 80 for ACME challenges
ufw allow https # Allow port 443 for Caddy HTTPS
ufw --force enable # Enable UFW (use --force to avoid prompt)
log "Firewall configured. Status:"
ufw status verbose

# --- Enable and Start Services ---
log "Reloading systemd daemon..."
systemctl daemon-reload

log "Enabling ${NODE_SERVICE_NAME} service to start on boot..."
systemctl enable "${NODE_SERVICE_NAME}.service"

log "Enabling ${CADDY_SERVICE_NAME} service to start on boot..."
systemctl enable "${CADDY_SERVICE_NAME}.service"

# Delay starting until configuration is done manually
# log "Starting ${NODE_SERVICE_NAME} service..."
# systemctl start "${NODE_SERVICE_NAME}.service"
# log "Starting ${CADDY_SERVICE_NAME} service..."
# systemctl start "${CADDY_SERVICE_NAME}.service"

# --- Final Instructions ---
log "-----------------------------------------------------"
log "Setup Complete!"
log ""
log "IMPORTANT: You MUST edit the environment file to configure required settings:"
log "  sudo nano ${ENV_CONFIG_FILE}"
log "Set AT LEAST 'SERVER_DOMAIN' and 'ADMIN_EMAIL'. Ensure 'TERMINAL_SERVER_PORT' is correct."
log "Ensure your domain's DNS A/AAAA record points to this server's public IP address."
log ""
log "After editing the file, START the services for the first time:"
log "  sudo systemctl start ${NODE_SERVICE_NAME}"
log "  sudo systemctl start ${CADDY_SERVICE_NAME}"
log ""
log "To check the Node.js service status:"
log "  sudo systemctl status ${NODE_SERVICE_NAME}"
log "To view Node.js logs:"
log "  sudo journalctl -f -u ${NODE_SERVICE_NAME}"
log ""
log "To check the Caddy service status (for HTTPS/proxy issues):"
log "  sudo systemctl status ${CADDY_SERVICE_NAME}"
log "To view Caddy logs:"
log "  sudo journalctl -f -u ${CADDY_SERVICE_NAME}"
log "-----------------------------------------------------"

exit 0
