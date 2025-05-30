#!/bin/bash
# install-apparmor.sh - Script to install and load the AppArmor profile

set -e

# Determine if AppArmor is available and active
if [ ! -d "/sys/kernel/security/apparmor" ]; then
  echo "AppArmor is not available on this system. Skipping profile installation."
  exit 0
fi

# Check if we have the necessary tools
if ! command -v apparmor_parser &> /dev/null; then
  echo "apparmor_parser command not found. Checking for package manager..."
  if command -v apt-get &> /dev/null; then
    echo "Installing AppArmor tools with apt..."
    apt-get update && apt-get install -y apparmor apparmor-utils
  elif command -v yum &> /dev/null; then
    echo "Installing AppArmor tools with yum..."
    yum install -y apparmor apparmor-utils
  elif command -v apk &> /dev/null; then
    echo "Installing AppArmor tools with apk..."
    apk add --no-cache apparmor apparmor-utils
  else
    echo "No supported package manager found. AppArmor tools must be installed manually."
    echo "AppArmor profile installation skipped."
    exit 0
  fi
fi

# Check again if apparmor_parser is available after installation attempt
if ! command -v apparmor_parser &> /dev/null; then
  echo "AppArmor parser not available after installation attempt. Skipping profile installation."
  exit 0
fi

# Get the directory of this script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROFILE_NAME="ably-cli-sandbox-profile"
PROFILE_PATH="/etc/apparmor.d/docker-ably-cli-sandbox"

# Create the apparmor.d directory if it doesn't exist
mkdir -p "$(dirname "$PROFILE_PATH")"

# Copy the AppArmor profile to the system directory
echo "Installing AppArmor profile to $PROFILE_PATH..."
cp "$SCRIPT_DIR/apparmor-profile.conf" "$PROFILE_PATH"

# Load the profile
echo "Loading AppArmor profile..."
apparmor_parser -r -W "$PROFILE_PATH" || {
  echo "Failed to load AppArmor profile. This might be due to an unsupported system."
  echo "AppArmor profile installation failed, but we'll continue."
  exit 0
}

# Verify that the profile is loaded
if apparmor_parser -QT "$PROFILE_PATH" 2>/dev/null; then
  echo "AppArmor profile $PROFILE_NAME loaded successfully."
else
  echo "AppArmor profile verification failed, but we'll continue."
  exit 0
fi

echo "AppArmor profile installation completed."
echo
echo "To use this profile with Docker, add the following to your container create options:"
echo "SecurityOpt: ['apparmor=$PROFILE_NAME']"
echo
echo "Note: You'll need to rerun this script if you modify the profile."

exit 0
