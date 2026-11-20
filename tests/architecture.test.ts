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

describe('Architecture, determinism & Contract v1.1 sync guardrails', () => {
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

  it('keeps game.contract.json verbatim in sync with Ticket-02 standardized v1.1 tuning', () => {
    const raw = JSON.parse(readFileSync(resolve(rootDir, 'game.contract.json'), 'utf8'));
    expect(raw.contract_version).toBe('1.1');
    expect(raw.team).toBe('2A202603454-LuuDangTuan');
    expect(raw.tuning).toEqual(DEFAULT_TUNING);
    expect(GAME_CONTRACT).toEqual(raw);

    // Spot-check mandatory Ticket-02 standardized values
    expect(raw.tuning.player_speed).toBe(6.0);
    expect(raw.tuning.carry_capacity).toBe(10);
    expect(raw.tuning.lantern_cost).toBe(10);
    expect(raw.tuning.pickup_radius).toBe(1.0);
    expect(raw.tuning.interact_radius).toBe(2.0);
    expect(raw.tuning.pulse_cost).toBe(3);
    expect(raw.tuning.pulse_radius).toBe(5.0);
    expect(raw.tuning.dash_speed).toBe(14.0);
    expect(raw.tuning.dash_duration_s).toBe(0.2);
    expect(raw.tuning.dash_cooldown_s).toBe(1.5);
    expect(raw.tuning.night1_duration_s).toBe(300);
    expect(raw.tuning.night2_duration_s).toBe(330);
    expect(raw.tuning.night3_duration_s).toBe(360);
    expect(raw.tuning.fall_enabled).toBe(true);
  });
});
