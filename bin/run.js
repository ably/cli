#!/usr/bin/env node

import { execute } from "@oclif/core";

// Store original write function
const originalWrite = process.stdout.write;

// Override process.stdout.write
process.stdout.write = function(chunk, encoding, callback) {
  // Handle overloaded arguments
  if (typeof encoding === 'function') {
    callback = encoding;
    encoding = undefined;
  }
  
  // Process string chunks
  if (typeof chunk === 'string') {
    // Remove double newlines before example lines (lines starting with "  $")
    // This works regardless of ANSI escape codes in the output
    if (chunk.includes('  $')) {
      chunk = chunk.replace(/\n\n(  \$)/g, '\n$1');
    }
  }
  
  // Call original write
  return originalWrite.call(process.stdout, chunk, encoding, callback);
};

await execute({ 
  dir: import.meta.url,
});