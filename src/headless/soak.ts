import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getNightDurationS, TICK_RATE } from '../core/config.js';
import { initRngState, nextRandom } from '../core/rng.js';
import { createDefaultInput, createWorld, stepWorld } from '../core/simulation.js';
import type { GamePhaseState, NightId, WorldState } from '../core/types.js';

interface SoakArgs {
  seed: number;
  nights: number;
  out: string;
}

function parseIntStrict(raw: string | undefined, flag: string): number {
  if (raw === undefined || !/^-?\d+$/.test(raw)) {
    throw new Error(`${flag} must be an integer, got: ${raw ?? '(missing)'}`);
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n)) {
    throw new Error(`${flag} out of safe integer range: ${raw}`);
  }
  return n;
}

function parseArgs(argv: string[]): SoakArgs {
  let seed = 7;
  let nights = 10;
  let out = 'soak.json';

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === '--help' || flag === '-h') {
      process.stdout.write(
        'Usage: node dist/soak.mjs --seed <int> --nights <int> --out <file.json>\n',
      );
      process.exit(0);
    } else if (flag === '--seed') {
      seed = parseIntStrict(argv[++i], '--seed');
    } else if (flag === '--nights') {
      nights = parseIntStrict(argv[++i], '--nights');
    } else if (flag === '--out') {
      const val = argv[++i];
      if (!val) throw new Error('--out requires a file path');
      out = val;
    } else {
      throw new Error(`Unknown argument: ${flag}`);
    }
  }

  if (nights <= 0) throw new Error('--nights must be positive');
  return { seed, nights, out };
}

function getRssMb(): number {
  return Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10;
}

function runSingleSoakNight(nightSeed: number, night: NightId): GamePhaseState {
  let world: WorldState | null = createWorld(nightSeed, night);
  const maxTicks = Math.round(getNightDurationS(night) * TICK_RATE) + 5;
  let rng = initRngState(nightSeed ^ 0x517cc1b7);
  const input = createDefaultInput();

  for (let t = 0; t < maxTicks; t += 1) {
    if (t % 30 === 0) {
      const r1 = nextRandom(rng);
      rng = r1.nextState;
      const r2 = nextRandom(rng);
      rng = r2.nextState;
      const angle = r1.value * Math.PI * 2;
      const mag = r2.value < 0.15 ? 0 : 1;
      input.move = [Math.cos(angle) * mag, Math.sin(angle) * mag];
    }

    const rJump = nextRandom(rng);
    rng = rJump.nextState;
    const rDash = nextRandom(rng);
    rng = rDash.nextState;
    const rPulse = nextRandom(rng);
    rng = rPulse.nextState;
    const rInteract = nextRandom(rng);
    rng = rInteract.nextState;

    input.jump = rJump.value < 0.05;
    input.dash = rDash.value < 0.03;
    input.pulse = rPulse.value < 0.02;
    input.interact = rInteract.value < 0.1;

    stepWorld(world, input);
    if (world.state === 'won' || world.state === 'lost') {
      break;
    }
  }

  const finalState = world.state;
  world = null;
  return finalState;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const startedMs = Date.now();
  const results: string[] = [];
  let crashes = 0;
  let memStartMb = 0;

  for (let i = 1; i <= args.nights; i += 1) {
    const night = (((i - 1) % 3) + 1) as NightId;
    const nightSeed = args.seed + i;
    try {
      const res = runSingleSoakNight(nightSeed, night);
      results.push(res === 'won' ? 'won' : 'lost');
    } catch (err) {
      crashes += 1;
      results.push('crash');
      process.stderr.write(
        `Soak crash on night #${i} (night=${night}, seed=${nightSeed}): ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
    if (i === 1) {
      if (typeof globalThis.gc === 'function') globalThis.gc();
      memStartMb = getRssMb();
    }
  }

  if (typeof globalThis.gc === 'function') globalThis.gc();
  const memEndMb = getRssMb();
  const durationS = Math.round(((Date.now() - startedMs) / 1000) * 100) / 100;

  const report = {
    nights: args.nights,
    crashes,
    results,
    mem_start_mb: memStartMb,
    mem_end_mb: memEndMb,
    duration_s: durationS,
  };

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(report)}\n`);

  if (crashes > 0) {
    process.exit(1);
  }
}

main();
