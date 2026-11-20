import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, GAME_CONTRACT } from '../src/core/config.js';

const rootDir = resolve(process.cwd());
const coreDir = resolve(rootDir, 'src/core');

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.endsWith('.ts')) {
      results.push(fullPath);
    }
  }
  return results;
}

describe('Architecture, determinism & Contract v1.2 sync guardrails', () => {
  const coreFiles = collectTsFiles(coreDir);

  it('has modular pure core files including maps', () => {
    expect(coreFiles.length).toBeGreaterThanOrEqual(5);
  });

  it('forbids Three.js and browser DOM imports in src/core/', () => {
    const forbiddenImport = /from\s+['"]three(\/[^'"]*)?['"]|\b(window|document)\b/;
    for (const file of coreFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `Forbidden render/DOM reference in ${file}`).not.toMatch(forbiddenImport);
    }
  });

  it('forbids non-deterministic APIs (Date.now, performance.now, Math.random) in src/core/', () => {
    const nonDeterministic = /\b(Date\.now|performance\.now|Math\.random)\s*\(/;
    for (const file of coreFiles) {
      const content = readFileSync(file, 'utf8');
      expect(content, `Non-deterministic call in ${file}`).not.toMatch(nonDeterministic);
    }
  });

  it('keeps game.contract.json verbatim in sync with Ticket-03 Contract v1.2 tuning', () => {
    const raw = JSON.parse(readFileSync(resolve(rootDir, 'game.contract.json'), 'utf8'));
    expect(raw.contract_version).toBe('1.2');
    expect(raw.team).toBe('2A202603454-LuuDangTuan');
    expect(raw.tuning).toEqual(DEFAULT_TUNING);
    expect(GAME_CONTRACT).toEqual(raw);

    // Mandatory Ticket-03 v1.2 values
    expect(raw.tuning.fuel_max).toBe(100);
    expect(raw.tuning.fuel_decay_per_s).toBe(1.0);
    expect(raw.tuning.fuel_per_mote).toBe(10);
    expect(raw.tuning.relight_cost).toBe(5);
    expect(raw.tuning.win_ratio).toBe(0.6);
    expect(raw.tuning.drain_per_s).toBe(5);
    expect(raw.tuning.low_fuel_threshold).toBe(30);
    expect(raw.tuning.capacity_max).toBe(20);
    expect(raw.tuning.night1_duration_s).toBe(240);
    expect(raw.tuning.night2_duration_s).toBe(270);
    expect(raw.tuning.night3_duration_s).toBe(300);
    expect(raw.tuning.score.per_mote).toBe(5);
    expect(raw.tuning.score.per_second_left).toBe(0);
  });
});
