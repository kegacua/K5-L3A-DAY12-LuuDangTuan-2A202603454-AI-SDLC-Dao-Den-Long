import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addLeaderboardEntry,
  isValidLeaderboardName,
  normalizeLeaderboardFile,
  type LeaderboardEntry,
} from '../src/core/leaderboard.js';
import { createBenchWorld, stepBenchWorld } from '../src/core/simulation.js';

const rootDir = resolve(process.cwd());
let tmpDir = '';

beforeAll(() => {
  if (!existsSync(resolve(rootDir, 'dist/soak.mjs')) || !existsSync(resolve(rootDir, 'dist/app.mjs'))) {
    execFileSync(process.execPath, [resolve(rootDir, 'scripts/build-headless.mjs')], {
      cwd: rootDir,
    });
  }
  tmpDir = mkdtempSync(join(os.tmpdir(), 'ddl-p4-test-'));
});

afterAll(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
});

describe('Phase 4 (Ticket-04 / Contract v1.3) Release, Leaderboard, Bench & Soak Tests', () => {
  it('validates leaderboard names (3-12 chars), sorts descending + earlier tie-break, and caps at top 10', () => {
    expect(isValidLeaderboardName('ab')).toBe(false);
    expect(isValidLeaderboardName('too_long_name_13')).toBe(false);
    expect(isValidLeaderboardName('bad!name')).toBe(false);
    expect(isValidLeaderboardName('May_01')).toBe(true);
    expect(isValidLeaderboardName('ĐènLồng')).toBe(true);

    let list: LeaderboardEntry[] = [];
    for (let i = 1; i <= 12; i += 1) {
      list = addLeaderboardEntry(list, {
        name: `Player_${i}`,
        score: i === 5 || i === 6 ? 900 : i * 100,
        nights_won: 3,
        achieved_at: `2026-11-20T16:${String(i).padStart(2, '0')}:00+07:00`,
        seed: 100 + i,
      });
    }

    expect(list).toHaveLength(10);
    expect(list[0]?.name).toBe('Player_12');
    expect(list[0]?.score).toBe(1200);
    // Tie at 900: Player_5 achieved earlier (16:05) than Player_6 (16:06)
    const idx5 = list.findIndex((e) => e.name === 'Player_5');
    const idx6 = list.findIndex((e) => e.name === 'Player_6');
    expect(idx5).toBeLessThan(idx6);
  });

  it('exports local disk leaderboard in exact sorted order via --export-leaderboard', () => {
    const dataDir = join(tmpDir, 'data');
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(
      join(dataDir, 'leaderboard.json'),
      JSON.stringify({
        entries: [
          { name: 'Slow_Tie', score: 500, nights_won: 1, achieved_at: '2026-11-20T17:00:00+07:00', seed: 2 },
          { name: 'Fast_Tie', score: 500, nights_won: 1, achieved_at: '2026-11-20T16:00:00+07:00', seed: 1 },
          { name: 'Top_Hero', score: 1500, nights_won: 3, achieved_at: '2026-11-20T16:30:00+07:00', seed: 3 },
        ],
      }),
      'utf8',
    );

    const outPath = join(tmpDir, 'exported-lb.json');
    const res = spawnSync(
      process.execPath,
      [resolve(rootDir, 'dist/app.mjs'), '--export-leaderboard', outPath],
      {
        encoding: 'utf8',
        env: { ...process.env, DDL_DATA_DIR: dataDir },
      },
    );
    expect(res.status).toBe(0);

    const exported = normalizeLeaderboardFile(JSON.parse(readFileSync(outPath, 'utf8')));
    expect(exported.entries.map((e) => e.name)).toEqual(['Top_Hero', 'Fast_Tie', 'Slow_Tie']);
  });

  it('builds Ticket-04 standardized benchmark scene (200 wander Shades, 100 motes, L1-L3 lit @100, static Mây)', () => {
    const bench = createBenchWorld(42);
    expect(bench.shades).toHaveLength(200);
    expect(bench.shades.every((s) => s.state === 'wander')).toBe(true);
    expect(bench.motes).toHaveLength(100);
    expect(bench.lanterns.slice(0, 3).every((l) => l.lit && l.fuelSixtieths === 6000)).toBe(true);
    expect(bench.lanterns.slice(3).every((l) => !l.lit)).toBe(true);

    const initialMotes = bench.motes.length;
    for (let i = 0; i < 120; i += 1) {
      stepBenchWorld(bench);
    }
    expect(bench.player.pos).toEqual([0, 0, 0]);
    expect(bench.player.flames).toBe(3);
    expect(bench.motes).toHaveLength(initialMotes);
    expect(bench.lanterns[0]?.fuelSixtieths).toBe(6000);
    expect(bench.state).toBe('playing');
  });

  it('runs soak test CLI across multiple nights with 0 crashes and stable memory', () => {
    const soakOut = join(tmpDir, 'soak-3.json');
    const res = spawnSync(
      process.execPath,
      ['--no-opt', '--expose-gc', resolve(rootDir, 'dist/soak.mjs'), '--seed', '7', '--nights', '3', '--out', soakOut],
      { encoding: 'utf8' },
    );
    expect(res.status).toBe(0);
    const parsed = JSON.parse(readFileSync(soakOut, 'utf8'));
    expect(parsed.nights).toBe(3);
    expect(parsed.crashes).toBe(0);
    expect(parsed.results).toHaveLength(3);
    expect(parsed.mem_end_mb).toBeLessThanOrEqual(parsed.mem_start_mb * 1.2);
  });
});
