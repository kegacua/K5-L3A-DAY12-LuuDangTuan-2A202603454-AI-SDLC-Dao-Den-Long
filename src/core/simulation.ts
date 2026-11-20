import {
  DEFAULT_ISLAND_RADIUS,
  DEFAULT_TUNING,
  FIXED_DT,
  GRAVITY,
  INITIAL_RANDOM_MOTES,
  INITIAL_RANDOM_SHADES,
  JUMP_VELOCITY,
  MAX_RANDOM_MOTES,
  MAX_RANDOM_SHADES,
  MOTE_RESPAWN_TICKS,
  NIGHT1_LANTERNS,
  SHADE_MIN_SPAWN_PLAYER_DIST,
  SHADE_RESPAWN_TICKS,
  TICK_RATE,
} from './config.js';
import { initRngState, randomRange } from './rng.js';
import type {
  EffectiveInput,
  EndRecord,
  EventRecord,
  InputsFile,
  LanternState,
  MoteEntity,
  OutputRecord,
  ScenarioConfig,
  ShadeEntity,
  SnapshotRecord,
  TuningConfig,
  Vec3Tuple,
  WorldState,
} from './types.js';

export function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundVec3(v: Vec3Tuple): Vec3Tuple {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}

export function distXZ(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function allocateUniqueId(prefix: string, nextCounter: { value: number }, existingIds: Set<string>): string {
  let id: string;
  do {
    id = `${prefix}${nextCounter.value}`;
    nextCounter.value += 1;
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

function clampToRadius(pos: Vec3Tuple, radius: number): void {
  const d = Math.hypot(pos[0], pos[2]);
  if (d > radius && d > 1e-9) {
    const scale = radius / d;
    pos[0] *= scale;
    pos[2] *= scale;
  }
}

function enforceShadeSafeZones(
  shade: ShadeEntity,
  lanterns: LanternState[],
  safeRadius: number,
  islandRadius: number,
): void {
  if (safeRadius <= 0) return;
  const targetDist = safeRadius + 0.05;

  for (let pass = 0; pass < 3; pass += 1) {
    let pushed = false;
    for (const lantern of lanterns) {
      if (!lantern.lit) continue;
      const dx = shade.pos[0] - lantern.pos[0];
      const dz = shade.pos[2] - lantern.pos[2];
      const d = Math.hypot(dx, dz);
      if (d <= safeRadius + 0.005) {
        if (d < 1e-6) {
          shade.pos[0] = lantern.pos[0] + targetDist;
          shade.pos[2] = lantern.pos[2];
        } else {
          const scale = targetDist / d;
          shade.pos[0] = lantern.pos[0] + dx * scale;
          shade.pos[2] = lantern.pos[2] + dz * scale;
        }
        pushed = true;
      }
    }
    if (!pushed) break;
  }

  clampToRadius(shade.pos, islandRadius);
}

function sampleMotePosition(world: WorldState): Vec3Tuple {
  const maxSpawnR = Math.min(38, world.islandRadius - 6);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const angleRes = randomRange(world.rngState, 0, Math.PI * 2);
    world.rngState = angleRes.nextState;
    const radRes = randomRange(world.rngState, 5, maxSpawnR);
    world.rngState = radRes.nextState;

    const candidate: Vec3Tuple = [
      round3(Math.cos(angleRes.value) * radRes.value),
      0,
      round3(Math.sin(angleRes.value) * radRes.value),
    ];

    const tooCloseToLantern = world.lanterns.some((l) => distXZ(candidate, l.pos) < 3.5);
    const tooCloseToMote = world.motes.some((m) => distXZ(candidate, m.pos) < 3.0);
    if (!tooCloseToLantern && !tooCloseToMote) {
      return candidate;
    }
  }
  const angleRes = randomRange(world.rngState, 0, Math.PI * 2);
  world.rngState = angleRes.nextState;
  return [round3(Math.cos(angleRes.value) * 14), 0, round3(Math.sin(angleRes.value) * 14)];
}

function sampleShadePosition(world: WorldState, tuning: TuningConfig): Vec3Tuple {
  const maxSpawnR = Math.min(44, world.islandRadius - 4);
  for (let attempt = 0; attempt < 32; attempt += 1) {
    const angleRes = randomRange(world.rngState, 0, Math.PI * 2);
    world.rngState = angleRes.nextState;
    const radRes = randomRange(world.rngState, 18, maxSpawnR);
    world.rngState = radRes.nextState;

    const candidate: Vec3Tuple = [
      round3(Math.cos(angleRes.value) * radRes.value),
      1.0,
      round3(Math.sin(angleRes.value) * radRes.value),
    ];

    const tooCloseToPlayer = distXZ(candidate, world.player.pos) < SHADE_MIN_SPAWN_PLAYER_DIST;
    const inSafeZone = world.lanterns.some(
      (l) => l.lit && distXZ(candidate, l.pos) <= tuning.safe_radius + 2.0,
    );
    if (!tooCloseToPlayer && !inSafeZone) {
      return candidate;
    }
  }

  // Fallback away from player and lit lanterns
  const angleRes = randomRange(world.rngState, 0, Math.PI * 2);
  world.rngState = angleRes.nextState;
  const fallback: Vec3Tuple = [
    round3(Math.cos(angleRes.value) * 36),
    1.0,
    round3(Math.sin(angleRes.value) * 36),
  ];
  return fallback;
}

export function createDefaultInput(): EffectiveInput {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
  };
}

export function createWorld(
  seed: number,
  night: number = 1,
  scenario?: ScenarioConfig,
  tuning: TuningConfig = DEFAULT_TUNING,
): WorldState {
  const lanterns: LanternState[] = NIGHT1_LANTERNS.map((l) => ({
    id: l.id,
    pos: [l.pos[0], l.pos[1], l.pos[2]],
    lit: l.lit,
    deposited: l.deposited,
  }));

  if (scenario?.lanterns) {
    for (const patch of scenario.lanterns) {
      const target = lanterns.find((l) => l.id === patch.id);
      if (target) {
        if (patch.pos) {
          target.pos = [patch.pos[0], patch.pos[1], patch.pos[2]];
        }
        if (patch.deposited !== undefined) {
          target.deposited = patch.deposited;
        }
        if (patch.lit !== undefined) {
          target.lit = patch.lit;
          if (patch.lit && patch.deposited === undefined) {
            target.deposited = Math.max(target.deposited, tuning.lantern_cost);
          }
        } else if (target.deposited >= tuning.lantern_cost) {
          target.lit = true;
        }
      }
    }
  }

  const initialTimeLeftS = scenario?.time_left_s ?? tuning.night1_duration_s;
  const randomMotes = scenario?.random_motes ?? true;
  const randomShades = scenario?.random_shades ?? true;

  const playerPos: Vec3Tuple = scenario?.player?.pos
    ? [scenario.player.pos[0], scenario.player.pos[1], scenario.player.pos[2]]
    : [0, 0, 0];

  // Expand island radius automatically if a test scenario places entities beyond default island size
  let maxDist = Math.hypot(playerPos[0], playerPos[2]);
  for (const l of lanterns) {
    maxDist = Math.max(maxDist, Math.hypot(l.pos[0], l.pos[2]));
  }
  if (scenario?.motes) {
    for (const m of scenario.motes) {
      const p = Array.isArray(m) ? m : m.pos;
      maxDist = Math.max(maxDist, Math.hypot(p[0], p[2]));
    }
  }
  if (scenario?.shades) {
    for (const s of scenario.shades) {
      maxDist = Math.max(maxDist, Math.hypot(s.pos[0], s.pos[2]));
    }
  }
  const islandRadius = Math.max(DEFAULT_ISLAND_RADIUS, Math.ceil(maxDist + 25));

  const world: WorldState = {
    seed,
    night,
    tick: 0,
    simTick: 0,
    state: 'playing',
    gameOverReason: null,
    initialTimeLeftS,
    timeLeftS: initialTimeLeftS,
    score: 0,
    islandRadius,
    randomMotes,
    randomShades,
    moteSpawnCooldownTicks: MOTE_RESPAWN_TICKS,
    shadeSpawnCooldownTicks: SHADE_RESPAWN_TICKS,
    nextMoteId: 1,
    nextShadeId: 1,
    player: {
      pos: playerPos,
      vy: 0,
      yawRad: 0,
      flames: scenario?.player?.flames ?? tuning.flames,
      carried: scenario?.player?.carried ?? 0,
      invulnTicks: 0,
      pulseCooldownTicks: 0,
    },
    lanterns,
    shades: [],
    motes: [],
    prevInput: createDefaultInput(),
    rngState: initRngState(seed),
    lastPulseTick: -9999,
  };

  // Populate motes (pre-register explicit IDs to avoid collisions)
  if (scenario?.motes !== undefined) {
    const usedIds = new Set<string>();
    for (const item of scenario.motes) {
      if (!Array.isArray(item) && item.id) usedIds.add(item.id);
    }
    const counter = { value: world.nextMoteId };
    for (const item of scenario.motes) {
      const pos: Vec3Tuple = Array.isArray(item)
        ? [item[0], item[1], item[2]]
        : [item.pos[0], item.pos[1], item.pos[2]];
      const id =
        !Array.isArray(item) && item.id
          ? item.id
          : allocateUniqueId('M', counter, usedIds);
      world.motes.push({ id, pos });
    }
    world.nextMoteId = counter.value;
  } else if (randomMotes) {
    for (let i = 0; i < INITIAL_RANDOM_MOTES; i += 1) {
      const id = `M${world.nextMoteId}`;
      world.nextMoteId += 1;
      world.motes.push({ id, pos: sampleMotePosition(world) });
    }
  }

  // Populate shades (pre-register explicit IDs to avoid collisions)
  if (scenario?.shades !== undefined) {
    const usedIds = new Set<string>();
    for (const item of scenario.shades) {
      if (item.id) usedIds.add(item.id);
    }
    const counter = { value: world.nextShadeId };
    for (const item of scenario.shades) {
      const id = item.id ? item.id : allocateUniqueId('S', counter, usedIds);
      const shadeState = item.state ?? 'chase';
      const shade: ShadeEntity = {
        id,
        pos: [item.pos[0], item.pos[1], item.pos[2]],
        state: shadeState,
        stunTicks:
          shadeState === 'stunned' ? Math.round(tuning.pulse_stun_s * TICK_RATE) : 0,
      };
      world.shades.push(shade);
    }
    world.nextShadeId = counter.value;
  } else if (randomShades) {
    for (let i = 0; i < INITIAL_RANDOM_SHADES; i += 1) {
      const id = `S${world.nextShadeId}`;
      world.nextShadeId += 1;
      const shade: ShadeEntity = {
        id,
        pos: sampleShadePosition(world, tuning),
        state: 'chase',
        stunTicks: 0,
      };
      enforceShadeSafeZones(shade, world.lanterns, tuning.safe_radius, world.islandRadius);
      world.shades.push(shade);
    }
  }

  return world;
}

export function buildSnapshot(world: WorldState): SnapshotRecord {
  return {
    type: 'snapshot',
    tick: world.tick,
    sim_tick: world.simTick,
    state: world.state,
    time_left_s: round3(world.timeLeftS),
    score: world.score,
    player: {
      pos: roundVec3(world.player.pos),
      flames: world.player.flames,
      carried: world.player.carried,
    },
    lanterns: world.lanterns.map((l) => ({
      id: l.id,
      pos: roundVec3(l.pos),
      lit: l.lit,
      deposited: l.deposited,
    })),
    shades: world.shades.map((s) => ({
      id: s.id,
      pos: roundVec3(s.pos),
      state: s.state,
    })),
    motes_active: world.motes.length,
    motes: world.motes.map((m) => ({
      id: m.id,
      pos: roundVec3(m.pos),
    })),
  };
}

export function stepWorld(
  world: WorldState,
  input: EffectiveInput,
  tuning: TuningConfig = DEFAULT_TUNING,
): EventRecord[] {
  if (world.state !== 'playing') {
    return [];
  }

  const events: EventRecord[] = [];
  const nextTick = world.tick + 1;
  world.tick = nextTick;
  world.simTick = nextTick;
  world.timeLeftS = Math.max(0, world.initialTimeLeftS - nextTick / TICK_RATE);

  // Immediate loss guards if a scenario started with 0 flames or 0 time remaining
  if (world.player.flames <= 0) {
    world.state = 'lost';
    world.gameOverReason = 'no_flames';
    events.push({
      type: 'event',
      tick: nextTick,
      name: 'game_over',
      data: { result: 'lost', reason: 'no_flames' },
    });
    return events;
  }
  if (world.initialTimeLeftS <= 1e-9) {
    world.timeLeftS = 0;
    world.state = 'lost';
    world.gameOverReason = 'dawn';
    events.push({
      type: 'event',
      tick: nextTick,
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' },
    });
    return events;
  }

  const jumpTriggered = input.jump && !world.prevInput.jump;
  const interactTriggered = input.interact && !world.prevInput.interact;
  const pulseTriggered = input.pulse && !world.prevInput.pulse;

  // Store current input for rising-edge comparison on next step
  world.prevInput = {
    move: [input.move[0], input.move[1]],
    cam_yaw_deg: input.cam_yaw_deg,
    jump: input.jump,
    interact: input.interact,
    pulse: input.pulse,
  };

  // 1. Tick player and shade timers
  if (world.player.invulnTicks > 0) {
    world.player.invulnTicks -= 1;
  }
  if (world.player.pulseCooldownTicks > 0) {
    world.player.pulseCooldownTicks -= 1;
  }
  for (const shade of world.shades) {
    if (shade.stunTicks > 0) {
      shade.stunTicks -= 1;
      if (shade.stunTicks === 0) {
        shade.state = 'chase';
      }
    }
  }

  // 2. Player movement (exact Test Contract C rotation & normalization)
  let mx = input.move[0];
  let mz = input.move[1];
  const mLen = Math.hypot(mx, mz);
  if (mLen > 1) {
    mx /= mLen;
    mz /= mLen;
  }

  if (mLen > 1e-9) {
    const theta = (input.cam_yaw_deg * Math.PI) / 180;
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const wx = mx * cosT + mz * sinT;
    const wz = -mx * sinT + mz * cosT;

    world.player.pos[0] += wx * tuning.player_speed * FIXED_DT;
    world.player.pos[2] += wz * tuning.player_speed * FIXED_DT;
    world.player.yawRad = Math.atan2(wx, wz);

    if (!tuning.fall_enabled) {
      clampToRadius(world.player.pos, world.islandRadius);
    }
  }

  // Vertical jump physics (ground at y = 0)
  if (jumpTriggered && world.player.pos[1] <= 1e-6) {
    world.player.vy = JUMP_VELOCITY;
  }
  if (world.player.pos[1] > 0 || world.player.vy > 0) {
    world.player.pos[1] += world.player.vy * FIXED_DT;
    world.player.vy -= GRAVITY * FIXED_DT;
    if (world.player.pos[1] <= 0) {
      world.player.pos[1] = 0;
      world.player.vy = 0;
    }
  }

  // 3. Auto-pickup firefly motes within pickup_radius (XZ)
  if (world.player.carried < tuning.carry_capacity && world.motes.length > 0) {
    const candidates = world.motes
      .map((mote, index) => ({ mote, index, dist: distXZ(world.player.pos, mote.pos) }))
      .filter((c) => c.dist <= tuning.pickup_radius + 1e-9)
      .sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : compareId(a.mote.id, b.mote.id)));

    const pickedIds = new Set<string>();
    for (const c of candidates) {
      if (world.player.carried >= tuning.carry_capacity) break;
      pickedIds.add(c.mote.id);
      world.player.carried += 1;
      world.score += tuning.score.per_mote;
      events.push({
        type: 'event',
        tick: nextTick,
        name: 'mote_picked',
        data: { carried: world.player.carried },
      });
    }
    if (pickedIds.size > 0) {
      world.motes = world.motes.filter((m) => !pickedIds.has(m.id));
    }
  }

  // 4. Deposit light into nearest unlit lantern within interact_radius (XZ)
  if (interactTriggered && world.player.carried > 0) {
    let bestLantern: LanternState | null = null;
    let bestDist = Infinity;

    for (const lantern of world.lanterns) {
      if (lantern.lit) continue;
      const d = distXZ(world.player.pos, lantern.pos);
      if (d <= tuning.interact_radius + 1e-9) {
        if (
          bestLantern === null ||
          d < bestDist - 1e-9 ||
          (Math.abs(d - bestDist) <= 1e-9 && compareId(lantern.id, bestLantern.id) < 0)
        ) {
          bestLantern = lantern;
          bestDist = d;
        }
      }
    }

    if (bestLantern) {
      const needed = Math.max(0, tuning.lantern_cost - bestLantern.deposited);
      const amount = Math.min(world.player.carried, needed);
      if (amount > 0) {
        world.player.carried -= amount;
        bestLantern.deposited += amount;
        events.push({
          type: 'event',
          tick: nextTick,
          name: 'deposit',
          data: {
            lantern_id: bestLantern.id,
            amount,
            deposited: bestLantern.deposited,
          },
        });

        if (bestLantern.deposited >= tuning.lantern_cost) {
          bestLantern.lit = true;
          world.score += tuning.score.per_lantern;
          events.push({
            type: 'event',
            tick: nextTick,
            name: 'lantern_lit',
            data: { lantern_id: bestLantern.id },
          });

          // Immediately repel any shade inside newly activated safe_radius
          for (const shade of world.shades) {
            enforceShadeSafeZones(shade, world.lanterns, tuning.safe_radius, world.islandRadius);
          }
        }
      }
    }
  }

  // 5. Check WIN condition (all lanterns lit)
  if (world.lanterns.length > 0 && world.lanterns.every((l) => l.lit)) {
    world.state = 'won';
    world.gameOverReason = 'all_lit';
    const timeBonus = Math.floor(world.timeLeftS + 1e-9) * tuning.score.per_second_left;
    const flameBonus = world.player.flames * tuning.score.per_flame_left;
    world.score += timeBonus + flameBonus;
    events.push({
      type: 'event',
      tick: nextTick,
      name: 'game_over',
      data: { result: 'won', reason: 'all_lit' },
    });
    return events;
  }

  // 6. Light pulse (stun + push shades within pulse_radius)
  if (
    pulseTriggered &&
    world.player.carried >= tuning.pulse_cost &&
    world.player.pulseCooldownTicks <= 0
  ) {
    world.player.carried -= tuning.pulse_cost;
    world.player.pulseCooldownTicks = Math.round(tuning.pulse_cooldown_s * TICK_RATE);
    world.lastPulseTick = nextTick;

    const stunnedIds: string[] = [];
    for (const shade of world.shades) {
      const dx = shade.pos[0] - world.player.pos[0];
      const dz = shade.pos[2] - world.player.pos[2];
      const d = Math.hypot(dx, dz);
      if (d <= tuning.pulse_radius + 1e-9) {
        shade.state = 'stunned';
        shade.stunTicks = Math.round(tuning.pulse_stun_s * TICK_RATE);
        if (d < 1e-6) {
          shade.pos[0] += tuning.pulse_push_m;
        } else {
          shade.pos[0] += (dx / d) * tuning.pulse_push_m;
          shade.pos[2] += (dz / d) * tuning.pulse_push_m;
        }
        enforceShadeSafeZones(shade, world.lanterns, tuning.safe_radius, world.islandRadius);
        stunnedIds.push(shade.id);
      }
    }

    world.score += stunnedIds.length * tuning.score.per_stun;
    events.push({
      type: 'event',
      tick: nextTick,
      name: 'pulse',
      data: { stunned_ids: stunnedIds },
    });
  }

  // 7. Update Shades (chase player, respect lit lantern safe_radius)
  for (const shade of world.shades) {
    if (shade.state === 'stunned' || shade.stunTicks > 0) {
      continue;
    }

    shade.state = 'chase';
    const dx = world.player.pos[0] - shade.pos[0];
    const dz = world.player.pos[2] - shade.pos[2];
    const d = Math.hypot(dx, dz);
    if (d > 1e-6) {
      const stepDist = Math.min(d, tuning.shade_speed * FIXED_DT);
      shade.pos[0] += (dx / d) * stepDist;
      shade.pos[2] += (dz / d) * stepDist;
    }

    enforceShadeSafeZones(shade, world.lanterns, tuning.safe_radius, world.islandRadius);
  }

  // 8. Shade collision with player
  if (world.player.invulnTicks <= 0) {
    for (const shade of world.shades) {
      if (shade.state === 'stunned') continue;
      if (distXZ(world.player.pos, shade.pos) <= tuning.shade_hit_radius + 1e-9) {
        const dropped = Math.min(
          world.player.carried,
          Math.round(world.player.carried * tuning.hit_drop_ratio),
        );
        world.player.carried -= dropped;
        world.player.flames = Math.max(0, world.player.flames - 1);
        world.player.invulnTicks = Math.round(tuning.invuln_s * TICK_RATE);

        events.push({
          type: 'event',
          tick: nextTick,
          name: 'player_hit',
          data: {
            by: 'shade',
            flames: world.player.flames,
            dropped,
          },
        });

        if (world.player.flames <= 0) {
          world.state = 'lost';
          world.gameOverReason = 'no_flames';
          events.push({
            type: 'event',
            tick: nextTick,
            name: 'game_over',
            data: { result: 'lost', reason: 'no_flames' },
          });
          return events;
        }
        break;
      }
    }
  }

  // 9. Random spawning (only when enabled, avoiding collisions with scenario IDs)
  if (world.randomMotes && world.motes.length < MAX_RANDOM_MOTES) {
    world.moteSpawnCooldownTicks -= 1;
    if (world.moteSpawnCooldownTicks <= 0) {
      const existingMotes = new Set(world.motes.map((m) => m.id));
      const counter = { value: world.nextMoteId };
      const id = allocateUniqueId('M', counter, existingMotes);
      world.nextMoteId = counter.value;
      world.motes.push({ id, pos: sampleMotePosition(world) });
      world.moteSpawnCooldownTicks = MOTE_RESPAWN_TICKS;
    }
  }

  if (world.randomShades && world.shades.length < MAX_RANDOM_SHADES) {
    world.shadeSpawnCooldownTicks -= 1;
    if (world.shadeSpawnCooldownTicks <= 0) {
      const existingShades = new Set(world.shades.map((s) => s.id));
      const counter = { value: world.nextShadeId };
      const id = allocateUniqueId('S', counter, existingShades);
      world.nextShadeId = counter.value;
      const shade: ShadeEntity = {
        id,
        pos: sampleShadePosition(world, tuning),
        state: 'chase',
        stunTicks: 0,
      };
      enforceShadeSafeZones(shade, world.lanterns, tuning.safe_radius, world.islandRadius);
      world.shades.push(shade);
      world.shadeSpawnCooldownTicks = SHADE_RESPAWN_TICKS;
      events.push({
        type: 'event',
        tick: nextTick,
        name: 'shade_spawned',
        data: { id },
      });
    }
  }

  // 10. Check dawn timeout
  if (world.initialTimeLeftS - nextTick / TICK_RATE <= 1e-9) {
    world.timeLeftS = 0;
    world.state = 'lost';
    world.gameOverReason = 'dawn';
    events.push({
      type: 'event',
      tick: nextTick,
      name: 'game_over',
      data: { result: 'lost', reason: 'dawn' },
    });
  }

  return events;
}

export interface HeadlessRunOptions {
  seed: number;
  night: number;
  ticks: number;
  snapshotEvery: number;
  scenario?: ScenarioConfig;
  inputs?: InputsFile;
  tuning?: TuningConfig;
}

export function runHeadlessSimulation(options: HeadlessRunOptions): {
  world: WorldState;
  records: OutputRecord[];
} {
  const tuning = options.tuning ?? DEFAULT_TUNING;
  const world = createWorld(options.seed, options.night, options.scenario, tuning);
  const records: OutputRecord[] = [];

  // Snapshot tick 0: after scenario setup, before any input
  records.push(buildSnapshot(world));

  const frames = options.inputs?.frames ?? [];
  let frameIndex = 0;
  const activeInput: EffectiveInput = createDefaultInput();

  for (let k = 0; k < options.ticks; k += 1) {
    if (world.state !== 'playing') {
      break;
    }

    if (frameIndex < frames.length && frames[frameIndex]?.tick === k) {
      const frame = frames[frameIndex]!;
      if (frame.move !== undefined) {
        activeInput.move = [frame.move[0], frame.move[1]];
      }
      if (frame.cam_yaw_deg !== undefined) {
        activeInput.cam_yaw_deg = frame.cam_yaw_deg;
      }
      if (frame.jump !== undefined) {
        activeInput.jump = frame.jump;
      }
      if (frame.interact !== undefined) {
        activeInput.interact = frame.interact;
      }
      if (frame.pulse !== undefined) {
        activeInput.pulse = frame.pulse;
      }
      frameIndex += 1;
    }

    const stepEvents = stepWorld(world, activeInput, tuning);
    for (const ev of stepEvents) {
      records.push(ev);
    }

    if (world.tick % options.snapshotEvery === 0) {
      records.push(buildSnapshot(world));
    }

    if (world.state !== 'playing') {
      break;
    }
  }

  const endRecord: EndRecord = {
    type: 'end',
    ticks: world.tick,
    state: world.state,
    score: world.score,
  };
  records.push(endRecord);

  return { world, records };
}
