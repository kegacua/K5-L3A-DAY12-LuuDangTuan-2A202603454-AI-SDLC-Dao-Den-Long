import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
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
  steps.push(runCmd(npmCmd, ['test'], 'Unit & headless test suite'));

  // Determinism check: run headless twice with identical args and compare SHA-256
  const run1 = runCmd(process.execPath, ['dist/headless.mjs', '--ticks', '120'], 'Headless determinism run #1');
  const run2 = runCmd(process.execPath, ['dist/headless.mjs', '--ticks', '120'], 'Headless determinism run #2');

  if (run1.ok && run2.ok) {
    const hash1 = createHash('sha256').update(run1.output).digest('hex');
    const hash2 = createHash('sha256').update(run2.output).digest('hex');
    const identical = run1.output === run2.output && hash1 === hash2;
    steps.push({
      ok: identical,
      label: 'Headless determinism comparison',
      command: 'sha256(run1) === sha256(run2)',
      elapsedMs: run1.elapsedMs + run2.elapsedMs,
      output: identical
        ? `IDENTICAL (sha256=${hash1})\noutput=${run1.output}`
        : `MISMATCH!\nrun1(${hash1}): ${run1.output}\nrun2(${hash2}): ${run2.output}`,
    });
  } else {
    steps.push(run1, run2);
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
