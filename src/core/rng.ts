/**
 * Pure deterministic Mulberry32 PRNG.
 * Produces identical sequences across macOS, Linux, and Windows.
 */
export function initRngState(seed: number): number {
  return (seed >>> 0) || 0x9e3779b9;
}

export function nextRandom(state: number): { value: number; nextState: number } {
  let t = (state + 0x6d2b79f5) >>> 0;
  const nextState = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, nextState };
}

export function randomRange(
  state: number,
  min: number,
  max: number,
): { value: number; nextState: number } {
  const { value, nextState } = nextRandom(state);
  return { value: min + value * (max - min), nextState };
}
