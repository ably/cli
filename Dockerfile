FROM node:22-alpine

WORKDIR /usr/src/app

# Install bash with readline support for better terminal interaction
# Add security utilities for container hardening
# Add jq to parse package.json
RUN apk add --no-cache bash coreutils iptables bc curl jq

# Copy package.json to extract version
COPY package.json .

# Install Ably CLI globally using version from package.json
RUN CLI_VERSION=$(jq -r .version package.json) && \
    npm install -g @ably/cli@${CLI_VERSION} && \
    # Remove package.json after use
    rm package.json && \
    # Force npm to create package-lock.json which helps with module resolution
    npm init -y && \
    npm cache clean --force

# Make the lib directory to avoid permission issues
RUN mkdir -p /usr/local/lib/node_modules

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create directory for our custom scripts
RUN mkdir -p /scripts /var/log/ably-cli-security

# Copy scripts into the image
COPY docker/enhanced-restricted-shell.sh /scripts/restricted-shell.sh
COPY docker/network-security.sh /scripts/network-security.sh
COPY docker/run-ably-command.sh /scripts/run-ably-command.sh
COPY docker/seccomp-profile.json /scripts/seccomp-profile.json
COPY docker/apparmor-profile.conf /scripts/apparmor-profile.conf
COPY docker/install-apparmor.sh /scripts/install-apparmor.sh
COPY docker/security-monitor.sh /scripts/security-monitor.sh

# Make scripts executable
RUN chmod +x /scripts/restricted-shell.sh && \
    chmod +x /scripts/network-security.sh && \
    chmod +x /scripts/run-ably-command.sh && \
    chmod +x /scripts/install-apparmor.sh && \
    chmod +x /scripts/security-monitor.sh

# Ensure scripts directory and contents are owned by appuser
RUN chown -R appuser:appgroup /scripts

# Create log directory with proper permissions
RUN chown -R appuser:appgroup /var/log/ably-cli-security

# Switch to the non-root user
USER appuser

# Define default working directory
WORKDIR /usr/src/app

# Set environment variable to indicate web CLI mode
ENV ABLY_WEB_CLI_MODE=true

# Ensure PATH includes npm bins and our scripts directory
ENV PATH=/usr/local/lib/node_modules/.bin:/scripts:$PATH

# Use our network security script as the entrypoint - it will execute the shell script after setup
ENTRYPOINT ["/scripts/network-security.sh"]

# Default to starting the restricted shell in interactive mode
CMD ["/scripts/run-ably-command.sh"]
