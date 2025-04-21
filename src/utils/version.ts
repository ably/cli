/**
 * Common utilities for version-related functionality
 */
import colorJson from 'color-json';

/**
 * Get standardized version information object
 */
export function getVersionInfo(config: { version: string; name: string; arch: string }): {
  version: string;
  name: string;
  arch: string;
  nodeVersion: string;
  platform: string;
} {
  return {
    version: config.version,
    name: config.name,
    arch: config.arch,
    nodeVersion: process.version,
    platform: process.platform,
  };
}

/**
 * Format version info as a standard string
 */
export function formatVersionString(config: { version: string; name: string; arch: string }): string {
  return `${config.name}/${config.version} ${process.platform}-${config.arch} ${process.version}`;
}

/**
 * Format version info as JSON based on flag preferences
 */
export function formatVersionJson(
  versionInfo: ReturnType<typeof getVersionInfo>,
  isPretty: boolean
): string {
  if (isPretty) {
    try {
      return colorJson(versionInfo);
    } catch {
      // Fallback to regular JSON.stringify if colorJson fails
      return JSON.stringify(versionInfo, null, 2);
    }
  }
  return JSON.stringify(versionInfo);
}
