import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const rootDir = resolve(process.cwd());
const bundlePath = resolve(rootDir, 'dist/headless.mjs');
const scenariosDir = resolve(rootDir, 'tests/scenarios');

let tmpDir = '';

function parseJsonl(filePath: string): Array<Record<string, unknown>> {
  const text = readFileSync(filePath, 'utf8').trim();
  return text.split(/\r?\n/).map((line) => JSON.parse(line));
}

beforeAll(() => {
  if (!existsSync(bundlePath)) {
    execFileSync(process.execPath, [resolve(rootDir, 'scripts/build-headless.mjs')], {
      cwd: rootDir,
    });
  }
  tmpDir = mkdtempSync(join(os.tmpdir(), 'dao-den-long-test-'));
});

afterAll(() => {
  if (tmpDir) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('Headless CLI Test Contract v1.0 End-to-End', () => {
  it('runs full win scenario (collect 3 motes -> deposit -> light L1 -> all_lit)', () => {
    const outPath = join(tmpDir, 'win.jsonl');
    const res = spawnSync(
      process.execPath,
      [
        bundlePath,
        '--seed',
        '42',
        '--night',
        '1',
        '--scenario',
        join(scenariosDir, 'win-all-lit.scenario.json'),
        '--inputs',
        join(scenariosDir, 'win-all-lit.inputs.json'),
        '--ticks',
        '300',
        '--out',
        outPath,
        '--snapshot-every',
        '20',
      ],
      { encoding: 'utf8' },
    );

    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    expect(records[0]?.type).toBe('snapshot');
    expect(records[0]?.tick).toBe(0);

    const events = records.filter((r) => r.type === 'event');
    const names = events.map((e) => e.name);
    expect(names).toEqual([
      'mote_picked',
      'mote_picked',
      'mote_picked',
      'deposit',
      'lantern_lit',
      'game_over',
    ]);

    const last = records[records.length - 1];
    expect(last?.type).toBe('end');
    expect(last?.state).toBe('won');
    expect(last?.ticks).toBe(141);
    expect(Number(last?.score)).toBeGreaterThan(700);
  });

  it('runs pulse scenario and verifies stunned state + push + score', () => {
    const outPath = join(tmpDir, 'pulse.jsonl');
    const res = spawnSync(
      process.execPath,
      [
        bundlePath,
        '--seed',
        '11',
        '--night',
        '1',
        '--scenario',
        join(scenariosDir, 'pulse-safe-zone.scenario.json'),
        '--inputs',
        join(scenariosDir, 'pulse-safe-zone.inputs.json'),
        '--ticks',
        '20',
        '--out',
        outPath,
        '--snapshot-every',
        '10',
      ],
      { encoding: 'utf8' },
    );

    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const pulseEvent = records.find((r) => r.type === 'event' && r.name === 'pulse');
    expect(pulseEvent?.tick).toBe(1);
    expect(pulseEvent?.data).toEqual({ stunned_ids: ['S1'] });

    const snap10 = records.find((r) => r.type === 'snapshot' && r.tick === 10);
    const shades = snap10?.shades as Array<{ id: string; state: string; pos: number[] }>;
    expect(shades[0]?.state).toBe('stunned');
    expect(shades[0]?.pos[0]).toBe(11);
  });

  it('runs lose scenarios (no_flames and dawn)', () => {
    const outFlames = join(tmpDir, 'lose-flames.jsonl');
    const r1 = spawnSync(
      process.execPath,
      [
        bundlePath,
        '--seed',
        '5',
        '--night',
        '1',
        '--scenario',
        join(scenariosDir, 'lose-no-flames.scenario.json'),
        '--ticks',
        '200',
        '--out',
        outFlames,
      ],
      { encoding: 'utf8' },
    );
    expect(r1.status).toBe(0);
    const rec1 = parseJsonl(outFlames);
    const go1 = rec1.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(go1?.data).toEqual({ result: 'lost', reason: 'no_flames' });
    expect(rec1[rec1.length - 1]?.state).toBe('lost');

    const outDawn = join(tmpDir, 'lose-dawn.jsonl');
    const r2 = spawnSync(
      process.execPath,
      [
        bundlePath,
        '--seed',
        '5',
        '--night',
        '1',
        '--scenario',
        join(scenariosDir, 'lose-dawn.scenario.json'),
        '--ticks',
        '200',
        '--out',
        outDawn,
      ],
      { encoding: 'utf8' },
    );
    expect(r2.status).toBe(0);
    const rec2 = parseJsonl(outDawn);
    const go2 = rec2.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(go2?.data).toEqual({ result: 'lost', reason: 'dawn' });
    expect(rec2[rec2.length - 1]?.ticks).toBe(60);
  });

  it('is bit-for-bit deterministic across two full randomized runs with identical seed', () => {
    const out1 = join(tmpDir, 'det1.jsonl');
    const out2 = join(tmpDir, 'det2.jsonl');
    for (const out of [out1, out2]) {
      const r = spawnSync(
        process.execPath,
        [bundlePath, '--seed', '1337', '--night', '1', '--ticks', '600', '--out', out],
        { encoding: 'utf8' },
      );
      expect(r.status).toBe(0);
    }
    expect(readFileSync(out1, 'utf8')).toBe(readFileSync(out2, 'utf8'));
  });

  it('exits with code 2 and stderr message on malformed inputs file', () => {
    const badInputs = join(tmpDir, 'bad-inputs.json');
    const outPath = join(tmpDir, 'bad-out.jsonl');
    writeFileSync(
      badInputs,
      JSON.stringify({ frames: [{ tick: 10 }, { tick: 5 }] }),
      'utf8',
    );
    const res = spawnSync(
      process.execPath,
      [
        bundlePath,
        '--seed',
        '1',
        '--night',
        '1',
        '--inputs',
        badInputs,
        '--ticks',
        '20',
        '--out',
        outPath,
      ],
      { encoding: 'utf8' },
    );
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('strictly greater');
  });
});
