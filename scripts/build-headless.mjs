import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  { entry: 'src/headless/cli.ts', out: 'dist/headless.mjs' },
  { entry: 'src/headless/soak.ts', out: 'dist/soak.mjs' },
  { entry: 'src/runtime/app.ts', out: 'dist/app.mjs' },
  { entry: 'src/runtime/bench.ts', out: 'dist/bench.mjs' },
];

for (const t of targets) {
  const outfile = resolve(rootDir, t.out);
  mkdirSync(dirname(outfile), { recursive: true });
  await build({
    entryPoints: [resolve(rootDir, t.entry)],
    outfile,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    sourcemap: false,
    logLevel: 'info',
  });
}
