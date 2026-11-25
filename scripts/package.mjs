// Packages the compiled app into release/*.tgz using `npm pack` (a local artifact only; nothing is deployed).
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';

if (!existsSync('dist/server/server.js')) {
  console.error('dist/ is missing: run `npm run build` first.');
  process.exit(1);
}
mkdirSync('release', { recursive: true });
const out = execFileSync('npm', ['pack', '--pack-destination', 'release', '--silent'], { encoding: 'utf8', shell: true }).trim();
console.log(`Packaged artifact: release/${out.split(/\r?\n/).pop()}`);
