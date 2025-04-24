# Ably CLI Terminal Server Setup

This document describes how to set up the Ably CLI Terminal Server as a systemd service on a fresh Ubuntu server (tested on 22.04 LTS and 24.04 LTS).

## Prerequisites

- A server running Ubuntu 22.04 LTS (Jammy Jellyfish) or 24.04 LTS (Noble Numbat).
- `sudo` privileges on the server.
- Internet connectivity to download dependencies and clone the repository.
- Docker installed and running (the script will install it if not present).

## Quick Setup

This single command downloads the setup script from the GitHub repository and executes it. It handles installing dependencies (Node.js, pnpm, Docker), cloning the repository, building the project, creating a service user, and setting up the systemd service.

**Security Warning:** Always review scripts from the internet before running them with `sudo`.

```bash
curl -sSL https://raw.githubusercontent.com/ably/cli/main/scripts/setup-terminal-server.sh | sudo bash
```

*(Replace `https://raw.githubusercontent.com/ably/cli/main/scripts/setup-terminal-server.sh` with the correct raw URL if the script location changes)*

## Post-Setup Configuration

After the script completes successfully, you **must** configure the environment variables for the service:

1.  **Edit the configuration file:**
    ```bash
    sudo nano /etc/ably-terminal-server/config.env
    ```

2.  **Set required variables:**
    *   `PORT`: Ensure this is the desired port for the WebSocket server (default is `8080`).
    *   Review other variables like `DOCKER_IMAGE_NAME` and `MAX_SESSIONS` if you need to override the defaults.
    *   **Important:** If the terminal server *itself* requires specific Ably credentials (which is unlikely, as clients usually provide their own), uncomment and set `ABLY_API_KEY` and `ABLY_ACCESS_TOKEN`. Do not hardcode sensitive credentials directly if possible; consider using more secure methods if needed.

3.  **Save and close** the file (Ctrl+X, then Y, then Enter in `nano`).

## Starting and Managing the Service

Once configured, you can manage the service using `systemctl`:

*   **Start the service (first time):**
    ```bash
    sudo systemctl start ably-terminal-server
    ```

*   **Check the status:**
    ```bash
    sudo systemctl status ably-terminal-server
    ```

*   **View live logs:**
    ```bash
    sudo journalctl -f -u ably-terminal-server
    ```

*   **Stop the service:**
    ```bash
    sudo systemctl stop ably-terminal-server
    ```

*   **Restart the service (after configuration changes):**
    ```bash
    sudo systemctl restart ably-terminal-server
    ```

*   **Enable the service to start on boot (already done by the script):**
    ```bash
    sudo systemctl enable ably-terminal-server
    ```

*   **Disable the service from starting on boot:**
    ```bash
    sudo systemctl disable ably-terminal-server
    ```

## Script Details (`scripts/setup-terminal-server.sh`)

The setup script performs the following actions:

1.  **System Checks:** Verifies root privileges and Ubuntu version.
2.  **Install Prerequisites:** Installs `git`, `curl`, `gnupg`, `apparmor-utils`.
3.  **Install Docker:** Adds the Docker repository and installs the Docker engine.
4.  **Install Node.js & pnpm:** Installs Node.js (v22 LTS specified) and pnpm.
5.  **Create Service User/Group:** Creates a dedicated system user (`ablysrv`) and group (`ablysrv`) to run the service.
6.  **Clone Repository:** Clones the specified branch (`main` by default) of the Ably CLI repository into `/opt/ably-cli-terminal-server`.
7.  **Set Permissions:** Sets appropriate ownership and permissions for the installation directory.
8.  **Install Dependencies & Build:** Runs `pnpm install` and `pnpm prepare` as the service user.
9.  **Install AppArmor Profile:** Copies the AppArmor profile (if found) to `/etc/apparmor.d/` and attempts to load it.
10. **Create Configuration:** Creates the `/etc/ably-terminal-server/config.env` file for environment variables.
11. **Create Systemd Service:** Creates the `/etc/systemd/system/ably-terminal-server.service` file.
12. **Enable Service:** Reloads systemd and enables the service to start on boot.
13. **Provides Instructions:** Outputs final steps for configuration and starting the service.
