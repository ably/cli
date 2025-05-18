import { mkdtempSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import { snapshot } from '@webcontainer/snapshot';
import { lstatSync, readlinkSync, copyFileSync, readdirSync, unlinkSync, existsSync } from 'node:fs';

const OUT_WCS = resolve('examples/web-cli/public/assets/ably.wcs');

function log(msg: string) {
  console.log(`[build-webcontainer-snapshot] ${msg}`);
}

function run(cmd: string, cwd: string) {
  log(cmd);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

async function main() {
  const temp = mkdtempSync(join(tmpdir(), 'wcfs-'));
  log(`Created temp dir: ${temp}`);

  // minimal package.json
  writeFileSync(
    join(temp, 'package.json'),
    JSON.stringify({ name: 'ably-wc', private: true }, null, 2),
  );

  // install production deps
  run('npm install --omit=dev --no-audit --no-fund @ably/cli', temp);

  // recursive dereference
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const stat = lstatSync(full);
      if (stat.isDirectory()) {
        walk(full);
      } else if (stat.isSymbolicLink()) {
        const target = readlinkSync(full, 'utf8');
        const resolved = join(dir, target);
        try {
          unlinkSync(full);
          copyFileSync(resolved, full);
          chmodSync(full, 0o755);
        } catch {}
      }
    }
  };

  walk(temp);

  // Make all wrappers in node_modules/.bin executable (some were regular files already)
  const binDirAll = join(temp, 'node_modules', '.bin');
  if (existsSync(binDirAll)) {
    for (const name of readdirSync(binDirAll)) {
      try {
        chmodSync(join(binDirAll, name), 0o755);
      } catch {}
    }
  }

  // Add a profile file to extend PATH silently at login (before snapshot)
  writeFileSync(join(temp, '.profile'), 'export PATH="$PATH:/node_modules/.bin"\n');

  // Ensure no symlinks remain anywhere (snapshot rejects dirs with links)
  const ensureNoLinks = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = lstatSync(full);
      if (st.isDirectory()) ensureNoLinks(full);
      else if (st.isSymbolicLink()) {
        const target = readlinkSync(full, 'utf8');
        const resolved = join(dir, target);
        try {
          unlinkSync(full);
          copyFileSync(resolved, full);
          chmodSync(full, 0o755);
        } catch {}
      }
    }
  };

  ensureNoLinks(temp);

  // Build WebContainer binary snapshot (.wcs)
  const buf = await snapshot(temp);
  writeFileSync(OUT_WCS, buf);
  log(`Snapshot written to ${OUT_WCS}`);

  rmSync(temp, { recursive: true, force: true });
  log('Temp dir removed');
}

main(); 