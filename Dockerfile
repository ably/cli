FROM node:22-alpine

WORKDIR /usr/src/app

# Install Ably CLI globally and create required symlinks
RUN npm install -g @ably/cli && \
    # Force npm to create package-lock.json which helps with module resolution
    npm init -y

# Create a non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create directory for our custom scripts
RUN mkdir /scripts

# Copy the restricted shell script into the image
COPY scripts/restricted-shell.sh /scripts/restricted-shell.sh

# Make the script executable
RUN chmod +x /scripts/restricted-shell.sh

# Switch to the non-root user
USER appuser

# Define default working directory
WORKDIR /usr/src/app

# Ensure PATH includes npm bins and our scripts directory
ENV PATH=/usr/local/lib/node_modules/.bin:/scripts:$PATH

# Set the entrypoint to our restricted shell
ENTRYPOINT ["/scripts/restricted-shell.sh"]

# Empty CMD as default arguments for the entrypoint
CMD [] 