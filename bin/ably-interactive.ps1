# Ably Interactive Shell Wrapper for Windows
# This script provides seamless Ctrl+C handling by automatically
# restarting the CLI when it exits due to interruption

$ErrorActionPreference = "Stop"

# Configuration
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AblyBin = Join-Path $ScriptDir "run.cmd"
$AblyConfigDir = Join-Path $env:USERPROFILE ".ably"
$HistoryFile = Join-Path $AblyConfigDir "history"
$ExitCodeUserExit = 42
$WelcomeShown = $false

# Check if Node.js is available
try {
    $null = Get-Command node -ErrorAction Stop
} catch {
    Write-Host "Error: Node.js is required but not found in PATH" -ForegroundColor Red
    exit 1
}

# Create config directory if it doesn't exist
if (!(Test-Path $AblyConfigDir)) {
    New-Item -ItemType Directory -Path $AblyConfigDir -Force | Out-Null
}

# Initialize history file
if (!(Test-Path $HistoryFile)) {
    New-Item -ItemType File -Path $HistoryFile -Force | Out-Null
}

# Main loop
while ($true) {
    # Set environment variables
    $env:ABLY_HISTORY_FILE = $HistoryFile
    $env:ABLY_WRAPPER_MODE = "1"
    
    if ($WelcomeShown) {
        $env:ABLY_SUPPRESS_WELCOME = "1"
    }
    
    # Run the CLI
    & cmd /c $AblyBin interactive
    $ExitCode = $LASTEXITCODE
    
    # Mark welcome as shown after first run
    $WelcomeShown = $true
    
    # Check exit code
    switch ($ExitCode) {
        $ExitCodeUserExit {
            # User typed 'exit' - break the loop
            break
        }
        130 {
            # SIGINT (Ctrl+C) equivalent - continue loop silently
            # The new prompt will appear automatically
            continue
        }
        0 {
            # Normal exit (shouldn't happen in interactive mode)
            # But if it does, exit gracefully
            break
        }
        default {
            # Other error - show message and restart
            Write-Host "`nProcess exited unexpectedly (code: $ExitCode)" -ForegroundColor Red
            Start-Sleep -Milliseconds 500
        }
    }
}

# Exit message is handled by the CLI itself
exit 0