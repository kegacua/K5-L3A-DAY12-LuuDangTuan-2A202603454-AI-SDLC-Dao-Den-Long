import { describe, expect, it } from 'vitest';
import {
  CHARM_DURATION_TICKS,
  CHARM_PLAYER_SPEED,
  DEFAULT_TUNING,
  DROPPED_MOTE_TTL_TICKS,
  FALL_RESPAWN_TICKS,
  FUEL_UNITS_PER_POINT,
  getPlayerCapacity,
  TICK_RATE,
} from '../src/core/config.js';
import { getGroundHeight } from '../src/core/maps.js';
import {
  buildSnapshot,
  createDefaultInput,
  createWorld,
  distXZ,
  hasActiveSafeZone,
  runHeadlessSimulation,
  stepWorld,
} from '../src/core/simulation.js';
import {
  ContractInputError,
  validateInputsFile,
  validateScenarioConfig,
} from '../src/core/validation.js';

describe('Phase 1-2 Regression + Phase 3 (Ticket-03 / Contract v1.2) Unit Tests', () => {
  it('moves accurately according to player_speed (6.0), cam_yaw_deg, and diagonal normalization', () => {
    const w1 = createWorld(1, 1, { random_motes: false, random_shades: false });
    const inp1 = { ...createDefaultInput(), move: [0, 1] as [number, number], cam_yaw_deg: 0 };
    for (let i = 0; i < 60; i += 1) stepWorld(w1, inp1);
    expect(w1.player.pos[0]).toBeCloseTo(0, 5);
    expect(w1.player.pos[2]).toBeCloseTo(6.0, 4);

    const w2 = createWorld(1, 1, { random_motes: false, random_shades: false });
    const inp2 = { ...createDefaultInput(), move: [0, 1] as [number, number], cam_yaw_deg: 90 };
    for (let i = 0; i < 60; i += 1) stepWorld(w2, inp2);
    expect(w2.player.pos[0]).toBeCloseTo(6.0, 4);
    expect(w2.player.pos[2]).toBeCloseTo(0, 4);

    const w3 = createWorld(1, 1, { random_motes: false, random_shades: false });
    const inp3 = { ...createDefaultInput(), move: [1, 1] as [number, number], cam_yaw_deg: 0 };
    for (let i = 0; i < 60; i += 1) stepWorld(w3, inp3);
    expect(Math.hypot(w3.player.pos[0], w3.player.pos[2])).toBeCloseTo(6.0, 4);
  });

  it('jumps with velocity-Verlet (7.0 m/s, -20 m/s^2) reaching exact 1.225m apex and landing at y=0', () => {
    const world = createWorld(1, 1, { random_motes: false, random_shades: false });
    stepWorld(world, { ...createDefaultInput(), jump: true });
    expect(world.player.grounded).toBe(false);

    let peakY = world.player.pos[1];
    for (let i = 0; i < 60; i += 1) {
      stepWorld(world, { ...createDefaultInput(), jump: true });
      peakY = Math.max(peakY, world.player.pos[1]);
    }
    expect(peakY).toBeCloseTo(1.225, 2);
    expect(world.player.pos[1]).toBe(0);
    expect(world.player.grounded).toBe(true);
  });

  it('dashes at 14 m/s for 12 ticks (0.2s), holds altitude in air, and enforces 90-tick cooldown', () => {
    const world = createWorld(1, 1, { random_motes: false, random_shades: false });
    stepWorld(world, { ...createDefaultInput(), jump: true });
    for (let i = 0; i < 6; i += 1) stepWorld(world, createDefaultInput());
    const airY = world.player.pos[1];

    const ev = stepWorld(world, { ...createDefaultInput(), dash: true });
    expect(ev.some((e) => e.name === 'dash')).toBe(true);
    for (let i = 0; i < 11; i += 1) {
      stepWorld(world, createDefaultInput());
      expect(world.player.pos[1]).toBeCloseTo(airY, 4);
    }
    expect(world.player.pos[2]).toBeCloseTo(2.8, 2);
  });

  it('Phase 3 [REPLACED WIN RULE]: lighting all 5 lanterns does NOT end early; wins at dawn with >= 60% lit (dawn_survived) + exact new score', () => {
    const { world, records } = runHeadlessSimulation({
      seed: 7,
      night: 1,
      ticks: 180,
      snapshotEvery: 60,
      scenario: {
        player: { pos: [0, 0, 23.5], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
          { id: 'L2', lit: true, fuel: 80 },
          { id: 'L3', lit: true, fuel: 80 },
          { id: 'L4', lit: true, fuel: 80 },
          { id: 'L5', lit: true, fuel: 80 },
        ],
        time_left_s: 2.0,
      },
      inputs: { frames: [{ tick: 0, interact: true }, { tick: 1, interact: false }] },
    });

    // Must NOT end at tick 1 when all 5 lanterns become lit — runs until dawn tick 120!
    expect(world.tick).toBe(120);
    expect(world.state).toBe('won');
    expect(world.gameOverReason).toBe('dawn_survived');

    const litEv = records.find((r) => r.type === 'event' && r.name === 'lantern_lit');
    expect(litEv?.type === 'event' ? litEv.data : null).toEqual({ lantern_id: 'L1', relight: false });

    // Score breakdown:
    // +50 (10 motes * 5) + 100 (first light L1)
    // At tick 120 (2s elapsed):
    //   L1 lit at tick 1 -> decayed 119 ticks -> fuel = 100 - 119/60 = 98.016 -> floor = 98
    //   L2..L5 started at 80 -> decayed 120 ticks -> fuel = 78.0 -> floor = 78 (x4)
    // Dawn bonus = (50+98) + 4*(50+78) + 3*50 (flames) = 148 + 512 + 150 = 810
    // Total = 150 + 810 = 960 (NO time bonus!)
    expect(world.score).toBe(960);
  });

  it('Phase 3: exact fuel decay (1/60 per tick), lantern_out, relight cost 5 (+40), refuel ceil((100-fuel)/10), and dynamic capacity', () => {
    const world = createWorld(11, 1, {
      player: { pos: [0, 0, 24], carried: 10, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 1.0, ever_lit: true }],
      time_left_s: 120,
    });

    expect(getPlayerCapacity(world.player.successfulLights)).toBe(10);

    // 59 ticks: still lit (fuel = 1/60)
    for (let i = 0; i < 59; i += 1) {
      const evs = stepWorld(world, createDefaultInput());
      expect(evs.some((e) => e.name === 'lantern_out')).toBe(false);
    }
    expect(world.lanterns[0]?.lit).toBe(true);

    // Tick 60: fuel hits 0 -> lantern_out, deposited = 0, ever_lit = true
    const outEvs = stepWorld(world, createDefaultInput());
    expect(outEvs.find((e) => e.name === 'lantern_out')?.data).toEqual({ lantern_id: 'L1' });
    expect(world.lanterns[0]?.lit).toBe(false);
    expect(world.lanterns[0]?.fuelSixtieths).toBe(0);
    expect(world.lanterns[0]?.everLit).toBe(true);

    // Relight costs only 5 motes -> +5*5 + 40 = +65 score, relight: true, relit_count = 1, capacity = 12
    const relightEvs = stepWorld(world, { ...createDefaultInput(), interact: true });
    expect(relightEvs.find((e) => e.name === 'deposit')?.data).toEqual({
      lantern_id: 'L1',
      amount: 5,
      deposited: 5,
    });
    expect(relightEvs.find((e) => e.name === 'lantern_lit')?.data).toEqual({
      lantern_id: 'L1',
      relight: true,
    });
    expect(world.lanterns[0]?.relitCount).toBe(1);
    expect(world.lanterns[0]?.fuelSixtieths).toBe(100 * FUEL_UNITS_PER_POINT);
    expect(world.score).toBe(65);
    expect(buildSnapshot(world).player.capacity).toBe(12);

    // Release interact; try interacting when fuel is 100 (or wait 15s -> fuel 85 -> needs ceil(15/10)=2 motes)
    stepWorld(world, { ...createDefaultInput(), interact: false });
    for (let i = 0; i < 900; i += 1) stepWorld(world, createDefaultInput()); // 15s elapsed -> fuel ~85.0
    const refuelEvs = stepWorld(world, { ...createDefaultInput(), interact: true });
    const rf = refuelEvs.find((e) => e.name === 'refuel');
    expect(rf?.data).toEqual({ lantern_id: 'L1', amount: 2, fuel: 100 });
    expect(world.score).toBe(65 + 10); // +5 per mote refueled
  });

  it('Phase 3: weak lantern (fuel < 30) loses safe zone, wander shade enters drain (5/s + fuel_drain @60t), pulse awards +15 & returns to wander', () => {
    const world = createWorld(15, 1, {
      player: { pos: [0, 0, 0], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 30.0 }],
      shades: [{ id: 'S1', pos: [0, 1, 27], state: 'wander' }],
      time_left_s: 120,
    });

    // At fuel === 30.0: safe zone IS still active!
    expect(hasActiveSafeZone(world.lanterns[0]!)).toBe(true);

    // After 1 tick, fuel = 29.983 < 30 -> loses safe zone, S1 enters drain!
    stepWorld(world, createDefaultInput());
    expect(hasActiveSafeZone(world.lanterns[0]!)).toBe(false);
    expect(world.shades[0]?.state).toBe('drain');

    // Run 60 more ticks while draining -> emits fuel_drain and drains 5/s + 1/s decay = 6/s
    let sawDrainEvent = false;
    for (let i = 0; i < 60; i += 1) {
      const evs = stepWorld(world, createDefaultInput());
      if (evs.some((e) => e.name === 'fuel_drain')) sawDrainEvent = true;
    }
    expect(sawDrainEvent).toBe(true);
    expect(world.lanterns[0]!.fuelSixtieths / FUEL_UNITS_PER_POINT).toBeLessThan(24.5);

    // Now test pulsing a draining shade awards total +15 and after stun returns to wander
    const w2 = createWorld(16, 1, {
      player: { pos: [0, 0, 22], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25.0 }],
      shades: [{ id: 'S1', pos: [0, 1, 25.5], state: 'drain', target_lantern_id: 'L1' }],
    });
    const pulseEv = stepWorld(w2, { ...createDefaultInput(), pulse: true });
    expect(pulseEv.find((e) => e.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1'] });
    expect(w2.score).toBe(15); // +15 total for pulsing a draining shade!
    expect(w2.shades[0]?.state).toBe('stunned');

    // After 120 stun ticks -> returns to wander (Ticket-03 Section 2)
    for (let i = 0; i < 120; i += 1) stepWorld(w2, createDefaultInput());
    expect(w2.shades[0]?.state).toBe('wander');
  });

  it('Phase 2 Regression: drops floor(carried/2) motes into 1.5-2.5m ring with 480-tick TTL, recoil 60t, invuln 90t', () => {
    const world = createWorld(4, 1, {
      player: { pos: [0, 0, 0], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      shades: [{ id: 'S1', pos: [0.8, 1, 0], state: 'chase' }],
    });

    const ev1 = stepWorld(world, createDefaultInput());
    expect(ev1.find((e) => e.name === 'player_hit')?.data).toEqual({ by: 'shade', flames: 2, dropped: 2 });
    expect(world.player.carried).toBe(3);
    expect(world.player.invulnTicks).toBe(90);
    expect(world.shades[0]?.state).toBe('recoil');
    expect(world.motes).toHaveLength(2);

    world.shades = [];
    for (let i = 0; i < DROPPED_MOTE_TTL_TICKS; i += 1) stepWorld(world, createDefaultInput());
    expect(world.motes).toHaveLength(0);
  });

  it('Phase 2 Regression: fall below Y < -10 ignores invuln, loses all carried, respawns after 60t', () => {
    const world = createWorld(5, 1, {
      player: { pos: [41, 0, 0], carried: 6, flames: 2, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
    });

    let fallEvent: Record<string, unknown> | null = null;
    for (let i = 0; i < 120; i += 1) {
      const evs = stepWorld(world, createDefaultInput());
      const f = evs.find((e) => e.name === 'player_hit' && e.data.by === 'fall');
      if (f) {
        fallEvent = f.data;
        break;
      }
    }
    expect(fallEvent).toEqual({ by: 'fall', flames: 1, dropped: 0, lost: 6 });

    for (let i = 0; i < FALL_RESPAWN_TICKS; i += 1) stepWorld(world, createDefaultInput());
    expect(world.player.pos).toEqual([0, 0, 0]);
    expect(world.player.invulnTicks).toBe(90);
  });

  it('Phase 2 Regression: Bùa Gió, Gió Lạc steal & pulse drop, Night 3 terrain & wind, Pause/Resume', () => {
    // Bùa Gió
    const wCharm = createWorld(6, 2, {
      player: { pos: [35, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
    });
    const cEv = stepWorld(wCharm, createDefaultInput());
    expect(cEv.find((e) => e.name === 'charm_picked')?.data).toEqual({
      charm_id: 'C1',
      charm_ticks: CHARM_DURATION_TICKS,
    });
    const x0 = wCharm.player.pos[0];
    for (let i = 0; i < 10; i += 1) stepWorld(wCharm, { ...createDefaultInput(), move: [1, 0] });
    expect(wCharm.player.pos[0] - x0).toBeCloseTo(CHARM_PLAYER_SPEED * (10 / TICK_RATE), 3);

    // Gió Lạc
    const wDrift = createWorld(8, 2, {
      player: { pos: [0, 0, 0], carried: 6, flames: 3, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      drifters: [{ id: 'D1', pos: [1.0, 1.2, 0], state: 'idle', stolen: 0 }],
    });
    const d1 = stepWorld(wDrift, createDefaultInput());
    expect(d1.find((e) => e.name === 'drifter_steal')?.data).toEqual({
      drifter_id: 'D1',
      amount: 3,
      carried: 3,
    });
    const d2 = stepWorld(wDrift, { ...createDefaultInput(), pulse: true });
    expect(d2.find((e) => e.name === 'drifter_drop')?.data).toEqual({ drifter_id: 'D1', amount: 3 });

    // Night 3 terrain
    expect(getGroundHeight(3, 0, 18)).toBe(3);
    expect(getGroundHeight(3, 0, 5)).toBe(6);

    // Pause/Resume freezes fuel decay too!
    const wPause = createWorld(10, 1, {
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', lit: true, fuel: 50 }],
      time_left_s: 100,
    });
    stepWorld(wPause, { ...createDefaultInput(), pause: true });
    const fuelBefore = wPause.lanterns[0]!.fuelSixtieths;
    for (let i = 0; i < 30; i += 1) stepWorld(wPause, createDefaultInput());
    expect(wPause.state).toBe('paused');
    expect(wPause.lanterns[0]!.fuelSixtieths).toBe(fuelBefore);
  });

  it('rejects malformed v1.2 inputs/scenarios and enforces shade vertical dy <= 1.5', () => {
    expect(() => validateInputsFile({ frames: [{ tick: 10 }, { tick: 10 }] })).toThrow(ContractInputError);
    expect(() => validateScenarioConfig({ lanterns: [{ id: 'L1', fuel: 150 }] })).toThrow(ContractInputError);
    expect(() => validateScenarioConfig({ shades: [{ pos: [0, 0, 0], state: 'bad' }] })).toThrow(
      ContractInputError,
    );

    const world = createWorld(12, 3, {
      player: { pos: [15, 0, -5], carried: 2, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: false,
      shades: [{ id: 'S1', pos: [15, 2.0, -5], state: 'chase' }],
    });
    const evs = stepWorld(world, createDefaultInput());
    expect(evs.some((e) => e.name === 'player_hit')).toBe(false);
  });

  it('Phase 3 edge cases: no_flames priority on dawn tick, chase ignores weak lantern, stacked drain, refuel push-out, full-fuel skip, capacity cap 20', () => {
    // 1. Capacity caps at 20 for successful_lights >= 5
    expect(getPlayerCapacity(5)).toBe(20);
    expect(getPlayerCapacity(9)).toBe(20);

    // 2. Full-fuel lantern is NOT selected on interact (0 events, 0 score)
    const wFull = createWorld(20, 1, {
      player: { pos: [0, 0, 24.5], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 100 }],
    });
    const fullEvs = stepWorld(wFull, { ...createDefaultInput(), interact: true }, {
      ...DEFAULT_TUNING,
      fuel_decay_per_s: 0,
    });
    expect(fullEvs.some((e) => e.name === 'refuel')).toBe(false);
    expect(wFull.score).toBe(0);

    // 3. Stacked drain (2 shades = 10/60 + 1/60 = 11/60 per tick) + refuel >= 30 pushes both out <= 30t
    const wStack = createWorld(21, 1, {
      player: { pos: [0, 0, 24], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true, fuel: 25 }],
      shades: [
        { id: 'S1', pos: [0, 1, 26.5], state: 'drain', target_lantern_id: 'L1' },
        { id: 'S2', pos: [1.5, 1, 25], state: 'drain', target_lantern_id: 'L1' },
      ],
    });
    const fuelStart = wStack.lanterns[0]!.fuelSixtieths;
    stepWorld(wStack, createDefaultInput());
    expect(fuelStart - wStack.lanterns[0]!.fuelSixtieths).toBe(11);

    // Refuel L1 from ~24.8 -> >= 30: interrupts drain & pushes S1 & S2 out of 6m safe zone harmlessly over <= 30 ticks
    stepWorld(wStack, { ...createDefaultInput(), interact: true });
    expect(wStack.lanterns[0]!.fuelSixtieths).toBeGreaterThanOrEqual(30 * FUEL_UNITS_PER_POINT);
    expect(wStack.shades.every((s) => s.state !== 'drain' && s.safePushTicks > 0)).toBe(true);
    for (let i = 0; i < 30; i += 1) stepWorld(wStack, createDefaultInput());
    expect(wStack.player.flames).toBe(3); // harmless while pushed out!
    for (const s of wStack.shades) {
      expect(distXZ(s.pos, wStack.lanterns[0]!.pos)).toBeGreaterThanOrEqual(5.99);
    }

    // 4. Chasing shade does NOT switch target to a nearby weak lantern
    const wChase = createWorld(22, 1, {
      player: { pos: [0, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 10], lit: true, fuel: 20 }],
      shades: [{ id: 'S1', pos: [0, 1, 9], state: 'chase' }],
    });
    stepWorld(wChase, createDefaultInput());
    expect(wChase.shades[0]?.state).toBe('chase');

    // 5. no_flames ALWAYS takes priority over dawn_survived on the exact final dawn tick
    const wDawnDeath = createWorld(23, 1, {
      player: { pos: [0, 0, 0], carried: 0, flames: 1 },
      random_motes: false,
      random_shades: false,
      lanterns: [
        { id: 'L1', lit: true, fuel: 80 },
        { id: 'L2', lit: true, fuel: 80 },
        { id: 'L3', lit: true, fuel: 80 },
      ],
      shades: [{ id: 'S1', pos: [0.5, 1, 0], state: 'chase' }],
      time_left_s: 1 / 60,
    });
    const finalEvs = stepWorld(wDawnDeath, createDefaultInput());
    expect(wDawnDeath.state).toBe('lost');
    expect(finalEvs.find((e) => e.name === 'game_over')?.data).toEqual({
      result: 'lost',
      reason: 'no_flames',
    });
  });
});
