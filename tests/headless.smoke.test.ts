import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const rootDir = resolve(process.cwd());
const bundlePath = resolve(rootDir, 'dist/headless.mjs');

describe('CP0 headless CLI smoke & determinism', () => {
  it('produces identical JSON output across two runs', () => {
    if (!existsSync(bundlePath)) {
      execFileSync(process.execPath, [resolve(rootDir, 'scripts/build-headless.mjs')], {
        cwd: rootDir,
      });
    }

    const run1 = execFileSync(process.execPath, [bundlePath, '--ticks', '60'], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    const run2 = execFileSync(process.execPath, [bundlePath, '--ticks', '60'], {
      cwd: rootDir,
      encoding: 'utf8',
    });

    expect(run1).toBe(run2);
    const parsed = JSON.parse(run1);
    expect(parsed.mode).toBe('cp0-hello-headless');
    expect(parsed.ticks).toBe(60);
    expect(parsed.state.tick).toBe(60);
    expect(parsed.state.time).toBe(1);
  });
});
