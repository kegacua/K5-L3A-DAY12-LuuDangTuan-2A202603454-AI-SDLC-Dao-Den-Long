import {
  CHARM_DURATION_TICKS,
  CHARM_PLAYER_SPEED,
  CHARM_RESPAWN_TICKS,
  DEFAULT_TUNING,
  DRIFTER_FLEE_TICKS,
  DRIFTER_IDLE_SPEED,
  DRIFTER_MAX_ACTIVE,
  DRIFTER_PULSE_DROP_FLEE_TICKS,
  DRIFTER_SPAWN_INTERVAL_TICKS,
  DRIFTER_SPEED,
  DRIFTER_STEAL_MAX,
  DRIFTER_STEAL_RADIUS,
  DRIFTER_TRIGGER_CARRIED,
  DRIFTER_TRIGGER_DIST,
  DROPPED_MOTE_RING_MAX,
  DROPPED_MOTE_RING_MIN,
  DROPPED_MOTE_TTL_TICKS,
  FALL_RESPAWN_TICKS,
  FALL_THRESHOLD_Y,
  FIXED_DT,
  FUEL_UNITS_PER_POINT,
  getNightDurationS,
  getPlayerCapacity,
  getShadeSpeed,
  GRAVITY,
  INITIAL_RANDOM_MOTES,
  JUMP_VELOCITY,
  MAX_RANDOM_MOTES,
  MOTE_SPAWN_INTERVAL_TICKS,
  PICKUP_MAX_DY,
  PULSE_CENTER_Y_OFFSET,
  PULSE_PUSH_TICKS,
  SAFE_PUSH_MAX_TICKS,
  SCORE_DAWN_LIT_LANTERN_BASE,
  SCORE_PULSE_DRAINING_SHADE,
  SCORE_RELIGHT,
  SHADE_DETECT_RADIUS,
  SHADE_DRAIN_ALERT_PLAYER_RADIUS,
  SHADE_DRAIN_EVENT_INTERVAL_TICKS,
  SHADE_DRAIN_RADIUS,
  SHADE_DROP_CHASE_RADIUS,
  SHADE_FIRST_SPAWN_COUNT,
  SHADE_FIRST_SPAWN_TICK,
  SHADE_HIT_MAX_DY,
  SHADE_MIN_SPAWN_PLAYER_DIST,
  SHADE_RECOIL_DIST,
  SHADE_RECOIL_TICKS,
  SHADE_SPAWN_DELAY_TICKS,
  SHADE_WANDER_SPEED,
  TICK_RATE,
  WIND_ACTIVE_TICKS,
  WIND_CYCLE_TICKS,
  WIND_PUSH_SPEED,
  WIND_WARN_TICKS,
} from './config.js';
import {
  getGroundHeight,
  isInsideBellTower,
  NIGHT3_BELL_TOWER_RADIUS,
  NIGHT_MAPS,
} from './maps.js';
import { initRngState, nextRandom, randomRange } from './rng.js';
import type {
  EffectiveInput,
  EndRecord,
  EventRecord,
  InputsFile,
  LanternState,
  NightId,
  OutputRecord,
  ScenarioConfig,
  ShadeEntity,
  SnapshotRecord,
  TuningConfig,
  Vec2Tuple,
  Vec3Tuple,
  WorldState,
} from './types.js';

export function round3(value: number): number {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundVec3(v: Vec3Tuple): Vec3Tuple {
  return [round3(v[0]), round3(v[1]), round3(v[2])];
}

export function distXZ(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[2] - b[2]);
}

function dist3D(a: Vec3Tuple, b: Vec3Tuple): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function compareId(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function allocateUniqueId(
  prefix: string,
  nextCounter: { value: number },
  existingIds: Set<string>,
): string {
  let id: string;
  do {
    id = `${prefix}${nextCounter.value}`;
    nextCounter.value += 1;
  } while (existingIds.has(id));
  existingIds.add(id);
  return id;
}

function horizUnit(dx: number, dz: number): Vec2Tuple {
  const d = Math.hypot(dx, dz);
  return d > 1e-6 ? [dx / d, dz / d] : [1, 0];
}

export function hasActiveSafeZone(
  lantern: LanternState,
  tuning: TuningConfig = DEFAULT_TUNING,
): boolean {
  return lantern.lit && lantern.fuelSixtieths >= tuning.low_fuel_threshold * FUEL_UNITS_PER_POINT;
}

function pushOutOfBellTower(night: NightId, pos: Vec3Tuple): boolean {
  if (!isInsideBellTower(night, pos[0], pos[2])) return false;
  const [ux, uz] = horizUnit(pos[0], pos[2]);
  pos[0] = ux * (NIGHT3_BELL_TOWER_RADIUS + 0.05);
  pos[2] = uz * (NIGHT3_BELL_TOWER_RADIUS + 0.05);
  return true;
}

function tryMoveShadeHorizontal(
  night: NightId,
  shade: ShadeEntity,
  dx: number,
  dz: number,
  lanterns: LanternState[],
  tuning: TuningConfig,
  respectSafeZone: boolean,
): boolean {
  const safeRadius = tuning.safe_radius;
  const nextX = shade.pos[0] + dx;
  const nextZ = shade.pos[2] + dz;

  if (isInsideBellTower(night, nextX, nextZ)) return false;
  const curGround = getGroundHeight(night, shade.pos[0], shade.pos[2]);
  const nextGround = getGroundHeight(night, nextX, nextZ);
  if (nextGround === null) return false;
  if (curGround !== null && nextGround > curGround + 0.8) return false;

  const cand: Vec3Tuple = [nextX, nextGround + 1.0, nextZ];

  if (respectSafeZone && safeRadius > 0) {
    for (const l of lanterns) {
      if (!hasActiveSafeZone(l, tuning)) continue;
      const d = distXZ(cand, l.pos);
      if (d <= safeRadius + 0.005) {
        const [ux, uz] = horizUnit(cand[0] - l.pos[0], cand[2] - l.pos[2]);
        cand[0] = l.pos[0] + ux * (safeRadius + 0.02);
        cand[2] = l.pos[2] + uz * (safeRadius + 0.02);
        const rimG = getGroundHeight(night, cand[0], cand[2]);
        if (rimG === null || isInsideBellTower(night, cand[0], cand[2])) {
          return false;
        }
        cand[1] = rimG + 1.0;
      }
    }
  }

  shade.pos[0] = cand[0];
  shade.pos[1] = cand[1];
  shade.pos[2] = cand[2];
  return true;
}

function spawnDroppedMotesAround(
  world: WorldState,
  center: Vec3Tuple,
  count: number,
  ringMin: number,
  ringMax: number,
): void {
  if (count <= 0) return;
  const existingIds = new Set(world.motes.map((m) => m.id));
  const counter = { value: world.nextMoteId };

  for (let i = 0; i < count; i += 1) {
    const id = allocateUniqueId('M', counter, existingIds);
    let pos: Vec3Tuple = [round3(center[0]), round3(center[1]), round3(center[2])];

    if (ringMax > 0) {
      for (let attempt = 0; attempt < 10; attempt += 1) {
        const angRes = randomRange(world.rngState, 0, Math.PI * 2);
        world.rngState = angRes.nextState;
        const radRes = randomRange(world.rngState, ringMin, ringMax);
        world.rngState = radRes.nextState;

        const cx = center[0] + Math.cos(angRes.value) * radRes.value;
        const cz = center[2] + Math.sin(angRes.value) * radRes.value;
        const g = getGroundHeight(world.night, cx, cz);
        if (g !== null && !isInsideBellTower(world.night, cx, cz)) {
          pos = [round3(cx), round3(g), round3(cz)];
          break;
        }
      }
    } else {
      const g = getGroundHeight(world.night, center[0], center[2]);
      pos = [round3(center[0]), round3(g ?? 0), round3(center[2])];
    }

    world.motes.push({
      id,
      pos,
      kind: 'dropped',
      ttlTicks: DROPPED_MOTE_TTL_TICKS,
      readySimTick: world.simTick + 1,
    });
  }

  world.nextMoteId = counter.value;
}

function pickRandomIndex(world: WorldState, len: number): number {
  const { value, nextState } = nextRandom(world.rngState);
  world.rngState = nextState;
  return Math.min(len - 1, Math.floor(value * len));
}

function findNearestLantern(
  pos: Vec3Tuple,
  lanterns: LanternState[],
  predicate: (l: LanternState) => boolean,
): LanternState | null {
  let best: LanternState | null = null;
  let bestDist = Infinity;
  for (const l of lanterns) {
    if (!predicate(l)) continue;
    const d = distXZ(pos, l.pos);
    if (
      best === null ||
      d < bestDist - 1e-9 ||
      (Math.abs(d - bestDist) <= 1e-9 && compareId(l.id, best.id) < 0)
    ) {
      best = l;
      bestDist = d;
    }
  }
  return best;
}

export function createDefaultInput(): EffectiveInput {
  return {
    move: [0, 0],
    cam_yaw_deg: 0,
    jump: false,
    interact: false,
    pulse: false,
    dash: false,
    pause: false,
  };
}

export function createWorld(
  seed: number,
  night: NightId = 1,
  scenario?: ScenarioConfig,
  tuning: TuningConfig = DEFAULT_TUNING,
): WorldState {
  const map = NIGHT_MAPS[night];
  const fuelMaxUnits = Math.round(tuning.fuel_max * FUEL_UNITS_PER_POINT);

  const lanterns: LanternState[] = map.lanterns.map((l) => ({
    id: l.id,
    pos: [l.pos[0], l.pos[1], l.pos[2]],
    lit: l.lit,
    deposited: l.deposited,
    fuelSixtieths: l.lit ? fuelMaxUnits : 0,
    everLit: l.everLit,
    relitCount: l.relitCount,
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
        if (patch.ever_lit !== undefined) {
          target.everLit = patch.ever_lit;
        }
        if (patch.lit !== undefined) {
          target.lit = patch.lit;
          if (patch.lit) {
            target.everLit = true;
            if (patch.deposited === undefined) {
              target.deposited = Math.max(target.deposited, tuning.lantern_cost);
            }
            target.fuelSixtieths =
              patch.fuel !== undefined
                ? Math.round(patch.fuel * FUEL_UNITS_PER_POINT)
                : fuelMaxUnits;
          } else {
            target.fuelSixtieths = 0;
          }
        } else if (patch.fuel !== undefined) {
          if (patch.fuel > 0) {
            target.lit = true;
            target.everLit = true;
            target.fuelSixtieths = Math.round(patch.fuel * FUEL_UNITS_PER_POINT);
          } else {
            target.lit = false;
            target.fuelSixtieths = 0;
          }
        } else {
          const needed = target.everLit ? tuning.relight_cost : tuning.lantern_cost;
          if (target.deposited >= needed) {
            target.lit = true;
            target.everLit = true;
            target.fuelSixtieths = fuelMaxUnits;
          }
        }
      }
    }
  }

  const initialTimeLeftS = scenario?.time_left_s ?? getNightDurationS(night, tuning);
  const randomMotes = scenario?.random_motes ?? true;
  const randomShades = scenario?.random_shades ?? true;
  const randomDrifters = scenario?.random_drifters ?? map.hasDrifters;
  const windEnabled = scenario?.wind_enabled ?? map.hasWind;

  const playerPos: Vec3Tuple = scenario?.player?.pos
    ? [scenario.player.pos[0], scenario.player.pos[1], scenario.player.pos[2]]
    : [map.spawnPos[0], map.spawnPos[1], map.spawnPos[2]];

  const startGround = getGroundHeight(night, playerPos[0], playerPos[2]);
  const grounded = startGround !== null && Math.abs(playerPos[1] - startGround) <= 0.1;

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
    randomMotes,
    randomShades,
    randomDrifters,
    wind: {
      enabled: windEnabled,
      active: false,
      warning: false,
      dirDeg: 0,
      cycleTick: 0,
    },
    nightStartEmitted: false,
    nextMoteId: 1,
    nextShadeId: 1,
    nextDrifterId: 1,
    player: {
      pos: playerPos,
      vel: [0, 0, 0],
      grounded,
      yawRad: 0,
      flames: scenario?.player?.flames ?? tuning.flames,
      carried: scenario?.player?.carried ?? 0,
      successfulLights: scenario?.player?.successful_lights ?? 0,
      invulnTicks: scenario?.player?.invuln_ticks ?? 0,
      dashTicks: 0,
      dashCdTicks: scenario?.player?.dash_cd_ticks ?? 0,
      dashDir: [0, 1],
      pulseCdTicks: scenario?.player?.pulse_cd_ticks ?? 0,
      charmTicks: scenario?.player?.charm_ticks ?? 0,
      launched: false,
      fallPending: false,
      respawnTicks: 0,
    },
    lanterns,
    shades: [],
    motes: [],
    drifters: [],
    charms: [],
    prevInput: createDefaultInput(),
    rngState: initRngState(seed),
    lastPulseTick: -9999,
  };

  // Populate motes
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
        !Array.isArray(item) && item.id ? item.id : allocateUniqueId('M', counter, usedIds);
      const kind = !Array.isArray(item) && item.kind ? item.kind : 'random';
      const ttlTicks =
        !Array.isArray(item) && item.ttl_s !== undefined
          ? item.ttl_s === null
            ? null
            : Math.round(item.ttl_s * TICK_RATE)
          : kind === 'dropped'
            ? DROPPED_MOTE_TTL_TICKS
            : null;
      world.motes.push({ id, pos, kind, ttlTicks, readySimTick: 0 });
    }
    world.nextMoteId = counter.value;
  } else if (randomMotes) {
    const pool = map.moteSpawnPoints.map((p) => [p[0], p[1], p[2]] as Vec3Tuple);
    for (let i = pool.length - 1; i > 0; i -= 1) {
      const j = pickRandomIndex(world, i + 1);
      const tmp = pool[i]!;
      pool[i] = pool[j]!;
      pool[j] = tmp;
    }
    const initialCount = Math.min(INITIAL_RANDOM_MOTES, pool.length);
    for (let i = 0; i < initialCount; i += 1) {
      const id = `M${world.nextMoteId}`;
      world.nextMoteId += 1;
      world.motes.push({
        id,
        pos: pool[i]!,
        kind: 'random',
        ttlTicks: null,
        readySimTick: 0,
      });
    }
  }

  // Populate shades
  if (scenario?.shades !== undefined) {
    const usedIds = new Set<string>();
    for (const item of scenario.shades) {
      if (item.id) usedIds.add(item.id);
    }
    const counter = { value: world.nextShadeId };
    for (const item of scenario.shades) {
      const id = item.id ? item.id : allocateUniqueId('S', counter, usedIds);
      const pos: Vec3Tuple = [item.pos[0], item.pos[1], item.pos[2]];
      const defaultState =
        distXZ(pos, world.player.pos) <= SHADE_DETECT_RADIUS ? 'chase' : 'wander';
      const state = item.state ?? defaultState;
      const defaultTicks =
        state === 'stunned'
          ? Math.round(tuning.pulse_stun_s * TICK_RATE)
          : state === 'recoil'
            ? SHADE_RECOIL_TICKS
            : state === 'spawning'
              ? SHADE_SPAWN_DELAY_TICKS
              : 0;
      const stateTicksLeft = item.state_ticks_left ?? defaultTicks;
      const angRes = randomRange(world.rngState, 0, Math.PI * 2);
      world.rngState = angRes.nextState;

      let targetLanternId: string | null = item.target_lantern_id ?? null;
      if (state === 'drain' && !targetLanternId) {
        const nearestLit = findNearestLantern(pos, world.lanterns, (l) => l.lit);
        targetLanternId = nearestLit ? nearestLit.id : null;
      }

      world.shades.push({
        id,
        pos,
        state,
        stateTicksLeft,
        pushTicksLeft: 0,
        pushDir: [1, 0],
        recoilDir: horizUnit(pos[0] - world.player.pos[0], pos[2] - world.player.pos[2]),
        safePushTicks: 0,
        wanderAngle: angRes.value,
        targetLanternId,
        drainTicks: 0,
        readySimTick: 0,
      });
    }
    world.nextShadeId = counter.value;
  }

  // Populate drifters
  if (scenario?.drifters !== undefined) {
    const usedIds = new Set<string>();
    for (const item of scenario.drifters) {
      if (item.id) usedIds.add(item.id);
    }
    const counter = { value: world.nextDrifterId };
    for (const item of scenario.drifters) {
      const id = item.id ? item.id : allocateUniqueId('D', counter, usedIds);
      const state = item.state ?? 'idle';
      const angRes = randomRange(world.rngState, 0, Math.PI * 2);
      world.rngState = angRes.nextState;
      world.drifters.push({
        id,
        pos: [item.pos[0], item.pos[1], item.pos[2]],
        state,
        stolen: item.stolen ?? 0,
        fleeTicks: state === 'flee' ? DRIFTER_FLEE_TICKS : 0,
        orbitAngle: angRes.value,
        readySimTick: 0,
      });
    }
    world.nextDrifterId = counter.value;
  }

  // Populate charms
  if (scenario?.charms !== undefined) {
    const usedIds = new Set<string>();
    for (const item of scenario.charms) {
      if (item.id) usedIds.add(item.id);
    }
    const counter = { value: 1 };
    for (const item of scenario.charms) {
      const id = item.id ? item.id : allocateUniqueId('C', counter, usedIds);
      const available = item.available ?? true;
      const respawnTicks =
        item.respawn_s !== undefined
          ? Math.round(item.respawn_s * TICK_RATE)
          : available
            ? 0
            : CHARM_RESPAWN_TICKS;
      world.charms.push({
        id,
        pos: [item.pos[0], item.pos[1], item.pos[2]],
        available,
        respawnTicks,
      });
    }
  } else {
    world.charms = map.charms.map((c) => ({
      id: c.id,
      pos: [c.pos[0], c.pos[1], c.pos[2]],
      available: c.available,
      respawnTicks: c.respawnTicks,
    }));
  }

  return world;
}

export function buildSnapshot(
  world: WorldState,
  tuning: TuningConfig = DEFAULT_TUNING,
): SnapshotRecord {
  return {
    type: 'snapshot',
    tick: world.tick,
    sim_tick: world.simTick,
    night: world.night,
    state: world.state,
    time_left_s: round3(world.timeLeftS),
    score: world.score,
    wind: {
      active: world.wind.active,
      dir_deg: round3(world.wind.dirDeg),
    },
    player: {
      pos: roundVec3(world.player.pos),
      vel: roundVec3(world.player.vel),
      grounded: world.player.grounded,
      flames: world.player.flames,
      carried: world.player.carried,
      capacity: getPlayerCapacity(world.player.successfulLights, tuning),
      invuln: world.player.invulnTicks > 0,
      dash_cd_s: round3(world.player.dashCdTicks / TICK_RATE),
      pulse_cd_s: round3(world.player.pulseCdTicks / TICK_RATE),
      charm_s: round3(world.player.charmTicks / TICK_RATE),
    },
    lanterns: world.lanterns.map((l) => ({
      id: l.id,
      pos: roundVec3(l.pos),
      lit: l.lit,
      deposited: l.deposited,
      fuel: l.lit ? round1(l.fuelSixtieths / FUEL_UNITS_PER_POINT) : 0,
      ever_lit: l.everLit,
      relit_count: l.relitCount,
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
      kind: m.kind,
      ttl_s: m.ttlTicks === null ? null : round3(m.ttlTicks / TICK_RATE),
    })),
    drifters: world.drifters
      .filter((d) => d.state !== 'removed')
      .map((d) => ({
        id: d.id,
        pos: roundVec3(d.pos),
        state: d.state,
        stolen: d.stolen,
      })),
    charms: world.charms.map((c) => ({
      id: c.id,
      available: c.available,
      respawn_s: round3(c.respawnTicks / TICK_RATE),
    })),
  };
}

export function stepWorld(
  world: WorldState,
  input: EffectiveInput,
  tuning: TuningConfig = DEFAULT_TUNING,
): EventRecord[] {
  if (world.state === 'won' || world.state === 'lost') {
    return [];
  }

  const events: EventRecord[] = [];
  const nextTick = world.tick + 1;
  world.tick = nextTick;

  const fuelMaxUnits = Math.round(tuning.fuel_max * FUEL_UNITS_PER_POINT);
  const lowFuelUnits = Math.round(tuning.low_fuel_threshold * FUEL_UNITS_PER_POINT);
  const decayUnitsPerTick = Math.round(tuning.fuel_decay_per_s);
  const drainUnitsPerTick = Math.round(tuning.drain_per_s);
  const fuelUnitsPerMote = Math.round(tuning.fuel_per_mote * FUEL_UNITS_PER_POINT);

  // --- STEP 1: Read input (handle pause FIRST) ---
  const pauseTriggered = input.pause && !world.prevInput.pause;
  const jumpTriggered = input.jump && !world.prevInput.jump;
  const interactTriggered = input.interact && !world.prevInput.interact;
  const pulseTriggered = input.pulse && !world.prevInput.pulse;
  const dashTriggered = input.dash && !world.prevInput.dash;

  world.prevInput = {
    move: [input.move[0], input.move[1]],
    cam_yaw_deg: input.cam_yaw_deg,
    jump: input.jump,
    interact: input.interact,
    pulse: input.pulse,
    dash: input.dash,
    pause: input.pause,
  };

  if (pauseTriggered) {
    if (world.state === 'playing') {
      world.state = 'paused';
      events.push({ type: 'event', tick: nextTick, name: 'paused', data: {} });
      return events;
    }
    if (world.state === 'paused') {
      world.state = 'playing';
      events.push({ type: 'event', tick: nextTick, name: 'resumed', data: {} });
    }
  } else if (world.state === 'paused') {
    return events;
  }

  // --- STEP 2: Advance sim_tick, decrement timers, subtract lantern fuel & extinguish <= 0 ---
  world.simTick += 1;
  const simTick = world.simTick;
  world.timeLeftS = Math.max(0, world.initialTimeLeftS - simTick / TICK_RATE);

  if (!world.nightStartEmitted) {
    world.nightStartEmitted = true;
    events.push({
      type: 'event',
      tick: nextTick,
      name: 'night_start',
      data: { night: world.night },
    });
  }

  const map = NIGHT_MAPS[world.night];

  if (world.player.dashTicks > 0) world.player.dashTicks -= 1;
  if (world.player.dashCdTicks > 0) world.player.dashCdTicks -= 1;
  if (world.player.pulseCdTicks > 0) world.player.pulseCdTicks -= 1;
  if (world.player.invulnTicks > 0) world.player.invulnTicks -= 1;
  if (world.player.charmTicks > 0) {
    world.player.charmTicks -= 1;
    world.player.dashCdTicks = 0;
  }

  if (world.player.respawnTicks > 0) {
    world.player.respawnTicks -= 1;
    if (world.player.respawnTicks === 0 && world.player.fallPending) {
      world.player.pos = [map.spawnPos[0], map.spawnPos[1], map.spawnPos[2]];
      world.player.vel = [0, 0, 0];
      world.player.grounded = true;
      world.player.launched = false;
      world.player.dashTicks = 0;
      world.player.fallPending = false;
      world.player.invulnTicks = Math.round(tuning.invuln_s * TICK_RATE);
    }
  }

  const justUnstunnedIds = new Set<string>();
  for (const shade of world.shades) {
    if (shade.stateTicksLeft > 0) {
      shade.stateTicksLeft -= 1;
      if (shade.stateTicksLeft === 0) {
        if (shade.state === 'stunned') {
          // Ticket-03 Section 2: Hết choáng thì về wander (observable on unstun tick)
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
          justUnstunnedIds.add(shade.id);
        } else if (shade.state === 'spawning' || shade.state === 'recoil') {
          shade.state =
            !world.player.fallPending && distXZ(shade.pos, world.player.pos) <= SHADE_DETECT_RADIUS
              ? 'chase'
              : 'wander';
        }
      }
    }
    if (shade.safePushTicks > 0) {
      shade.safePushTicks -= 1;
    }
  }

  for (const drifter of world.drifters) {
    if (drifter.state === 'flee' && drifter.fleeTicks > 0) {
      drifter.fleeTicks -= 1;
      if (drifter.fleeTicks === 0) {
        drifter.state = 'removed';
      }
    }
  }
  world.drifters = world.drifters.filter((d) => d.state !== 'removed');

  for (const mote of world.motes) {
    if (mote.kind === 'dropped' && mote.ttlTicks !== null) {
      mote.ttlTicks -= 1;
    }
  }
  world.motes = world.motes.filter((m) => m.ttlTicks === null || m.ttlTicks > 0);

  for (const charm of world.charms) {
    if (!charm.available && charm.respawnTicks > 0) {
      charm.respawnTicks -= 1;
      if (charm.respawnTicks === 0) {
        charm.available = true;
      }
    }
  }

  // Ticket-03 Step 2: Subtract lantern fuel (natural decay 1/60 + 5/60 per draining shade)
  const drainingShades = [...world.shades]
    .filter((s) => s.state === 'drain' && s.readySimTick <= simTick && s.targetLanternId !== null)
    .sort((a, b) => compareId(a.id, b.id));

  for (const lantern of world.lanterns) {
    if (!lantern.lit) continue;
    lantern.fuelSixtieths -= decayUnitsPerTick;
  }

  for (const shade of drainingShades) {
    const target = world.lanterns.find((l) => l.id === shade.targetLanternId);
    if (
      target &&
      target.lit &&
      target.fuelSixtieths < lowFuelUnits &&
      distXZ(shade.pos, target.pos) <= SHADE_DRAIN_RADIUS + 1e-9
    ) {
      target.fuelSixtieths -= drainUnitsPerTick;
      shade.drainTicks += 1;
      if (shade.drainTicks % SHADE_DRAIN_EVENT_INTERVAL_TICKS === 0) {
        events.push({
          type: 'event',
          tick: nextTick,
          name: 'fuel_drain',
          data: {
            lantern_id: target.id,
            shade_id: shade.id,
            fuel: round1(Math.max(0, target.fuelSixtieths) / FUEL_UNITS_PER_POINT),
          },
        });
      }
    }
  }

  // Immediately after Step 2: extinguish any lantern with fuel <= 0
  const sortedLanternsById = [...world.lanterns].sort((a, b) => compareId(a.id, b.id));
  for (const lantern of sortedLanternsById) {
    if (lantern.lit && lantern.fuelSixtieths <= 0) {
      lantern.lit = false;
      lantern.fuelSixtieths = 0;
      lantern.deposited = 0;
      lantern.everLit = true;
      events.push({
        type: 'event',
        tick: nextTick,
        name: 'lantern_out',
        data: { lantern_id: lantern.id },
      });

      for (const shade of world.shades) {
        if (shade.state === 'drain' && shade.targetLanternId === lantern.id) {
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        }
      }
    }
  }

  // Night 3 Wind cycle
  if (world.wind.enabled) {
    const phase = simTick % WIND_CYCLE_TICKS;
    if (phase === WIND_CYCLE_TICKS - WIND_WARN_TICKS) {
      const degRes = randomRange(world.rngState, 0, 360);
      world.rngState = degRes.nextState;
      world.wind.dirDeg = round3(degRes.value);
      world.wind.warning = true;
      world.wind.active = false;
    } else if (simTick >= WIND_CYCLE_TICKS && phase < WIND_ACTIVE_TICKS) {
      world.wind.warning = false;
      world.wind.active = true;
    } else {
      world.wind.active = false;
      world.wind.warning = phase >= WIND_CYCLE_TICKS - WIND_WARN_TICKS;
    }
  } else {
    world.wind.active = false;
    world.wind.warning = false;
  }

  // --- STEP 3: Move Mây (jump, dash, jump pads, wind) + check fall ---
  const playerActive = !world.player.fallPending && world.player.flames > 0;
  if (playerActive) {
    let mx = input.move[0];
    let mz = input.move[1];
    const mLen = Math.hypot(mx, mz);
    if (mLen > 1) {
      mx /= mLen;
      mz /= mLen;
    }

    let wx = 0;
    let wz = 0;
    if (mLen > 1e-9) {
      const theta = (input.cam_yaw_deg * Math.PI) / 180;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      wx = mx * cosT + mz * sinT;
      wz = -mx * sinT + mz * cosT;
      world.player.yawRad = Math.atan2(wx, wz);
    }

    if (
      dashTriggered &&
      world.player.dashTicks === 0 &&
      (world.player.dashCdTicks === 0 || world.player.charmTicks > 0)
    ) {
      const dashDir: Vec2Tuple =
        mLen > 1e-9
          ? horizUnit(wx, wz)
          : [Math.sin(world.player.yawRad), Math.cos(world.player.yawRad)];
      world.player.dashDir = dashDir;
      world.player.dashTicks = Math.round(tuning.dash_duration_s * TICK_RATE);
      world.player.dashCdTicks =
        world.player.charmTicks > 0 ? 0 : Math.round(tuning.dash_cooldown_s * TICK_RATE);
      world.player.launched = false;
      world.player.vel[1] = 0;
      events.push({ type: 'event', tick: nextTick, name: 'dash', data: {} });
    }

    if (world.player.dashTicks > 0) {
      world.player.vel[0] = world.player.dashDir[0] * tuning.dash_speed;
      world.player.vel[2] = world.player.dashDir[1] * tuning.dash_speed;
      world.player.vel[1] = 0;
    } else if (!world.player.launched) {
      const runSpeed = world.player.charmTicks > 0 ? CHARM_PLAYER_SPEED : tuning.player_speed;
      world.player.vel[0] = wx * runSpeed;
      world.player.vel[2] = wz * runSpeed;
    }

    let windVx = 0;
    let windVz = 0;
    if (world.wind.active) {
      const wRad = (world.wind.dirDeg * Math.PI) / 180;
      windVx = Math.cos(wRad) * WIND_PUSH_SPEED;
      windVz = Math.sin(wRad) * WIND_PUSH_SPEED;
    }

    if (jumpTriggered && world.player.grounded && world.player.dashTicks === 0) {
      world.player.vel[1] = JUMP_VELOCITY;
      world.player.grounded = false;
    }

    const stepX = (world.player.vel[0] + windVx) * FIXED_DT;
    const stepZ = (world.player.vel[2] + windVz) * FIXED_DT;
    const oldX = world.player.pos[0];
    const oldY = world.player.pos[1];
    const oldZ = world.player.pos[2];

    const canStandAt = (cx: number, cz: number): boolean => {
      if (isInsideBellTower(world.night, cx, cz)) return false;
      const g = getGroundHeight(world.night, cx, cz);
      if (g !== null && g > oldY + 0.55) return false;
      return true;
    };

    const candX = oldX + stepX;
    const candZ = oldZ + stepZ;
    if (canStandAt(candX, candZ)) {
      world.player.pos[0] = candX;
      world.player.pos[2] = candZ;
    } else if (canStandAt(candX, oldZ)) {
      world.player.pos[0] = candX;
    } else if (canStandAt(oldX, candZ)) {
      world.player.pos[2] = candZ;
    }

    pushOutOfBellTower(world.night, world.player.pos);

    if (world.player.dashTicks === 0) {
      const groundY = getGroundHeight(world.night, world.player.pos[0], world.player.pos[2]);

      if (world.player.grounded) {
        if (groundY === null || groundY < world.player.pos[1] - 0.55) {
          world.player.grounded = false;
          world.player.pos[1] += world.player.vel[1] * FIXED_DT - 0.5 * GRAVITY * FIXED_DT * FIXED_DT;
          world.player.vel[1] -= GRAVITY * FIXED_DT;
        } else {
          world.player.pos[1] = groundY;
          world.player.vel[1] = 0;
        }
      } else {
        world.player.pos[1] += world.player.vel[1] * FIXED_DT - 0.5 * GRAVITY * FIXED_DT * FIXED_DT;
        world.player.vel[1] -= GRAVITY * FIXED_DT;
        if (groundY !== null && world.player.pos[1] <= groundY && world.player.vel[1] <= 0) {
          world.player.pos[1] = groundY;
          world.player.vel[1] = 0;
          world.player.grounded = true;
          world.player.launched = false;
        }
      }
    }

    if (!world.player.launched) {
      for (const pad of map.jumpPads) {
        if (
          distXZ(world.player.pos, pad.pos) <= pad.radius + 1e-9 &&
          Math.abs(world.player.pos[1] - pad.pos[1]) <= 0.6
        ) {
          world.player.vel[0] = pad.dirXZ[0] * pad.velHoriz;
          world.player.vel[1] = pad.velY;
          world.player.vel[2] = pad.dirXZ[1] * pad.velHoriz;
          world.player.grounded = false;
          world.player.launched = true;
          world.player.dashTicks = 0;
          break;
        }
      }
    }

    if (tuning.fall_enabled && world.player.pos[1] < FALL_THRESHOLD_Y) {
      const lost = world.player.carried;
      world.player.carried = 0;
      world.player.flames = Math.max(0, world.player.flames - 1);
      world.player.fallPending = true;
      world.player.launched = false;
      world.player.dashTicks = 0;
      world.player.vel = [0, 0, 0];
      world.player.respawnTicks = world.player.flames > 0 ? FALL_RESPAWN_TICKS : 0;

      events.push({
        type: 'event',
        tick: nextTick,
        name: 'player_hit',
        data: {
          by: 'fall',
          flames: world.player.flames,
          dropped: 0,
          lost,
        },
      });
    }
  }

  const canAct = !world.player.fallPending && world.player.flames > 0;
  const playerCapacity = getPlayerCapacity(world.player.successfulLights, tuning);

  // --- STEP 4: Pick up motes & charms ---
  if (canAct) {
    if (world.player.carried < playerCapacity && world.motes.length > 0) {
      const candidates = world.motes
        .filter((m) => m.readySimTick <= simTick)
        .map((mote) => ({
          mote,
          dist: distXZ(world.player.pos, mote.pos),
          dy: Math.abs(world.player.pos[1] - mote.pos[1]),
        }))
        .filter((c) => c.dist <= tuning.pickup_radius + 1e-9 && c.dy <= PICKUP_MAX_DY + 1e-9)
        .sort((a, b) => (a.dist !== b.dist ? a.dist - b.dist : compareId(a.mote.id, b.mote.id)));

      const pickedIds = new Set<string>();
      for (const c of candidates) {
        if (world.player.carried >= playerCapacity) break;
        pickedIds.add(c.mote.id);
        world.player.carried += 1;
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

    for (const charm of world.charms) {
      if (!charm.available) continue;
      const d = distXZ(world.player.pos, charm.pos);
      const dy = Math.abs(world.player.pos[1] - charm.pos[1]);
      if (d <= tuning.pickup_radius + 1e-9 && dy <= PICKUP_MAX_DY + 1e-9) {
        charm.available = false;
        charm.respawnTicks = CHARM_RESPAWN_TICKS;
        world.player.charmTicks = CHARM_DURATION_TICKS;
        world.player.dashCdTicks = 0;
        events.push({
          type: 'event',
          tick: nextTick,
          name: 'charm_picked',
          data: { charm_id: charm.id, charm_ticks: CHARM_DURATION_TICKS },
        });
      }
    }
  }

  // --- STEP 5: Interact with lanterns (unlit OR lit needing fuel; nearest, smallest id tie-break) ---
  if (canAct && interactTriggered && world.player.carried > 0) {
    const bestLantern = findNearestLantern(
      world.player.pos,
      world.lanterns,
      (l) =>
        distXZ(world.player.pos, l.pos) <= tuning.interact_radius + 1e-9 &&
        (!l.lit || l.fuelSixtieths < fuelMaxUnits),
    );

    if (bestLantern) {
      if (!bestLantern.lit) {
        const requiredCost = bestLantern.everLit ? tuning.relight_cost : tuning.lantern_cost;
        const needed = Math.max(0, requiredCost - bestLantern.deposited);
        const amount = Math.min(world.player.carried, needed);
        if (amount > 0) {
          world.player.carried -= amount;
          bestLantern.deposited += amount;
          world.score += amount * tuning.score.per_mote;
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

          if (bestLantern.deposited >= requiredCost) {
            const isRelight = bestLantern.everLit;
            bestLantern.lit = true;
            bestLantern.fuelSixtieths = fuelMaxUnits;
            bestLantern.everLit = true;
            if (isRelight) {
              bestLantern.relitCount += 1;
            }
            world.player.successfulLights += 1;
            world.score += isRelight ? SCORE_RELIGHT : tuning.score.per_lantern;
            events.push({
              type: 'event',
              tick: nextTick,
              name: 'lantern_lit',
              data: { lantern_id: bestLantern.id, relight: isRelight },
            });

            for (const shade of world.shades) {
              if (distXZ(shade.pos, bestLantern.pos) <= tuning.safe_radius + 1e-9) {
                shade.safePushTicks = SAFE_PUSH_MAX_TICKS;
              }
              if (shade.state === 'drain' && shade.targetLanternId === bestLantern.id) {
                shade.state = 'wander';
                shade.targetLanternId = null;
                shade.drainTicks = 0;
              }
            }
          }
        }
      } else {
        // Refuel lit lantern: used = min(carried, ceil((100 - fuel) / 10))
        const missingUnits = fuelMaxUnits - bestLantern.fuelSixtieths;
        const maxMotes = Math.ceil(missingUnits / fuelUnitsPerMote);
        const used = Math.min(world.player.carried, maxMotes);
        if (used > 0) {
          const wasBelowSafe = bestLantern.fuelSixtieths < lowFuelUnits;
          world.player.carried -= used;
          bestLantern.fuelSixtieths = Math.min(
            fuelMaxUnits,
            bestLantern.fuelSixtieths + used * fuelUnitsPerMote,
          );
          world.score += used * tuning.score.per_mote;
          events.push({
            type: 'event',
            tick: nextTick,
            name: 'refuel',
            data: {
              lantern_id: bestLantern.id,
              amount: used,
              fuel: round1(bestLantern.fuelSixtieths / FUEL_UNITS_PER_POINT),
            },
          });

          // If refueled from < 30 back to >= 30, reactivate safe zone push-out & interrupt draining shades
          if (wasBelowSafe && bestLantern.fuelSixtieths >= lowFuelUnits) {
            for (const shade of world.shades) {
              if (distXZ(shade.pos, bestLantern.pos) <= tuning.safe_radius + 1e-9) {
                shade.safePushTicks = SAFE_PUSH_MAX_TICKS;
              }
              if (shade.state === 'drain' && shade.targetLanternId === bestLantern.id) {
                shade.state = 'wander';
                shade.targetLanternId = null;
                shade.drainTicks = 0;
              }
            }
          }
        }
      }
    }
  }

  // --- STEP 6: Update safe zones (gradual push-out for active safe zones fuel >= 30) ---
  for (const shade of world.shades) {
    if (shade.safePushTicks <= 0) continue;
    let stillInside = false;
    for (const lantern of world.lanterns) {
      if (!hasActiveSafeZone(lantern, tuning)) continue;
      const d = distXZ(shade.pos, lantern.pos);
      if (d <= tuning.safe_radius + 0.01) {
        stillInside = true;
        const remaining = tuning.safe_radius + 0.05 - d;
        const step = Math.max(0.25, remaining / Math.max(1, shade.safePushTicks));
        const [ux, uz] = horizUnit(shade.pos[0] - lantern.pos[0], shade.pos[2] - lantern.pos[2]);
        const moved = tryMoveShadeHorizontal(
          world.night,
          shade,
          ux * step,
          uz * step,
          world.lanterns,
          tuning,
          false,
        );
        if (!moved) {
          const baseAngle = Math.atan2(uz, ux);
          const rimR = tuning.safe_radius + 0.05;
          for (let degOff = 0; degOff <= 180; degOff += 20) {
            let placed = false;
            for (const sign of degOff === 0 ? [1] : [1, -1]) {
              const a = baseAngle + ((sign * degOff) * Math.PI) / 180;
              const cx = lantern.pos[0] + Math.cos(a) * rimR;
              const cz = lantern.pos[2] + Math.sin(a) * rimR;
              const g = getGroundHeight(world.night, cx, cz);
              if (g !== null && !isInsideBellTower(world.night, cx, cz)) {
                shade.pos[0] = cx;
                shade.pos[1] = g + 1.0;
                shade.pos[2] = cz;
                placed = true;
                break;
              }
            }
            if (placed) break;
          }
        }
      }
    }
    if (!stillInside) {
      shade.safePushTicks = 0;
    }
  }

  // --- STEP 7: Light Pulse ---
  if (
    canAct &&
    pulseTriggered &&
    world.player.carried >= tuning.pulse_cost &&
    world.player.pulseCdTicks === 0
  ) {
    world.player.carried -= tuning.pulse_cost;
    world.player.pulseCdTicks = Math.round(tuning.pulse_cooldown_s * TICK_RATE);
    world.lastPulseTick = simTick;

    const pulseCenter: Vec3Tuple = [
      world.player.pos[0],
      world.player.pos[1] + PULSE_CENTER_Y_OFFSET,
      world.player.pos[2],
    ];

    const stunnedIds: string[] = [];
    const sortedShades = [...world.shades].sort((a, b) => compareId(a.id, b.id));
    for (const shade of sortedShades) {
      if (shade.readySimTick > simTick) continue;
      if (dist3D(pulseCenter, shade.pos) <= tuning.pulse_radius + 1e-9) {
        const wasDraining = shade.state === 'drain';
        shade.state = 'stunned';
        shade.stateTicksLeft = Math.round(tuning.pulse_stun_s * TICK_RATE);
        shade.pushTicksLeft = PULSE_PUSH_TICKS;
        shade.pushDir = horizUnit(
          shade.pos[0] - world.player.pos[0],
          shade.pos[2] - world.player.pos[2],
        );
        shade.targetLanternId = null;
        shade.drainTicks = 0;
        stunnedIds.push(shade.id);
        world.score += wasDraining ? SCORE_PULSE_DRAINING_SHADE : tuning.score.per_stun;
      }
    }

    events.push({
      type: 'event',
      tick: nextTick,
      name: 'pulse',
      data: { stunned_ids: stunnedIds },
    });

    const sortedDrifters = [...world.drifters].sort((a, b) => compareId(a.id, b.id));
    for (const drifter of sortedDrifters) {
      if (drifter.readySimTick > simTick || drifter.state === 'removed') continue;
      if (dist3D(pulseCenter, drifter.pos) <= tuning.pulse_radius + 1e-9) {
        if (drifter.state === 'chase') {
          drifter.state = 'flee';
          drifter.fleeTicks = DRIFTER_FLEE_TICKS;
        } else if (drifter.state === 'flee' && drifter.stolen > 0) {
          const amount = drifter.stolen;
          drifter.stolen = 0;
          drifter.fleeTicks = DRIFTER_PULSE_DROP_FLEE_TICKS;
          spawnDroppedMotesAround(world, drifter.pos, amount, 0, 0);
          events.push({
            type: 'event',
            tick: nextTick,
            name: 'drifter_drop',
            data: { drifter_id: drifter.id, amount },
          });
        }
      }
    }
  }

  // --- STEP 8: Move Shades & Drifters ---
  const shadeSpeed = getShadeSpeed(world.night, tuning);

  for (const shade of world.shades) {
    if (shade.readySimTick > simTick || shade.safePushTicks > 0 || justUnstunnedIds.has(shade.id)) {
      continue;
    }

    if (shade.state === 'spawning') {
      continue;
    }

    if (shade.state === 'stunned') {
      if (shade.pushTicksLeft > 0) {
        const pushStep = tuning.pulse_push_m / PULSE_PUSH_TICKS;
        const moved = tryMoveShadeHorizontal(
          world.night,
          shade,
          shade.pushDir[0] * pushStep,
          shade.pushDir[1] * pushStep,
          world.lanterns,
          tuning,
          true,
        );
        shade.pushTicksLeft -= 1;
        if (!moved) {
          shade.pushTicksLeft = 0;
        }
      }
      continue;
    }

    if (shade.state === 'recoil') {
      const recoilStep = SHADE_RECOIL_DIST / Math.max(1, SHADE_RECOIL_TICKS - 1);
      tryMoveShadeHorizontal(
        world.night,
        shade,
        shade.recoilDir[0] * recoilStep,
        shade.recoilDir[1] * recoilStep,
        world.lanterns,
        tuning,
        true,
      );
      continue;
    }

    const dPlayer = distXZ(shade.pos, world.player.pos);

    if (shade.state === 'drain') {
      // From drain: chase if player within 6m; wander if lantern out, refueled >= 30, or dist > 2m
      if (canAct && dPlayer <= SHADE_DRAIN_ALERT_PLAYER_RADIUS + 1e-9) {
        shade.state = 'chase';
        shade.targetLanternId = null;
        shade.drainTicks = 0;
      } else {
        const target = world.lanterns.find((l) => l.id === shade.targetLanternId);
        if (
          !target ||
          !target.lit ||
          target.fuelSixtieths >= lowFuelUnits ||
          distXZ(shade.pos, target.pos) > SHADE_DRAIN_RADIUS + 1e-9
        ) {
          shade.state = 'wander';
          shade.targetLanternId = null;
          shade.drainTicks = 0;
        } else {
          continue; // stand still while draining
        }
      }
    }

    if (shade.state === 'wander') {
      if (canAct && dPlayer <= SHADE_DETECT_RADIUS + 1e-9) {
        shade.state = 'chase';
        shade.targetLanternId = null;
      }
    } else if (shade.state === 'chase') {
      if (!canAct || dPlayer > SHADE_DROP_CHASE_RADIUS + 1e-9) {
        shade.state = 'wander';
      }
    }

    if (shade.state === 'chase') {
      const dx = world.player.pos[0] - shade.pos[0];
      const dz = world.player.pos[2] - shade.pos[2];
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) {
        const step = Math.min(d, shadeSpeed * FIXED_DT);
        tryMoveShadeHorizontal(
          world.night,
          shade,
          (dx / d) * step,
          (dz / d) * step,
          world.lanterns,
          tuning,
          true,
        );
      }
    } else if (shade.state === 'wander') {
      // Ticket-03 Section 2: Only wander shades pick nearest weak lit lantern (fuel < 30), else nearest unlit lantern
      const weakLantern = findNearestLantern(
        shade.pos,
        world.lanterns,
        (l) => l.lit && l.fuelSixtieths < lowFuelUnits,
      );

      if (weakLantern) {
        shade.targetLanternId = weakLantern.id;
        const dLantern = distXZ(shade.pos, weakLantern.pos);
        if (dLantern <= SHADE_DRAIN_RADIUS + 1e-9) {
          shade.state = 'drain';
          shade.drainTicks = 0;
        } else {
          const dx = weakLantern.pos[0] - shade.pos[0];
          const dz = weakLantern.pos[2] - shade.pos[2];
          const step = Math.min(dLantern, shadeSpeed * FIXED_DT);
          tryMoveShadeHorizontal(
            world.night,
            shade,
            (dx / dLantern) * step,
            (dz / dLantern) * step,
            world.lanterns,
            tuning,
            true,
          );
          if (distXZ(shade.pos, weakLantern.pos) <= SHADE_DRAIN_RADIUS + 1e-9) {
            shade.state = 'drain';
            shade.drainTicks = 0;
          }
        }
      } else {
        shade.targetLanternId = null;
        const unlitLantern = findNearestLantern(shade.pos, world.lanterns, (l) => !l.lit);
        if (unlitLantern && distXZ(shade.pos, unlitLantern.pos) > 2.0) {
          const dx = unlitLantern.pos[0] - shade.pos[0];
          const dz = unlitLantern.pos[2] - shade.pos[2];
          const d = Math.hypot(dx, dz);
          const step = Math.min(d, SHADE_WANDER_SPEED * FIXED_DT);
          const moved = tryMoveShadeHorizontal(
            world.night,
            shade,
            (dx / d) * step,
            (dz / d) * step,
            world.lanterns,
            tuning,
            true,
          );
          if (!moved) {
            shade.wanderAngle += Math.PI * 0.5;
          }
        } else {
          const step = SHADE_WANDER_SPEED * FIXED_DT;
          const moved = tryMoveShadeHorizontal(
            world.night,
            shade,
            Math.cos(shade.wanderAngle) * step,
            Math.sin(shade.wanderAngle) * step,
            world.lanterns,
            tuning,
            true,
          );
          if (!moved) {
            shade.wanderAngle += Math.PI * 0.75;
          } else {
            shade.wanderAngle += 0.015;
          }
        }
      }
    }
  }

  // Move Drifters
  for (const drifter of world.drifters) {
    if (drifter.readySimTick > simTick || drifter.state === 'removed') continue;

    if (drifter.state === 'idle') {
      const dPlayer = distXZ(drifter.pos, world.player.pos);
      if (
        canAct &&
        world.player.carried >= DRIFTER_TRIGGER_CARRIED &&
        dPlayer <= DRIFTER_TRIGGER_DIST + 1e-9
      ) {
        drifter.state = 'chase';
      } else {
        drifter.orbitAngle += 0.02;
        drifter.pos[0] += Math.cos(drifter.orbitAngle) * DRIFTER_IDLE_SPEED * FIXED_DT;
        drifter.pos[2] += Math.sin(drifter.orbitAngle) * DRIFTER_IDLE_SPEED * FIXED_DT;
      }
    }

    if (drifter.state === 'chase') {
      const dPlayer = distXZ(drifter.pos, world.player.pos);
      if (
        !canAct ||
        world.player.carried < DRIFTER_TRIGGER_CARRIED ||
        dPlayer > DRIFTER_TRIGGER_DIST + 1e-9
      ) {
        drifter.state = 'idle';
      } else if (dPlayer > 1e-6) {
        const step = Math.min(dPlayer, DRIFTER_SPEED * FIXED_DT);
        const dx = world.player.pos[0] - drifter.pos[0];
        const dz = world.player.pos[2] - drifter.pos[2];
        drifter.pos[0] += (dx / dPlayer) * step;
        drifter.pos[2] += (dz / dPlayer) * step;
        drifter.pos[1] = world.player.pos[1] + 1.2;
      }
    } else if (drifter.state === 'flee') {
      const [ux, uz] = horizUnit(
        drifter.pos[0] - world.player.pos[0],
        drifter.pos[2] - world.player.pos[2],
      );
      drifter.pos[0] += ux * DRIFTER_SPEED * FIXED_DT;
      drifter.pos[2] += uz * DRIFTER_SPEED * FIXED_DT;
    }
  }

  // --- STEP 9: Collisions — Drifters steal FIRST, then Shades hit (ascending id) ---
  if (canAct) {
    const sortedDrifters = [...world.drifters].sort((a, b) => compareId(a.id, b.id));
    for (const drifter of sortedDrifters) {
      if (drifter.readySimTick > simTick || drifter.state !== 'chase') continue;
      if (distXZ(world.player.pos, drifter.pos) <= DRIFTER_STEAL_RADIUS + 1e-9) {
        const amount = Math.min(DRIFTER_STEAL_MAX, world.player.carried);
        if (amount <= 0) continue;
        world.player.carried -= amount;
        drifter.stolen = amount;
        drifter.state = 'flee';
        drifter.fleeTicks = DRIFTER_FLEE_TICKS;
        events.push({
          type: 'event',
          tick: nextTick,
          name: 'drifter_steal',
          data: {
            drifter_id: drifter.id,
            amount,
            carried: world.player.carried,
          },
        });
      }
    }

    if (world.player.invulnTicks === 0) {
      const sortedShades = [...world.shades].sort((a, b) => compareId(a.id, b.id));
      for (const shade of sortedShades) {
        if (
          shade.readySimTick > simTick ||
          shade.state === 'stunned' ||
          shade.state === 'spawning' ||
          shade.state === 'recoil' ||
          shade.safePushTicks > 0
        ) {
          continue;
        }
        const dXZ = distXZ(world.player.pos, shade.pos);
        const dY = Math.abs(world.player.pos[1] - shade.pos[1]);
        if (dXZ <= tuning.shade_hit_radius + 1e-9 && dY <= SHADE_HIT_MAX_DY + 1e-9) {
          const dropped = Math.floor(world.player.carried * tuning.hit_drop_ratio);
          world.player.carried -= dropped;
          world.player.flames = Math.max(0, world.player.flames - 1);
          world.player.invulnTicks = Math.round(tuning.invuln_s * TICK_RATE);

          if (dropped > 0) {
            spawnDroppedMotesAround(
              world,
              world.player.pos,
              dropped,
              DROPPED_MOTE_RING_MIN,
              DROPPED_MOTE_RING_MAX,
            );
          }

          shade.state = 'recoil';
          shade.stateTicksLeft = SHADE_RECOIL_TICKS;
          shade.targetLanternId = null;
          shade.drainTicks = 0;
          shade.recoilDir = horizUnit(
            shade.pos[0] - world.player.pos[0],
            shade.pos[2] - world.player.pos[2],
          );

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
          break;
        }
      }
    }
  }

  // --- STEP 10: Scheduled spawns (active from simTick + 1) ---
  if (
    world.randomMotes &&
    simTick % MOTE_SPAWN_INTERVAL_TICKS === 0 &&
    world.motes.length < MAX_RANDOM_MOTES
  ) {
    const freePoints = map.moteSpawnPoints.filter(
      (pt) => !world.motes.some((m) => distXZ(m.pos, pt) < 0.5 && Math.abs(m.pos[1] - pt[1]) < 0.5),
    );
    if (freePoints.length > 0) {
      const pt = freePoints[pickRandomIndex(world, freePoints.length)]!;
      const existingMotes = new Set(world.motes.map((m) => m.id));
      const counter = { value: world.nextMoteId };
      const id = allocateUniqueId('M', counter, existingMotes);
      world.nextMoteId = counter.value;
      world.motes.push({
        id,
        pos: [pt[0], pt[1], pt[2]],
        kind: 'random',
        ttlTicks: null,
        readySimTick: simTick + 1,
      });
    }
  }

  if (world.randomShades && simTick >= SHADE_FIRST_SPAWN_TICK) {
    let toSpawn = 0;
    if (simTick === SHADE_FIRST_SPAWN_TICK) {
      toSpawn = SHADE_FIRST_SPAWN_COUNT;
    } else if ((simTick - SHADE_FIRST_SPAWN_TICK) % map.shadeSpawnIntervalTicks === 0) {
      toSpawn = 1;
    }

    for (let s = 0; s < toSpawn; s += 1) {
      if (world.shades.length >= map.shadeMaxActive) break;
      const validPoints = map.shadeSpawnPoints.filter(
        (pt) =>
          distXZ(pt, world.player.pos) >= SHADE_MIN_SPAWN_PLAYER_DIST &&
          !world.lanterns.some(
            (l) => hasActiveSafeZone(l, tuning) && distXZ(pt, l.pos) <= tuning.safe_radius + 0.5,
          ) &&
          !world.shades.some((sh) => distXZ(pt, sh.pos) < 1.5),
      );
      if (validPoints.length === 0) break;

      const pt = validPoints[pickRandomIndex(world, validPoints.length)]!;
      const existingShades = new Set(world.shades.map((sh) => sh.id));
      const counter = { value: world.nextShadeId };
      const id = allocateUniqueId('S', counter, existingShades);
      world.nextShadeId = counter.value;
      const angRes = randomRange(world.rngState, 0, Math.PI * 2);
      world.rngState = angRes.nextState;

      world.shades.push({
        id,
        pos: [pt[0], pt[1], pt[2]],
        state: 'spawning',
        stateTicksLeft: SHADE_SPAWN_DELAY_TICKS,
        pushTicksLeft: 0,
        pushDir: [1, 0],
        recoilDir: [1, 0],
        safePushTicks: 0,
        wanderAngle: angRes.value,
        targetLanternId: null,
        drainTicks: 0,
        readySimTick: simTick + 1,
      });
      events.push({
        type: 'event',
        tick: nextTick,
        name: 'shade_spawned',
        data: { id },
      });
    }
  }

  if (
    world.randomDrifters &&
    map.hasDrifters &&
    simTick % DRIFTER_SPAWN_INTERVAL_TICKS === 0 &&
    world.drifters.length < DRIFTER_MAX_ACTIVE
  ) {
    const pt = map.shadeSpawnPoints[pickRandomIndex(world, map.shadeSpawnPoints.length)]!;
    const existingDrifters = new Set(world.drifters.map((d) => d.id));
    const counter = { value: world.nextDrifterId };
    const id = allocateUniqueId('D', counter, existingDrifters);
    world.nextDrifterId = counter.value;
    const angRes = randomRange(world.rngState, 0, Math.PI * 2);
    world.rngState = angRes.nextState;

    world.drifters.push({
      id,
      pos: [pt[0], pt[1] + 0.5, pt[2]],
      state: 'idle',
      stolen: 0,
      fleeTicks: 0,
      orbitAngle: angRes.value,
      readySimTick: simTick + 1,
    });
  }

  // --- STEP 11: Win / Loss check (Ticket-03: no early win; flames <= 0 ALWAYS no_flames first) ---
  if (world.player.flames <= 0) {
    world.state = 'lost';
    world.gameOverReason = 'no_flames';
    events.push({
      type: 'event',
      tick: nextTick,
      name: 'game_over',
      data: { result: 'lost', reason: 'no_flames' },
    });
  } else if (world.initialTimeLeftS - simTick / TICK_RATE <= 1e-9) {
    world.timeLeftS = 0;
    const litLanterns = world.lanterns.filter((l) => l.lit);
    const requiredLit = Math.ceil(tuning.win_ratio * world.lanterns.length);
    if (litLanterns.length >= requiredLit) {
      world.state = 'won';
      world.gameOverReason = 'dawn_survived';
      let dawnBonus = world.player.flames * tuning.score.per_flame_left;
      for (const l of litLanterns) {
        dawnBonus += SCORE_DAWN_LIT_LANTERN_BASE + Math.floor(l.fuelSixtieths / FUEL_UNITS_PER_POINT);
      }
      world.score += dawnBonus;
      events.push({
        type: 'event',
        tick: nextTick,
        name: 'game_over',
        data: { result: 'won', reason: 'dawn_survived' },
      });
    } else {
      world.state = 'lost';
      world.gameOverReason = 'dawn';
      events.push({
        type: 'event',
        tick: nextTick,
        name: 'game_over',
        data: { result: 'lost', reason: 'dawn' },
      });
    }
  }

  return events;
}

export interface HeadlessRunOptions {
  seed: number;
  night: NightId;
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

  records.push(buildSnapshot(world, tuning));

  const frames = options.inputs?.frames ?? [];
  let frameIndex = 0;
  const activeInput: EffectiveInput = createDefaultInput();

  for (let k = 0; k < options.ticks; k += 1) {
    if (world.state === 'won' || world.state === 'lost') {
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
      if (frame.dash !== undefined) {
        activeInput.dash = frame.dash;
      }
      if (frame.pause !== undefined) {
        activeInput.pause = frame.pause;
      }
      frameIndex += 1;
    }

    const stepEvents = stepWorld(world, activeInput, tuning);
    for (const ev of stepEvents) {
      records.push(ev);
    }

    if (world.tick % options.snapshotEvery === 0) {
      records.push(buildSnapshot(world, tuning));
    }

    const stateAfter: string = world.state;
    if (stateAfter === 'won' || stateAfter === 'lost') {
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
