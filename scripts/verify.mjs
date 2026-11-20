import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function parseArgs(argv) {
  let phase = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--phase' && argv[i + 1]) {
      phase = argv[i + 1];
      i += 1;
    }
  }
  return { phase };
}

function runCmd(cmd, args, label) {
  const started = Date.now();
  try {
    const out = execFileSync(cmd, args, {
      cwd: rootDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32' && cmd.endsWith('.cmd'),
    });
    const elapsedMs = Date.now() - started;
    return { ok: true, label, command: `${cmd} ${args.join(' ')}`, elapsedMs, output: out.trim() };
  } catch (err) {
    const elapsedMs = Date.now() - started;
    const stdout = err.stdout ? String(err.stdout) : '';
    const stderr = err.stderr ? String(err.stderr) : '';
    return {
      ok: false,
      label,
      command: `${cmd} ${args.join(' ')}`,
      elapsedMs,
      output: `${stdout}\n${stderr}`.trim(),
    };
  }
}

function checkTrackedSecrets() {
  const res = runCmd('git', ['ls-files'], 'Secret file scan');
  if (!res.ok) return res;
  const files = res.output.split(/\r?\n/).filter(Boolean);
  const forbidden = files.filter(
    (f) => /(^|\/)\.env($|\.)/i.test(f) && !/\.env\.example$/i.test(f),
  );
  if (forbidden.length > 0) {
    return {
      ...res,
      ok: false,
      output: `Tracked secret files detected: ${forbidden.join(', ')}`,
    };
  }
  return { ...res, output: `OK (${files.length} tracked files checked, 0 .env files)` };
}

function getGitHead() {
  const res = runCmd('git', ['rev-parse', '--short', 'HEAD'], 'git head');
  return res.ok ? res.output : 'uncommitted';
}

function main() {
  const { phase } = parseArgs(process.argv.slice(2));
  const steps = [];

  steps.push(checkTrackedSecrets());
  steps.push(runCmd(npmCmd, ['run', 'typecheck'], 'TypeScript typecheck'));
  steps.push(runCmd(npmCmd, ['run', 'build'], 'Build web + headless'));
  steps.push(runCmd(npmCmd, ['test'], 'Unit & headless contract v1.2 test suite'));

  const tmpDir = mkdtempSync(join(os.tmpdir(), 'ddl-verify-'));
  try {
    // Determinism check across Nights 1, 2, 3
    for (const night of ['1', '2', '3']) {
      const out1 = join(tmpDir, `n${night}-r1.jsonl`);
      const out2 = join(tmpDir, `n${night}-r2.jsonl`);
      const r1 = runCmd(
        process.execPath,
        ['dist/headless.mjs', '--seed', '42', '--night', night, '--ticks', '1200', '--out', out1],
        `Headless Night ${night} determinism run #1`,
      );
      const r2 = runCmd(
        process.execPath,
        ['dist/headless.mjs', '--seed', '42', '--night', night, '--ticks', '1200', '--out', out2],
        `Headless Night ${night} determinism run #2`,
      );
      if (r1.ok && r2.ok) {
        const c1 = readFileSync(out1, 'utf8');
        const c2 = readFileSync(out2, 'utf8');
        const h1 = createHash('sha256').update(c1).digest('hex');
        const h2 = createHash('sha256').update(c2).digest('hex');
        const lines = c1.trim().split(/\r?\n/);
        steps.push({
          ok: c1 === c2 && h1 === h2,
          label: `Headless Night ${night} determinism (seed=42, ticks=1200)`,
          command: `sha256(n${night}-r1) === sha256(n${night}-r2)`,
          elapsedMs: r1.elapsedMs + r2.elapsedMs,
          output: `IDENTICAL (sha256=${h1}, lines=${lines.length})\nend=${lines[lines.length - 1]}`,
        });
      } else {
        steps.push(r1, r2);
      }
    }

    // Performance check: Full Night 3 (18,000 ticks = 300s in v1.2) <= 30,000 ms
    const benchOut = join(tmpDir, 'bench-n3.jsonl');
    const bench = runCmd(
      process.execPath,
      [
        'dist/headless.mjs',
        '--seed',
        '2026',
        '--night',
        '3',
        '--ticks',
        '18000',
        '--out',
        benchOut,
        '--snapshot-every',
        '10',
      ],
      'Headless full Night 3 benchmark (18,000 ticks <= 30s)',
    );
    const benchLines = bench.ok ? readFileSync(benchOut, 'utf8').trim().split(/\r?\n/) : [];
    steps.push({
      ok: bench.ok && bench.elapsedMs <= 30_000,
      label: 'Headless full Night 3 performance budget (<= 30,000ms)',
      command: 'node dist/headless.mjs --seed 2026 --night 3 --ticks 18000 --snapshot-every 10',
      elapsedMs: bench.elapsedMs,
      output: bench.ok
        ? `COMPLETED in ${bench.elapsedMs}ms (budget 30000ms), lines=${benchLines.length}\nend=${benchLines[benchLines.length - 1]}`
        : bench.output,
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }

  const allPassed = steps.every((s) => s.ok);
  const lines = [
    `=== VERIFY REPORT (${phase ?? 'adhoc'}) ===`,
    `Timestamp: ${new Date().toISOString()}`,
    `Git HEAD:  ${getGitHead()}`,
    `Node:      ${process.version}`,
    `Platform:  ${os.platform()} ${os.arch()} (${os.cpus()[0]?.model ?? 'unknown CPU'})`,
    `Status:    ${allPassed ? 'PASS' : 'FAIL'}`,
    '',
  ];

  for (const s of steps) {
    lines.push(`[${s.ok ? 'PASS' : 'FAIL'}] ${s.label} (${s.elapsedMs}ms)`);
    lines.push(`$ ${s.command}`);
    if (s.output) {
      lines.push(s.output);
    }
    lines.push('');
  }

  const report = lines.join('\n');
  process.stdout.write(report);

  if (phase) {
    const proofDir = resolve(rootDir, 'docs/proof');
    mkdirSync(proofDir, { recursive: true });
    const proofPath = resolve(proofDir, `${phase}-verify.log`);
    writeFileSync(proofPath, report, 'utf8');
    process.stdout.write(`Saved verification proof to docs/proof/${phase}-verify.log\n`);
  }

  if (!allPassed) {
    process.exit(1);
  }
}

main();
