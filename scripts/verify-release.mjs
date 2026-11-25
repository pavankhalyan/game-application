// Verifies the packaged artifact: extract it elsewhere, start it as a separate process, probe it over HTTP.
// This proves the .tgz runs locally. It does not deploy anything.
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
};

const tgz = existsSync('release') ? readdirSync('release').filter((f) => f.endsWith('.tgz')).sort().pop() : undefined;
if (!tgz) {
  console.error('No release/*.tgz found: run `npm run package` first.');
  process.exit(1);
}
const dir = mkdtempSync(path.join(tmpdir(), 'treasure-release-'));
// Run tar inside the target dir with a relative archive path: GNU tar treats "C:\..." as a remote host.
copyFileSync(path.resolve('release', tgz), path.join(dir, tgz));
execFileSync('tar', ['-xzf', tgz], { cwd: dir });
const pkgRoot = path.join(dir, 'package');
check('artifact extracted with compiled server', existsSync(path.join(pkgRoot, 'dist', 'server', 'server.js')), tgz);
check('artifact contains no TypeScript source', !existsSync(path.join(pkgRoot, 'src')));

const port = 4100 + Math.floor(Math.random() * 500);
const child = spawn(process.execPath, [path.join(pkgRoot, 'dist', 'server', 'server.js'), `--port=${port}`], { stdio: 'ignore' });
const base = `http://127.0.0.1:${port}`;
try {
  let up = false;
  for (let i = 0; i < 40 && !up; i++) {
    up = await fetch(`${base}/api/health`).then((r) => r.ok, () => false);
    if (!up) await new Promise((r) => setTimeout(r, 100));
  }
  check('process started and /api/health responds', up);
  if (up) {
    const page = await fetch(`${base}/`);
    check('GET / returns the page', page.status === 200 && (await page.text()).includes('Treasure Hunt'));
    const board = await fetch(`${base}/api/boards/reference`);
    const { parseConfig } = await import(new URL(`file:///${path.join(pkgRoot, 'dist', 'src', 'config.js').replace(/\\/g, '/')}`));
    check('GET /api/boards/reference passes parseConfig', board.status === 200 && parseConfig(await board.json()).ok);
    check('GET /js/main.js served', (await fetch(`${base}/js/main.js`)).status === 200);
  }
} finally {
  child.kill();
}
const failed = checks.filter((c) => !c).length;
console.log(failed === 0 ? `\nRelease verification: ALL ${checks.length} CHECKS PASSED (local only)` : `\nRelease verification: ${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
