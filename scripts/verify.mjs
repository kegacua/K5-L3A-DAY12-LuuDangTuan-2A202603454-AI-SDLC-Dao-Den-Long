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
  steps.push(runCmd(npmCmd, ['test'], 'Unit & headless contract test suite'));

  // Determinism check: run Test Contract v1.0 headless CLI twice on same seed & compare SHA-256
  const tmpDir = mkdtempSync(join(os.tmpdir(), 'ddl-verify-'));
  try {
    const out1 = join(tmpDir, 'run1.jsonl');
    const out2 = join(tmpDir, 'run2.jsonl');
    const winOut = join(tmpDir, 'win.jsonl');

    const run1 = runCmd(
      process.execPath,
      ['dist/headless.mjs', '--seed', '42', '--night', '1', '--ticks', '600', '--out', out1],
      'Headless determinism run #1',
    );
    const run2 = runCmd(
      process.execPath,
      ['dist/headless.mjs', '--seed', '42', '--night', '1', '--ticks', '600', '--out', out2],
      'Headless determinism run #2',
    );

    if (run1.ok && run2.ok) {
      const content1 = readFileSync(out1, 'utf8');
      const content2 = readFileSync(out2, 'utf8');
      const hash1 = createHash('sha256').update(content1).digest('hex');
      const hash2 = createHash('sha256').update(content2).digest('hex');
      const identical = content1 === content2 && hash1 === hash2;
      const lines = content1.trim().split(/\r?\n/);
      steps.push({
        ok: identical,
        label: 'Headless determinism comparison (seed=42, night=1, ticks=600)',
        command: 'sha256(run1.jsonl) === sha256(run2.jsonl)',
        elapsedMs: run1.elapsedMs + run2.elapsedMs,
        output: identical
          ? `IDENTICAL (sha256=${hash1}, lines=${lines.length})\nend=${lines[lines.length - 1]}`
          : `MISMATCH!\nrun1=${hash1}\nrun2=${hash2}`,
      });
    } else {
      steps.push(run1, run2);
    }

    // End-to-end Win scenario smoke check
    const winRun = runCmd(
      process.execPath,
      [
        'dist/headless.mjs',
        '--seed',
        '42',
        '--night',
        '1',
        '--scenario',
        'tests/scenarios/win-all-lit.scenario.json',
        '--inputs',
        'tests/scenarios/win-all-lit.inputs.json',
        '--ticks',
        '300',
        '--out',
        winOut,
      ],
      'Headless win scenario (win-all-lit)',
    );
    if (winRun.ok) {
      const winLines = readFileSync(winOut, 'utf8').trim().split(/\r?\n/);
      const endLine = JSON.parse(winLines[winLines.length - 1]);
      steps.push({
        ok: endLine.type === 'end' && endLine.state === 'won',
        label: 'Headless win scenario assertion',
        command: 'win-all-lit.scenario.json + win-all-lit.inputs.json',
        elapsedMs: winRun.elapsedMs,
        output: `lines=${winLines.length}\nend=${winLines[winLines.length - 1]}`,
      });
    } else {
      steps.push(winRun);
    }
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
