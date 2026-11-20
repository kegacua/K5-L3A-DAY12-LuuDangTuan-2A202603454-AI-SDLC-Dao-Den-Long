import { describe, expect, it } from 'vitest';
import {
  createHelloWorld,
  DEFAULT_HELLO_CONFIG,
  runHelloSimulation,
  stepHelloWorld,
} from '../src/core/hello.js';

describe('CP0 core hello simulation', () => {
  it('initializes at tick 0 with firefly on orbit radius', () => {
    const state = createHelloWorld();
    expect(state.tick).toBe(0);
    expect(state.time).toBe(0);
    expect(state.lanternLit).toBe(true);
    expect(state.fireflyPos).toEqual({
      x: DEFAULT_HELLO_CONFIG.orbitRadius,
      y: DEFAULT_HELLO_CONFIG.baseHeight,
      z: 0,
    });
  });

  it('advances deterministically across fixed ticks', () => {
    const a = runHelloSimulation(120, 1 / 60);
    const b = runHelloSimulation(120, 1 / 60);
    expect(a).toEqual(b);
    expect(a.tick).toBe(120);
    expect(a.time).toBe(2);
  });

  it('rejects non-positive dt and negative ticks', () => {
    const state = createHelloWorld();
    expect(() => stepHelloWorld(state, 0)).toThrow();
    expect(() => stepHelloWorld(state, -0.016)).toThrow();
    expect(() => runHelloSimulation(-1)).toThrow();
  });
});
