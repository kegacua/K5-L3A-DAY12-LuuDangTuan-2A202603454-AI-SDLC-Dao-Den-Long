export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface HelloWorldState {
  tick: number;
  time: number;
  lanternLit: boolean;
  fireflyPos: Vec3;
}

export interface HelloWorldConfig {
  orbitRadius: number;
  angularSpeed: number;
  baseHeight: number;
  bobAmplitude: number;
}

export const DEFAULT_HELLO_CONFIG: HelloWorldConfig = {
  orbitRadius: 3.0,
  angularSpeed: 1.25,
  baseHeight: 1.6,
  bobAmplitude: 0.35,
};

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function createHelloWorld(
  config: HelloWorldConfig = DEFAULT_HELLO_CONFIG,
): HelloWorldState {
  return {
    tick: 0,
    time: 0,
    lanternLit: true,
    fireflyPos: {
      x: round6(config.orbitRadius),
      y: round6(config.baseHeight),
      z: 0,
    },
  };
}

export function stepHelloWorld(
  state: HelloWorldState,
  dt: number,
  config: HelloWorldConfig = DEFAULT_HELLO_CONFIG,
): HelloWorldState {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new Error(`dt must be a positive finite number, got ${dt}`);
  }
  const nextTick = state.tick + 1;
  const nextTime = round6(nextTick * dt);
  const angle = nextTime * config.angularSpeed;

  return {
    tick: nextTick,
    time: nextTime,
    lanternLit: state.lanternLit,
    fireflyPos: {
      x: round6(Math.cos(angle) * config.orbitRadius),
      y: round6(config.baseHeight + Math.sin(angle * 2) * config.bobAmplitude),
      z: round6(Math.sin(angle) * config.orbitRadius),
    },
  };
}

export function runHelloSimulation(
  ticks: number,
  dt: number = 1 / 60,
  config: HelloWorldConfig = DEFAULT_HELLO_CONFIG,
): HelloWorldState {
  if (!Number.isInteger(ticks) || ticks < 0) {
    throw new Error(`ticks must be a non-negative integer, got ${ticks}`);
  }
  let state = createHelloWorld(config);
  for (let i = 0; i < ticks; i += 1) {
    state = stepHelloWorld(state, dt, config);
  }
  return state;
}
