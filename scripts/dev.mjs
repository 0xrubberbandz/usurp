import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const web = fileURLToPath(new URL('../apps/web/', import.meta.url));
const next = fileURLToPath(new URL('../apps/web/node_modules/next/dist/bin/next', import.meta.url));
if (!existsSync(next)) {
  console.error('Dependencies are missing. Run: npx pnpm@9.15.9 install');
  process.exit(1);
}
// Resolve Next directly so npm run dev also works without pnpm on PATH.
const child = spawn(process.execPath, [next, 'dev', ...process.argv.slice(2)], { cwd: web, stdio: 'inherit', env: process.env, windowsHide: true });
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
