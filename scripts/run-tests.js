import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveNpmCommand() {
  return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

async function runNpm(args, cwd) {
  const cmd = resolveNpmCommand(); // constant command mitigates injection risk
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(' ')} exited with ${code}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const root = path.join(__dirname, '..');
  const extraArgs = process.argv.slice(2);
  try {
    console.log('Running backend tests...');
    await runNpm(['test', ...extraArgs], path.join(root, 'backend'));
    console.log('All tests completed.');
  } catch (err) {
    console.error(err.message || err);
    process.exit(1);
  }
}

main();
