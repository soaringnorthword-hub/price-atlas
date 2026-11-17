import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const children = [];

function run(label, args) {
  const p = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  p.on('exit', (code) => {
    if (code !== 0) console.log(`[${label}] exited with ${code}`);
    shutdown();
  });
  children.push(p);
  return p;
}

let closing = false;
function shutdown() {
  if (closing) return;
  closing = true;
  for (const c of children) {
    if (!c.killed) c.kill();
  }
  setTimeout(() => process.exit(0), 120);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

console.log('[price-atlas] 启动 API（5178）+ Vite（5177）…\n');
run('api', [path.join(root, 'server', 'index.mjs')]);
setTimeout(() => run('web', [viteBin]), 700);
