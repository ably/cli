// For interactive mode, ensure SIGINT exits with code 130
if (process.argv.includes('interactive')) {
  process.env.ABLY_INTERACTIVE_MODE = 'true';
  await import('../dist/src/utils/sigint-exit.js');
}

import { execute } from "@oclif/core";

await execute({ development: true, dir: import.meta.url });
