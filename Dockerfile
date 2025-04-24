FROM node:22-alpine

WORKDIR /usr/src/app

# Install bash with readline support for better terminal interaction
# Add TCP wrappers and iptables for network security
RUN apk add --no-cache bash coreutils iptables tcpwrappers-utils

# Install Ably CLI globally
RUN npm install -g @ably/cli && \
    # Force npm to create package-lock.json which helps with module resolution
    npm init -y

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create directory for our custom scripts
RUN mkdir /scripts

# Copy scripts into the image
COPY docker/enhanced-restricted-shell.sh /scripts/restricted-shell.sh
COPY docker/network-security.sh /scripts/network-security.sh
COPY docker/seccomp-profile.json /scripts/seccomp-profile.json

# Make scripts executable
RUN chmod +x /scripts/restricted-shell.sh && \
    chmod +x /scripts/network-security.sh

# Switch to the non-root user
USER appuser

# Define default working directory
WORKDIR /usr/src/app

# Set environment variable to indicate web CLI mode
ENV ABLY_WEB_CLI_MODE=true

# Ensure PATH includes npm bins and our scripts directory
ENV PATH=/usr/local/lib/node_modules/.bin:/scripts:$PATH

# Use our network security script as the entrypoint
ENTRYPOINT ["/scripts/network-security.sh", "/scripts/restricted-shell.sh"]

# Empty CMD as default arguments for the entrypoint
CMD []
