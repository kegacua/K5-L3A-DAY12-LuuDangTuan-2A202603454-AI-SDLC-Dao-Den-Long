import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreDir = resolve(process.cwd(), 'src/core');

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

describe('Architecture & determinism guardrails (src/core)', () => {
  const coreFiles = collectTsFiles(coreDir);

  it('has at least one core module', () => {
    expect(coreFiles.length).toBeGreaterThan(0);
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
});
