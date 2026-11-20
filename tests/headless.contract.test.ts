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
  tmpDir = mkdtempSync(join(os.tmpdir(), 'dao-den-long-p2-'));
});

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Headless CLI Test Contract v1.1 (Phase 1 Regression + Phase 2 Features)', () => {
  it('Phase 1 Regression: win-all-lit scenario produces deposit, lantern_lit, game_over(won)', () => {
    const outPath = join(tmpDir, 'win.jsonl');
    const res = runCli([
      '--seed', '42', '--night', '1',
      '--scenario', join(scenariosDir, 'win-all-lit.scenario.json'),
      '--inputs', join(scenariosDir, 'win-all-lit.inputs.json'),
      '--ticks', '300', '--out', outPath, '--snapshot-every', '20',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const snap0 = records[0]!;
    expect(snap0.type).toBe('snapshot');
    expect(snap0.night).toBe(1);
    expect(Array.isArray(snap0.drifters)).toBe(true);
    expect(Array.isArray(snap0.charms)).toBe(true);

    const names = records.filter((r) => r.type === 'event').map((e) => e.name);
    expect(names).toContain('mote_picked');
    expect(names).toContain('deposit');
    expect(names).toContain('lantern_lit');
    expect(names).toContain('game_over');
    expect(records[records.length - 1]?.state).toBe('won');
  });

  it('Phase 1 Regression: pulse-safe-zone & lose (no_flames / dawn) scenarios', () => {
    const outPulse = join(tmpDir, 'pulse.jsonl');
    const rPulse = runCli([
      '--seed', '11', '--night', '1',
      '--scenario', join(scenariosDir, 'pulse-safe-zone.scenario.json'),
      '--inputs', join(scenariosDir, 'pulse-safe-zone.inputs.json'),
      '--ticks', '25', '--out', outPulse, '--snapshot-every', '20',
    ]);
    expect(rPulse.status).toBe(0);
    const recP = parseJsonl(outPulse);
    const pulseEv = recP.find((r) => r.type === 'event' && r.name === 'pulse');
    expect(pulseEv?.data).toEqual({ stunned_ids: ['S1'] });
    const snap20 = recP.find((r) => r.type === 'snapshot' && r.tick === 20);
    const shades = snap20?.shades as Array<{ state: string; pos: number[] }>;
    expect(shades[0]?.state).toBe('stunned');
    expect(shades[0]?.pos[0]).toBeCloseTo(7.5, 1);

    const outDawn = join(tmpDir, 'dawn.jsonl');
    const rDawn = runCli([
      '--seed', '5', '--night', '1',
      '--scenario', join(scenariosDir, 'lose-dawn.scenario.json'),
      '--ticks', '200', '--out', outDawn,
    ]);
    expect(rDawn.status).toBe(0);
    const recD = parseJsonl(outDawn);
    expect(recD[recD.length - 1]?.state).toBe('lost');
    expect(recD[recD.length - 1]?.ticks).toBe(60);
  });

  it('Phase 2 Feature: Dash scenario emits dash event and moves at 14 m/s', () => {
    const outPath = join(tmpDir, 'dash.jsonl');
    const res = runCli([
      '--seed', '1', '--night', '1',
      '--scenario', join(scenariosDir, 'p2-dash.scenario.json'),
      '--inputs', join(scenariosDir, 'p2-dash.inputs.json'),
      '--ticks', '20', '--out', outPath, '--snapshot-every', '12',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    expect(records.some((r) => r.type === 'event' && r.name === 'dash')).toBe(true);
    const snap12 = records.find((r) => r.type === 'snapshot' && r.tick === 12);
    const player = snap12?.player as { pos: number[]; dash_cd_s: number };
    expect(player.pos[2]).toBeGreaterThan(2.5);
    expect(player.dash_cd_s).toBeGreaterThan(1.2);
  });

  it('Phase 2 Feature: Fall off island emits player_hit(fall, lost) and respawns at (0,0,0)', () => {
    const outPath = join(tmpDir, 'fall.jsonl');
    const res = runCli([
      '--seed', '1', '--night', '1',
      '--scenario', join(scenariosDir, 'p2-fall-respawn.scenario.json'),
      '--inputs', join(scenariosDir, 'p2-fall-respawn.inputs.json'),
      '--ticks', '200', '--out', outPath, '--snapshot-every', '50',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const fallHit = records.find((r) => r.type === 'event' && r.name === 'player_hit');
    expect(fallHit?.data).toEqual({ by: 'fall', flames: 2, dropped: 0, lost: 5 });
    const lastSnap = [...records].reverse().find((r) => r.type === 'snapshot');
    const player = lastSnap?.player as { pos: number[]; flames: number; carried: number };
    expect(player.pos).toEqual([0, 0, 0]);
    expect(player.flames).toBe(2);
    expect(player.carried).toBe(0);
  });

  it('Phase 2 Feature: Night 2 Bùa Gió + Jump Pad launches Mây from Island A to Island B', () => {
    const outPath = join(tmpDir, 'night2-pad.jsonl');
    const res = runCli([
      '--seed', '2', '--night', '2',
      '--scenario', join(scenariosDir, 'p2-night2-jumppad-charm.scenario.json'),
      '--inputs', join(scenariosDir, 'p2-night2-jumppad-charm.inputs.json'),
      '--ticks', '140', '--out', outPath, '--snapshot-every', '20',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    expect(records.some((r) => r.type === 'event' && r.name === 'charm_picked')).toBe(true);
    const snap140 = records.find((r) => r.type === 'snapshot' && r.tick === 140);
    const player = snap140?.player as { pos: number[]; grounded: boolean };
    // Landed on Island B (center at x = 70, radius = 28 -> x in [42, 98])
    expect(player.pos[0]).toBeGreaterThan(45);
    expect(player.grounded).toBe(true);
  });

  it('Phase 2 Feature: Gió Lạc (Drifter) steals motes and drops them when pulsed', () => {
    const outPath = join(tmpDir, 'drifter.jsonl');
    const res = runCli([
      '--seed', '3', '--night', '2',
      '--scenario', join(scenariosDir, 'p2-drifter-steal-drop.scenario.json'),
      '--inputs', join(scenariosDir, 'p2-drifter-steal-drop.inputs.json'),
      '--ticks', '30', '--out', outPath, '--snapshot-every', '10',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    expect(records.some((r) => r.type === 'event' && r.name === 'drifter_steal')).toBe(true);
    expect(records.some((r) => r.type === 'event' && r.name === 'drifter_drop')).toBe(true);
  });

  it('Phase 2 Feature: Night 3 Jump Pad lands on Tier 2 (Y=6) and Wind activates at tick 1800', () => {
    const outPath = join(tmpDir, 'night3.jsonl');
    const res = runCli([
      '--seed', '4', '--night', '3',
      '--scenario', join(scenariosDir, 'p2-night3-tiers-wind.scenario.json'),
      '--inputs', join(scenariosDir, 'p2-night3-tiers-wind.inputs.json'),
      '--ticks', '1820', '--out', outPath, '--snapshot-every', '100',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    const snap100 = records.find((r) => r.type === 'snapshot' && r.tick === 100);
    const p100 = snap100?.player as { pos: number[]; grounded: boolean };
    expect(p100.pos[1]).toBe(6);
    expect(p100.grounded).toBe(true);

    const snap1800 = records.find((r) => r.type === 'snapshot' && r.tick === 1800);
    const wind = snap1800?.wind as { active: boolean };
    expect(wind.active).toBe(true);
  });

  it('Phase 2 Feature: Pause & Resume freezes sim_tick and emits paused/resumed events', () => {
    const outPath = join(tmpDir, 'pause.jsonl');
    const res = runCli([
      '--seed', '7', '--night', '1',
      '--scenario', join(scenariosDir, 'p2-dash.scenario.json'),
      '--inputs', join(scenariosDir, 'p2-pause-resume.inputs.json'),
      '--ticks', '50', '--out', outPath, '--snapshot-every', '10',
    ]);
    expect(res.status).toBe(0);
    const records = parseJsonl(outPath);
    expect(records.some((r) => r.type === 'event' && r.name === 'paused')).toBe(true);
    expect(records.some((r) => r.type === 'event' && r.name === 'resumed')).toBe(true);
    const snap30 = records.find((r) => r.type === 'snapshot' && r.tick === 30);
    expect(snap30?.state).toBe('paused');
    expect(snap30?.sim_tick).toBe(10);
  });

  it('Full Night 3 headless (21,600 ticks) finishes well within <= 30s and is deterministic', () => {
    const out1 = join(tmpDir, 'full-n3-1.jsonl');
    const out2 = join(tmpDir, 'full-n3-2.jsonl');

    const t0 = Date.now();
    const r1 = runCli([
      '--seed', '2026', '--night', '3', '--ticks', '21600',
      '--out', out1, '--snapshot-every', '60',
    ]);
    const elapsedMs = Date.now() - t0;
    expect(r1.status).toBe(0);
    expect(elapsedMs).toBeLessThan(30_000);

    const r2 = runCli([
      '--seed', '2026', '--night', '3', '--ticks', '21600',
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
