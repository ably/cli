#!/bin/bash

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  # Use set -a to export all variables defined in .env
  set -a
  source .env
  set +a
fi

# Check if ABLY_API_KEY is set
if [ -z "$ABLY_API_KEY" ]; then
  echo "Error: ABLY_API_KEY is not set. Please set it in .env or export it."
  exit 1
fi

# Warn if ABLY_ACCESS_TOKEN is not set
if [ -z "$ABLY_ACCESS_TOKEN" ]; then
  echo "Warning: ABLY_ACCESS_TOKEN is not set. You can set it in .env or export it."
fi

# Prepare arguments for docker run
# Pass through ABLY_API_KEY
DOCKER_ARGS="-e ABLY_API_KEY=$ABLY_API_KEY"

# Pass through ABLY_ACCESS_TOKEN only if it is set
if [ -n "$ABLY_ACCESS_TOKEN" ]; then
  DOCKER_ARGS="$DOCKER_ARGS -e ABLY_ACCESS_TOKEN=$ABLY_ACCESS_TOKEN"
fi

# Run the docker container
echo "Running docker container ably-cli-sandbox..."
docker run -it --rm $DOCKER_ARGS ably-cli-sandbox 
