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

describe('Architecture, determinism & contract sync guardrails', () => {
  const coreFiles = collectTsFiles(coreDir);

  it('has core simulation modules', () => {
    expect(coreFiles.length).toBeGreaterThanOrEqual(4);
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

  it('keeps game.contract.json verbatim in sync with core tuning and schema v1.0', () => {
    const raw = JSON.parse(readFileSync(resolve(rootDir, 'game.contract.json'), 'utf8'));
    expect(raw.contract_version).toBe('1.0');
    expect(raw.team).toBe('2A202603454-LuuDangTuan');
    expect(raw.tuning.lantern_count_night1).toBe(5);
    expect(raw.tuning).toEqual(DEFAULT_TUNING);
    expect(GAME_CONTRACT).toEqual(raw);
  });
});
