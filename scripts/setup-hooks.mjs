import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(resolve(rootDir, '.git'))) {
  process.stdout.write('Not a git repository; skipping hook setup.\n');
  process.exit(0);
}

execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
  cwd: rootDir,
  stdio: 'inherit',
});
process.stdout.write('Configured git core.hooksPath -> .githooks\n');
