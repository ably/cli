#!/bin/bash

# Check if API key and access token are provided
if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <API_KEY> <ACCESS_TOKEN> [CLI_ARGS...]"
  echo "Example: $0 'appId.keyId:secret' 'your-access-token' channels list"
  exit 1
fi

API_KEY=$1
ACCESS_TOKEN=$2
shift 2

# Ensure the API key has the correct format
if ! [[ "$API_KEY" =~ ^[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+$ ]]; then
  echo "Error: Invalid API key format. Must be in the format APP_ID.KEY_ID:KEY_SECRET"
  exit 1
fi

# Execute the CLI in web CLI mode with verbose debugging
# Pass the command arguments first, then the API key flag at the end
NODE_DEBUG=ably DEBUG=1 ABLY_DEBUG=true ABLY_WEB_CLI_MODE=true ABLY_API_KEY="$API_KEY" ABLY_ACCESS_TOKEN="$ACCESS_TOKEN" bin/run.js "$@" --api-key="$API_KEY" 