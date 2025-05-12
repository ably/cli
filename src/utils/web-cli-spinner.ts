/**
 * Provides a web-CLI-safe spinner implementation that prevents issues with terminal display
 * in the browser environment while maintaining normal Ora behavior in native terminal mode.
 */
import ora, { Options as OraOptions, Ora } from 'ora';

/**
 * Creates a spinner that's safe to use in both Web CLI and native CLI environments.
 * In Web CLI mode, it uses a simplified spinner that won't cause terminal display issues.
 * 
 * @param options String text or Ora options object
 * @returns A spinner instance that works in both environments
 */
export function createCliSafeSpinner(options: string | OraOptions): Ora {
  const isWebCliMode = process.env.ABLY_WEB_CLI_MODE === 'true';
  
  if (!isWebCliMode) {
    // In native terminal mode, use normal Ora behavior
    return typeof options === 'string' ? ora(options) : ora(options);
  }
  
  // In Web CLI mode, use a simplified spinner configuration
  const oraOptions: OraOptions = typeof options === 'string' 
    ? { text: options } 
    : { ...options };
    
  // Override spinner type and interval for web safety
  return ora({
    ...oraOptions,
    // Use 'line' spinner which uses simple characters and fewer cursor movements
    spinner: 'line',
    // Slightly slower interval to avoid potential race conditions
    interval: 120,
  });
}

/**
 * A completely non-animated spinner alternative for environments where
 * even the simplified spinner causes issues.
 * 
 * @param options String text or Ora options object
 * @returns A minimal spinner-like object that doesn't use animations
 */
export function createNonAnimatedSpinner(options: string | OraOptions): Ora {
  const text = typeof options === 'string' ? options : options.text || 'Loading...';
  
  console.log(`${text}`);
  
  // Return a mock Ora-like interface that doesn't animate
  return {
    start: () => mockSpinner,
    stop: () => {
      console.log('');
      return mockSpinner;
    },
    succeed: (message?: string) => {
      console.log(message || `✓ ${text} - Done`);
      return mockSpinner;
    },
    fail: (message?: string) => {
      console.log(message || `✗ ${text} - Failed`);
      return mockSpinner;
    },
    warn: (message?: string) => {
      console.log(message || `⚠ ${text} - Warning`);
      return mockSpinner;
    },
    info: (message?: string) => {
      console.log(message || `ℹ ${text} - Info`);
      return mockSpinner;
    },
    clear: () => mockSpinner,
    render: () => mockSpinner,
    frame: () => '',
    text: text,
    color: 'white',
    indent: 0,
    isSpinning: true,
    prefixText: '',
    suffixText: '',
  } as unknown as Ora;
}

const mockSpinner = {} as unknown as Ora;

// Default export is the safer spinner version
export default createCliSafeSpinner; 