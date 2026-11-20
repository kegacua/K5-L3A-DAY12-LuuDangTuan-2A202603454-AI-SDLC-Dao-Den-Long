import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const releaseDir = resolve(rootDir, 'dist/release');
const stagingDir = resolve(releaseDir, 'dao-den-long-v1.0.0');
const zipPath = resolve(releaseDir, 'dao-den-long-v1.0.0.zip');

if (!existsSync(resolve(rootDir, 'dist/web/index.html')) || !existsSync(resolve(rootDir, 'dist/headless.mjs'))) {
  throw new Error('Build outputs missing. Run `npm run build` first.');
}

rmSync(stagingDir, { recursive: true, force: true });
rmSync(zipPath, { force: true });
mkdirSync(stagingDir, { recursive: true });

cpSync(resolve(rootDir, 'dist/web'), resolve(stagingDir, 'web'), { recursive: true });
for (const f of ['dist/app.mjs', 'dist/headless.mjs', 'dist/bench.mjs', 'dist/soak.mjs']) {
  const base = f.replace(/^dist\//, '');
  cpSync(resolve(rootDir, f), resolve(stagingDir, base));
}
for (const f of ['game.contract.json', 'README.md', 'LICENSE', 'CREDITS.md']) {
  cpSync(resolve(rootDir, f), resolve(stagingDir, f));
}

writeFileSync(
  resolve(stagingDir, 'RUN_ME.txt'),
  [
    'Đảo Đèn Lồng v1.0.0 — Hướng dẫn chạy nhanh từ gói phát hành',
    '============================================================',
    'Cách 1 (Khuyến nghị, lưu bảng xếp hạng cục bộ + đầy đủ tính năng):',
    '  node app.mjs',
    '',
    'Cách 2 (Static web server thuần):',
    '  cd web && npx serve .',
    '  hoặc: cd web && python3 -m http.server 8080',
    '',
    'Chạy chế độ Headless (Contract v1.3):',
    '  node headless.mjs --seed 42 --night 1 --ticks 600 --out out.jsonl',
    '',
    'Chạy Benchmark 1280x720 & Soak Test 10 Đêm:',
    '  node bench.mjs --seed 42 --duration 30 --out bench.json',
    '  node --no-opt --expose-gc soak.mjs --seed 7 --nights 10 --out soak.json',
    '  node app.mjs --export-leaderboard out.json',
    '',
  ].join('\n'),
  'utf8',
);

if (process.platform === 'win32') {
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Compress-Archive -Path '${stagingDir}' -DestinationPath '${zipPath}' -Force`,
    ],
    { stdio: 'inherit' },
  );
} else {
  execFileSync('zip', ['-r', zipPath, 'dao-den-long-v1.0.0'], {
    cwd: releaseDir,
    stdio: 'inherit',
  });
}

process.stdout.write(`Packaged release archive: ${zipPath}\n`);
