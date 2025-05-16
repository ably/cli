#!/usr/bin/env node
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { join, dirname, basename, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execSync } = require('node:child_process');

const OUT_TGZ_DIR = resolve('examples/web-cli/public/assets');
const OUT_TGZ = join(OUT_TGZ_DIR, 'webcontainer-fs.tgz');

function log(msg) { console.log(`[build-webcontainer-snapshot] ${msg}`); }
function run(cmd, cwd) { log(cmd); execSync(cmd, { cwd, stdio: 'inherit' }); }

function main() {
  const temp = mkdtempSync(join(tmpdir(), 'wcfs-'));
  log(`Created temp dir: ${temp}`);

  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'ably-wc', private: true }, null, 2));
  run('pnpm install --prod @ably/cli', temp);

  const fs = require('node:fs');
  fs.mkdirSync(OUT_TGZ_DIR, { recursive: true });
  const parent = dirname(temp);
  const base = basename(temp);
  run(`tar -czf ${OUT_TGZ} -C ${parent} ${base}`, process.cwd());
  log(`Snapshot written to ${OUT_TGZ}`);
  rmSync(temp, { recursive: true, force: true });
  log('Temp dir removed');
}

main(); 