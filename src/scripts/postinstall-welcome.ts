#!/usr/bin/env node

import { displayLogo } from '../utils/logo.js';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Helper to require JSON files (like package.json) in ES modules
const require = createRequire(import.meta.url);

// Resolve __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load package.json to get the version
// Path from dist/scripts/postinstall-welcome.js to root package.json is ../../package.json
const packageJsonPath = path.resolve(__dirname, '../../package.json');
let version = 'unknown';
try {
  const packageJson = require(packageJsonPath);
  version = packageJson.version;
} catch (error) {
  // console.warn(`[postinstall] Could not read version from ${packageJsonPath}:`, error);
}

// Avoid printing during CI builds or Netlify deploys
if (process.env.CI || process.env.NETLIFY) {
  process.exit(0);
}

// Basic check to avoid running during local 'pnpm install' within the mono-repo or project itself.
// This isn't foolproof across all package managers and scenarios but helps reduce noise.
// It checks if a package.json exists in the directory where the install command was invoked.
try {
  const initialCwd = process.env.INIT_CWD || process.cwd();
  if (fs.existsSync(path.join(initialCwd, 'package.json'))) {
    // Likely a local development install or dependency install, suppress the message.
    // A log message here could be useful for debugging detection issues:
    // console.log(`[postinstall] Detected local install in ${initialCwd}. Skipping welcome message.`);
    process.exit(0);
  }
} catch (error) {
  // Ignore errors (like permission issues) and proceed with the message.
  // console.warn('[postinstall] Error checking for local package.json:', error);
}

// Display the logo using the imported function and console.log
displayLogo(console.log);

// Display the version
console.log(`   Version: ${version}\n`);

// Display the welcome messages
console.log('Ably CLI installed successfully!');
console.log('To get started, explore commands:');
console.log('  ably --help');
console.log('\nOr log in to your Ably account:');
console.log('  ably login'); 