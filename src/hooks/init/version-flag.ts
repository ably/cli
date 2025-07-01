import { Hook } from '@oclif/core';
import { getVersionInfo, formatVersionJson } from '../../utils/version.js';

/**
 * Hook to intercept the --version flag and support JSON output
 */
const hook: Hook<'init'> = async function (opts) {
  const { config } = opts;

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
      const jsonOutput = formatVersionJson(versionInfo, hasPrettyJsonFlag);
      console.log(jsonOutput);
      
      // In interactive mode, don't exit
      if (process.env.ABLY_INTERACTIVE_MODE === 'true') {
        // Throw a special error that the interactive command knows to ignore
        const error = new Error('Version displayed');
        (error as Error & {code?: string; exitCode?: number}).code = 'EEXIT';
        (error as Error & {code?: string; exitCode?: number}).exitCode = 0;
        throw error;
      } else {
        process.exit(0);
      }
    }
    // Otherwise, let oclif handle default format
  }
};

export default hook;
