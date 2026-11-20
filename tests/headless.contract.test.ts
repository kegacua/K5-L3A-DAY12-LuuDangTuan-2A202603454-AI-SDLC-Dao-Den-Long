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

function runCli(args: string[]) {
  return spawnSync(process.execPath, [bundlePath, ...args], { encoding: 'utf8' });
}

beforeAll(() => {
  if (!existsSync(bundlePath)) {
    execFileSync(process.execPath, [resolve(rootDir, 'scripts/build-headless.mjs')], {
      cwd: rootDir,
    });
  }
  tmpDir = mkdtempSync(join(os.tmpdir(), 'dao-den-long-p3-'));
});

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Headless CLI Test Contract v1.3 (Phase 1-3 Regression + Phase 4 Release)', () => {
  it('Phase 3: dawn_survived scenario (no early win when all 5 lit; wins at dawn with exact v1.2 snapshot fields)', () => {
    const outPath = join(tmpDir, 'p3-dawn.jsonl');
    const res = runCli([
      '--seed', '42', '--night', '1',
      '--scenario', join(scenariosDir, 'p3-dawn-survived.scenario.json'),
      '--inputs', join(scenariosDir, 'p3-dawn-survived.inputs.json'),
      '--ticks', '200', '--out', outPath, '--snapshot-every', '60',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);

    const snap0 = records[0]!;
    const player0 = snap0.player as { capacity: number };
    const lanterns0 = snap0.lanterns as Array<{ id: string; fuel: number; ever_lit: boolean; relit_count: number }>;
    expect(player0.capacity).toBe(10);
    expect(lanterns0[0]?.fuel).toBe(0);
    expect(lanterns0[1]?.fuel).toBe(80);
    expect(lanterns0[1]?.ever_lit).toBe(true);
    expect(lanterns0[1]?.relit_count).toBe(0);

    const go = records.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(go?.data).toEqual({ result: 'won', reason: 'dawn_survived' });
    const end = records[records.length - 1]!;
    expect(end.state).toBe('won');
    expect(end.ticks).toBe(120);
  });

  it('Phase 3: fuel decay -> lantern_out -> relight (cost 5, relight:true, capacity=12) -> refuel', () => {
    const outPath = join(tmpDir, 'p3-fuel.jsonl');
    const res = runCli([
      '--seed', '1', '--night', '1',
      '--scenario', join(scenariosDir, 'p3-fuel-refuel-relight.scenario.json'),
      '--inputs', join(scenariosDir, 'p3-fuel-refuel-relight.inputs.json'),
      '--ticks', '250', '--out', outPath, '--snapshot-every', '50',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);

    expect(records.some((r) => r.type === 'event' && r.name === 'lantern_out')).toBe(true);
    const litEv = records.find((r) => r.type === 'event' && r.name === 'lantern_lit');
    expect(litEv?.data).toEqual({ lantern_id: 'L1', relight: true });
    expect(records.some((r) => r.type === 'event' && r.name === 'refuel')).toBe(true);

    const snap250 = records.find((r) => r.type === 'snapshot' && r.tick === 250);
    const p250 = snap250?.player as { capacity: number };
    const l250 = snap250?.lanterns as Array<{ relit_count: number }>;
    expect(p250.capacity).toBe(12);
    expect(l250[0]?.relit_count).toBe(1);
  });

  it('Phase 3: draining Shade emits fuel_drain every 60 ticks and extinguishes weak lantern', () => {
    const outPath = join(tmpDir, 'p3-drain.jsonl');
    const res = runCli([
      '--seed', '2', '--night', '1',
      '--scenario', join(scenariosDir, 'p3-shade-drain-pulse.scenario.json'),
      '--inputs', join(scenariosDir, 'p3-shade-drain-pulse.inputs.json'),
      '--ticks', '300', '--out', outPath, '--snapshot-every', '30',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const drainEvents = records.filter((r) => r.type === 'event' && r.name === 'fuel_drain');
    expect(drainEvents.length).toBeGreaterThanOrEqual(4);
    expect(records.some((r) => r.type === 'event' && r.name === 'lantern_out')).toBe(true);
  });

  it('Phase 1-2 Regression: pulse, lose (dawn), dash, fall-respawn, night2 jump pad + charm, drifter, night3 tiers/wind, pause', () => {
    // Pulse
    const outPulse = join(tmpDir, 'pulse.jsonl');
    expect(
      runCli([
        '--seed', '11', '--night', '1',
        '--scenario', join(scenariosDir, 'pulse-safe-zone.scenario.json'),
        '--inputs', join(scenariosDir, 'pulse-safe-zone.inputs.json'),
        '--ticks', '25', '--out', outPulse, '--snapshot-every', '20',
      ]).status,
    ).toBe(0);
    const recP = parseJsonl(outPulse);
    expect(recP.find((r) => r.type === 'event' && r.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1'] });

    // Lose dawn
    const outDawn = join(tmpDir, 'dawn.jsonl');
    expect(
      runCli([
        '--seed', '5', '--night', '1',
        '--scenario', join(scenariosDir, 'lose-dawn.scenario.json'),
        '--ticks', '200', '--out', outDawn,
      ]).status,
    ).toBe(0);
    const recD = parseJsonl(outDawn);
    expect(recD[recD.length - 1]?.state).toBe('lost');

    // Dash
    const outDash = join(tmpDir, 'dash.jsonl');
    expect(
      runCli([
        '--seed', '1', '--night', '1',
        '--scenario', join(scenariosDir, 'p2-dash.scenario.json'),
        '--inputs', join(scenariosDir, 'p2-dash.inputs.json'),
        '--ticks', '20', '--out', outDash,
      ]).status,
    ).toBe(0);
    expect(parseJsonl(outDash).some((r) => r.type === 'event' && r.name === 'dash')).toBe(true);

    // Fall & respawn
    const outFall = join(tmpDir, 'fall.jsonl');
    expect(
      runCli([
        '--seed', '1', '--night', '1',
        '--scenario', join(scenariosDir, 'p2-fall-respawn.scenario.json'),
        '--inputs', join(scenariosDir, 'p2-fall-respawn.inputs.json'),
        '--ticks', '200', '--out', outFall,
      ]).status,
    ).toBe(0);
    expect(
      parseJsonl(outFall).find((r) => r.type === 'event' && r.name === 'player_hit')?.data,
    ).toEqual({ by: 'fall', flames: 2, dropped: 0, lost: 5 });

    // Night 2 Jump Pad + Charm
    const outN2 = join(tmpDir, 'n2.jsonl');
    expect(
      runCli([
        '--seed', '2', '--night', '2',
        '--scenario', join(scenariosDir, 'p2-night2-jumppad-charm.scenario.json'),
        '--inputs', join(scenariosDir, 'p2-night2-jumppad-charm.inputs.json'),
        '--ticks', '140', '--out', outN2, '--snapshot-every', '20',
      ]).status,
    ).toBe(0);
    const recN2 = parseJsonl(outN2);
    expect(recN2.some((r) => r.type === 'event' && r.name === 'charm_picked')).toBe(true);
    const s140 = recN2.find((r) => r.type === 'snapshot' && r.tick === 140);
    expect((s140?.player as { pos: number[] }).pos[0]).toBeGreaterThan(45);

    // Drifter steal + drop
    const outDrift = join(tmpDir, 'drift.jsonl');
    expect(
      runCli([
        '--seed', '3', '--night', '2',
        '--scenario', join(scenariosDir, 'p2-drifter-steal-drop.scenario.json'),
        '--inputs', join(scenariosDir, 'p2-drifter-steal-drop.inputs.json'),
        '--ticks', '30', '--out', outDrift,
      ]).status,
    ).toBe(0);
    const recDr = parseJsonl(outDrift);
    expect(recDr.some((r) => r.type === 'event' && r.name === 'drifter_steal')).toBe(true);
    expect(recDr.some((r) => r.type === 'event' && r.name === 'drifter_drop')).toBe(true);

    // Night 3 tiers + wind
    const outN3 = join(tmpDir, 'n3.jsonl');
    expect(
      runCli([
        '--seed', '4', '--night', '3',
        '--scenario', join(scenariosDir, 'p2-night3-tiers-wind.scenario.json'),
        '--inputs', join(scenariosDir, 'p2-night3-tiers-wind.inputs.json'),
        '--ticks', '1820', '--out', outN3, '--snapshot-every', '100',
      ]).status,
    ).toBe(0);
    const recN3 = parseJsonl(outN3);
    const sn100 = recN3.find((r) => r.type === 'snapshot' && r.tick === 100);
    expect((sn100?.player as { pos: number[] }).pos[1]).toBe(6);
    const sn1800 = recN3.find((r) => r.type === 'snapshot' && r.tick === 1800);
    expect((sn1800?.wind as { active: boolean }).active).toBe(true);

    // Pause/Resume
    const outPause = join(tmpDir, 'pause.jsonl');
    expect(
      runCli([
        '--seed', '7', '--night', '1',
        '--scenario', join(scenariosDir, 'p2-dash.scenario.json'),
        '--inputs', join(scenariosDir, 'p2-pause-resume.inputs.json'),
        '--ticks', '50', '--out', outPause, '--snapshot-every', '10',
      ]).status,
    ).toBe(0);
    const recPa = parseJsonl(outPause);
    expect(recPa.some((r) => r.type === 'event' && r.name === 'paused')).toBe(true);
    expect(recPa.some((r) => r.type === 'event' && r.name === 'resumed')).toBe(true);
  });

  it('Full Night 3 headless (18,000 ticks) finishes well within <= 30s and is deterministic', () => {
    const out1 = join(tmpDir, 'full-n3-1.jsonl');
    const out2 = join(tmpDir, 'full-n3-2.jsonl');

    const t0 = Date.now();
    const r1 = runCli([
      '--seed', '2026', '--night', '3', '--ticks', '18000',
      '--out', out1, '--snapshot-every', '60',
    ]);
    const elapsedMs = Date.now() - t0;
    expect(r1.status).toBe(0);
    expect(elapsedMs).toBeLessThan(30_000);

    const r2 = runCli([
      '--seed', '2026', '--night', '3', '--ticks', '18000',
      '--out', out2, '--snapshot-every', '60',
    ]);
    expect(r2.status).toBe(0);
    expect(readFileSync(out1, 'utf8')).toBe(readFileSync(out2, 'utf8'));
  });

  it('exits with code 2 on malformed inputs file', () => {
    const badInputs = join(tmpDir, 'bad-inputs.json');
    const outPath = join(tmpDir, 'bad-out.jsonl');
    writeFileSync(badInputs, JSON.stringify({ frames: [{ tick: 10 }, { tick: 5 }] }), 'utf8');
    const res = runCli([
      '--seed', '1', '--night', '1', '--inputs', badInputs, '--ticks', '20', '--out', outPath,
    ]);
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('strictly greater');
  });
});
