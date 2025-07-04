// Ensure process exits with code 130 when killed by SIGINT
// This is important for shell scripts and wrappers to detect Ctrl+C

// In wrapper mode, we want to ensure clean exit with 130
// In direct mode, we also want to ensure exit with 130 for consistency
setImmediate(() => {
  process.on('SIGINT', () => {
    // Set exit code to 130 (standard for SIGINT)
    process.exitCode = 130;
    
    // For non-interactive commands or if something goes wrong,
    // ensure we exit after a timeout
    setTimeout(() => {
      process.exit(130);
    }, 1000).unref();
  });
});

export {};