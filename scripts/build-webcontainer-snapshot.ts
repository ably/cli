import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT_TGZ = path.resolve('examples/web-cli/public/assets/webcontainer-fs.tgz');

function log(msg: string) {
  console.log(`[build-webcontainer-snapshot] ${msg}`);
}

function run(cmd: string, cwd: string) {
  log(cmd);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

function main() {
  const temp = mkdtempSync(path.join(tmpdir(), 'wcfs-'));
  log(`Created temp dir: ${temp}`);

  // minimal package.json
  writeFileSync(
    join(temp, 'package.json'),
    JSON.stringify({ name: 'ably-wc', private: true }, null, 2),
  );

  // install production deps
  run('pnpm install --prod @ably/cli', temp);

  // create tar.gz of the directory
  const parent = path.dirname(temp);
  const base = path.basename(temp);
  run(`tar -czf ${OUT_TGZ} -C ${parent} ${base}`, process.cwd());

  log(`Snapshot written to ${OUT_TGZ}`);

  rmSync(temp, { recursive: true, force: true });
  log('Temp dir removed');
}

main(); 