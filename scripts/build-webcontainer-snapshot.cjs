#!/usr/bin/env node
const { mkdtempSync, rmSync, writeFileSync, chmodSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { tmpdir } = require('node:os');
const { execSync } = require('node:child_process');
const { snapshot } = require('@webcontainer/snapshot');

const OUT_DIR = resolve('examples/web-cli/public/assets');
const OUT_WCS = join(OUT_DIR, 'ably.wcs');

function log(msg) { console.log(`[build-webcontainer-snapshot] ${msg}`); }
function run(cmd, cwd) { log(cmd); execSync(cmd, { cwd, stdio: 'inherit' }); }

function main() {
  const temp = mkdtempSync(join(tmpdir(), 'wcfs-'));
  log(`Created temp dir: ${temp}`);

  writeFileSync(join(temp, 'package.json'), JSON.stringify({ name: 'ably-wc', private: true }, null, 2));
  run('npm install --omit=dev --no-audit --no-fund @ably/cli', temp);

  const fs = require('node:fs');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // Dereference symlinks in node_modules/.bin because snapshot util
  // does not support symbolic links.
  const { lstatSync, readlinkSync, copyFileSync, readdirSync } = require('node:fs');
  const binDir = join(temp, 'node_modules', '.bin');
  if (fs.existsSync(binDir)) {
    for (const entry of readdirSync(binDir)) {
      const full = join(binDir, entry);
      const stat = lstatSync(full);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(full, 'utf8');
        const resolved = join(binDir, target);
        // overwrite link with actual file
        fs.unlinkSync(full);
        copyFileSync(resolved, full);
        chmodSync(full, 0o755);
      }
    }
  }

  function deref(dir) {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) {
        deref(full);
      } else if (stat.isSymbolicLink()) {
        const target = readlinkSync(full, 'utf8');
        const resolved = join(dir, target);
        try {
          fs.unlinkSync(full);
          copyFileSync(resolved, full);
          chmodSync(full, 0o755);
        } catch {}
      }
    }
  }

  deref(temp);

  // Make all wrappers executable
  const binAll = join(temp, 'node_modules', '.bin');
  if (fs.existsSync(binAll)) {
    for (const name of readdirSync(binAll)) {
      try { chmodSync(join(binAll, name), 0o755); } catch {}
    }
  }

  // Add profile to extend PATH silently
  fs.writeFileSync(join(temp, '.profile'), 'export PATH="$PATH:/node_modules/.bin"\n');

  // Ensure no symlinks remain anywhere
  function ensureNoLinks(dir){
    for(const name of readdirSync(dir)){
      const full = join(dir, name);
      const st = lstatSync(full);
      if(st.isDirectory()) ensureNoLinks(full);
      else if(st.isSymbolicLink()){
        const target = readlinkSync(full, 'utf8');
        const resolved = join(dir, target);
        try{
          fs.unlinkSync(full);
          copyFileSync(resolved, full);
          chmodSync(full, 0o755);
        }catch{}
      }
    }
  }

  ensureNoLinks(temp);

  snapshot(temp).then(buf => {
    fs.writeFileSync(OUT_WCS, buf);
    log(`Snapshot written to ${OUT_WCS}`);
    rmSync(temp, { recursive: true, force: true });
    log('Temp dir removed');
  }).catch(err => {
    console.error(err);
    process.exit(1);
  });
}

main(); 