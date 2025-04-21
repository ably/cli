import { Hook } from '@oclif/core';
import { getVersionInfo, formatVersionJson } from '../../utils/version.js';

/**
 * Hook to intercept the --version flag and support JSON output
 */
const hook: Hook<'init'> = async function (opts) {
  const { argv: _argv, config } = opts;

  // Use raw process.argv to guarantee we see all flags
  const rawArgv = process.argv.slice(2);

  // Check if version flag or command is present
  const hasVersionFlag = rawArgv.includes('--version') || rawArgv.includes('-v');
  const hasJsonFlag = rawArgv.includes('--json');
  const hasPrettyJsonFlag = rawArgv.includes('--pretty-json');

  // Only intercept standalone --version flag (not the "version" command)
  if (hasVersionFlag && !(rawArgv.includes('version') && rawArgv[0] === 'version')) {
    // Get basic version information using the shared utility
    const versionInfo = getVersionInfo(config);

    // Handle JSON output
    if (hasJsonFlag || hasPrettyJsonFlag) {
      console.log(formatVersionJson(versionInfo, hasPrettyJsonFlag));
      // Exit immediately to prevent default behavior
      process.exit(0);
    }
    // Otherwise, let oclif handle default format
  }
};

export default hook;
