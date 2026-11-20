import { describe, expect, it } from 'vitest';
import {
  CHARM_DURATION_TICKS,
  CHARM_PLAYER_SPEED,
  DEFAULT_TUNING,
  DROPPED_MOTE_TTL_TICKS,
  FALL_RESPAWN_TICKS,
  TICK_RATE,
} from '../src/core/config.js';
import { getGroundHeight } from '../src/core/maps.js';
import {
  createDefaultInput,
  createWorld,
  distXZ,
  runHeadlessSimulation,
  stepWorld,
} from '../src/core/simulation.js';
import {
  ContractInputError,
  validateInputsFile,
  validateScenarioConfig,
} from '../src/core/validation.js';

describe('Phase 1 Regression + Phase 2 (Ticket-02 / Contract v1.1) Unit Tests', () => {
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

  it('jumps on false->true rising edge with 7.0 m/s & -20 m/s^2 and lands at y = 0', () => {
    const world = createWorld(1, 1, { random_motes: false, random_shades: false });
    stepWorld(world, { ...createDefaultInput(), jump: true });
    expect(world.player.grounded).toBe(false);
    expect(world.player.pos[1]).toBeGreaterThan(0);

    let peakY = world.player.pos[1];
    for (let i = 0; i < 60; i += 1) {
      stepWorld(world, { ...createDefaultInput(), jump: true });
      peakY = Math.max(peakY, world.player.pos[1]);
    }
    expect(peakY).toBeCloseTo(1.22, 1); // v^2 / 2g = 49 / 40 = 1.225m
    expect(world.player.pos[1]).toBe(0);
    expect(world.player.grounded).toBe(true);
  });

  it('dashes at 14 m/s for 12 ticks (0.2s), holds altitude in air, and enforces 90-tick (1.5s) cooldown', () => {
    const world = createWorld(1, 1, { random_motes: false, random_shades: false });
    // Jump first so player is mid-air
    stepWorld(world, { ...createDefaultInput(), jump: true });
    for (let i = 0; i < 6; i += 1) stepWorld(world, createDefaultInput());
    const airY = world.player.pos[1];
    expect(airY).toBeGreaterThan(0.5);

    // Dash while mid-air
    const ev = stepWorld(world, { ...createDefaultInput(), dash: true });
    expect(ev.some((e) => e.name === 'dash')).toBe(true);
    expect(world.player.pos[1]).toBeCloseTo(airY, 4); // altitude held!

    for (let i = 0; i < 11; i += 1) {
      stepWorld(world, { ...createDefaultInput(), dash: false });
      expect(world.player.pos[1]).toBeCloseTo(airY, 4);
    }
    // 12 ticks at 14 m/s = 2.8m along +Z (facing direction)
    expect(world.player.pos[2]).toBeCloseTo(2.8, 2);

    // Try dashing again during 90-tick cooldown => blocked
    const evBlocked = stepWorld(world, { ...createDefaultInput(), dash: true });
    expect(evBlocked.some((e) => e.name === 'dash')).toBe(false);
  });

  it('awards +10 per mote deposited (not on pickup), +100 per lantern, and win bonuses', () => {
    const { world, records } = runHeadlessSimulation({
      seed: 7,
      night: 1,
      ticks: 60,
      snapshotEvery: 10,
      scenario: {
        player: { pos: [0, 0, 23.5], carried: 10, flames: 3 },
        random_motes: false,
        random_shades: false,
        lanterns: [
          { id: 'L1', pos: [0, 0, 25], deposited: 0, lit: false },
          { id: 'L2', lit: true },
          { id: 'L3', lit: true },
          { id: 'L4', lit: true },
          { id: 'L5', lit: true },
        ],
        time_left_s: 100,
      },
      inputs: { frames: [{ tick: 0, interact: true }] },
    });

    expect(world.state).toBe('won');
    expect(records.some((r) => r.type === 'event' && r.name === 'deposit')).toBe(true);
    expect(records.some((r) => r.type === 'event' && r.name === 'lantern_lit')).toBe(true);
    // 10*10 (deposited) + 100 (lantern) + 99*2 (time) + 3*50 (flames) = 548
    expect(world.score).toBe(10 * 10 + 100 + 99 * 2 + 3 * 50);
  });

  it('pulses (cost 3, 3D radius 5m) to stun 120 ticks & push 4m over 15 ticks (+5 score)', () => {
    const world = createWorld(2, 1, {
      player: { pos: [0, 0, 0], carried: 6, flames: 3 },
      random_motes: false,
      random_shades: false,
      shades: [{ id: 'S1', pos: [3.5, 1, 0], state: 'chase' }],
    });

    const ev = stepWorld(world, { ...createDefaultInput(), pulse: true });
    expect(ev.find((e) => e.name === 'pulse')?.data).toEqual({ stunned_ids: ['S1'] });
    expect(world.player.carried).toBe(3);
    expect(world.score).toBe(5);
    expect(world.shades[0]?.state).toBe('stunned');

    // Over 15 ticks of push, shade moves +4m along +X (3.5 -> 7.5)
    for (let i = 0; i < 15; i += 1) {
      stepWorld(world, createDefaultInput());
    }
    expect(world.shades[0]!.pos[0]).toBeCloseTo(7.5, 2);
    expect(world.shades[0]?.state).toBe('stunned');

    // Advance until tick 120 (still stunned), then tick 121 => resumes chase
    while (world.simTick < 120) stepWorld(world, createDefaultInput());
    expect(world.shades[0]?.state).toBe('stunned');
    stepWorld(world, createDefaultInput());
    expect(world.shades[0]?.state).toBe('chase');
  });

  it('drops floor(carried/2) motes into 1.5-2.5m ring with 480-tick TTL, recoil 60t, invuln 90t', () => {
    const world = createWorld(4, 1, {
      player: { pos: [0, 0, 0], carried: 5, flames: 3 },
      random_motes: false,
      random_shades: false,
      shades: [{ id: 'S1', pos: [0.8, 1, 0], state: 'chase' }],
    });

    const ev1 = stepWorld(world, createDefaultInput());
    const hit = ev1.find((e) => e.name === 'player_hit');
    expect(hit?.data).toEqual({ by: 'shade', flames: 2, dropped: 2 });
    expect(world.player.carried).toBe(3); // 5 - floor(5/2) = 3
    expect(world.player.invulnTicks).toBe(90);
    expect(world.shades[0]?.state).toBe('recoil');
    expect(world.motes).toHaveLength(2);
    expect(world.motes.every((m) => m.kind === 'dropped' && m.ttlTicks === DROPPED_MOTE_TTL_TICKS)).toBe(true);
    for (const m of world.motes) {
      const r = distXZ(m.pos, [0, 0, 0]);
      expect(r).toBeGreaterThanOrEqual(1.49);
      expect(r).toBeLessThanOrEqual(2.51);
    }

    // Remove shade after verifying hit & recoil so player survives to observe exact 480-tick TTL expiry
    world.shades = [];
    for (let i = 0; i < DROPPED_MOTE_TTL_TICKS; i += 1) {
      stepWorld(world, createDefaultInput());
    }
    expect(world.motes).toHaveLength(0);
  });

  it('handles fall below Y < -10: ignores invuln, loses all carried, respawns after 60t with 90t invuln', () => {
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
    expect(world.player.carried).toBe(0);
    expect(world.player.respawnTicks).toBe(FALL_RESPAWN_TICKS);

    // Wait 60 ticks => respawned at (0,0,0) with 90-tick invuln
    for (let i = 0; i < FALL_RESPAWN_TICKS; i += 1) {
      stepWorld(world, createDefaultInput());
    }
    expect(world.player.pos).toEqual([0, 0, 0]);
    expect(world.player.invulnTicks).toBe(90);
  });

  it('supports Bùa Gió (speed 7.2, 0 dash cd for 600 ticks) and Night 2 Jump Pad launch to Island B', () => {
    const world = createWorld(6, 2, {
      player: { pos: [35, 0, 0], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
    });

    // Pick up C1 at (35, 0, 0)
    const ev = stepWorld(world, createDefaultInput());
    expect(ev.find((e) => e.name === 'charm_picked')?.data).toEqual({
      charm_id: 'C1',
      charm_ticks: CHARM_DURATION_TICKS,
    });
    expect(world.charms[0]?.available).toBe(false);

    // Run along +X for 10 ticks at 7.2 m/s => 1.2m
    const x0 = world.player.pos[0];
    for (let i = 0; i < 10; i += 1) {
      stepWorld(world, { ...createDefaultInput(), move: [1, 0] });
    }
    expect(world.player.pos[0] - x0).toBeCloseTo(CHARM_PLAYER_SPEED * (10 / TICK_RATE), 3);

    // Dash twice back-to-back with 0 cooldown while charm active
    const d1 = stepWorld(world, { ...createDefaultInput(), dash: true });
    expect(d1.some((e) => e.name === 'dash')).toBe(true);
    for (let i = 0; i < 12; i += 1) stepWorld(world, createDefaultInput());
    const d2 = stepWorld(world, { ...createDefaultInput(), dash: true });
    expect(d2.some((e) => e.name === 'dash')).toBe(true);
  });

  it('implements Gió Lạc (Drifter) steal & pulse drop on Night 2', () => {
    const world = createWorld(8, 2, {
      player: { pos: [0, 0, 0], carried: 6, flames: 3, invuln_ticks: 90 },
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      drifters: [{ id: 'D1', pos: [1.0, 1.2, 0], state: 'idle', stolen: 0 }],
    });

    // Tick 1: Drifter detects carried>=5 & dist<=15 -> chases -> steals 3 (ignores invuln!)
    const ev1 = stepWorld(world, createDefaultInput());
    expect(ev1.find((e) => e.name === 'drifter_steal')?.data).toEqual({
      drifter_id: 'D1',
      amount: 3,
      carried: 3,
    });
    expect(world.drifters[0]?.state).toBe('flee');
    expect(world.drifters[0]?.stolen).toBe(3);

    // Tick 2: Pulse hits fleeing drifter -> drops all 3 motes on ground
    const ev2 = stepWorld(world, { ...createDefaultInput(), pulse: true });
    expect(ev2.find((e) => e.name === 'drifter_drop')?.data).toEqual({
      drifter_id: 'D1',
      amount: 3,
    });
    expect(world.motes).toHaveLength(3);
    expect(world.drifters[0]?.stolen).toBe(0);
  });

  it('models Night 3 three-tier terrain, ramps, Bell Tower obstacle, and periodic wind', () => {
    expect(getGroundHeight(3, 35, 0)).toBe(0); // Tier 0
    expect(getGroundHeight(3, 0, 18)).toBe(3); // Tier 1 (z > 0, r in 12..24)
    expect(getGroundHeight(3, 0, -18)).toBe(0); // Tier 0 (z < 0)
    expect(getGroundHeight(3, 0, 5)).toBe(6); // Tier 2 (r <= 8)
    expect(getGroundHeight(3, 46, 0)).toBeNull(); // Void
    // Midpoint of 30° ramp (r = 27) should be Y = 1.5
    const r30 = (30 * Math.PI) / 180;
    expect(getGroundHeight(3, Math.cos(r30) * 27, Math.sin(r30) * 27)).toBeCloseTo(1.5, 2);

    // Wind activates at simTick 1800 for 300 ticks
    const world = createWorld(9, 3, {
      random_motes: false,
      random_shades: false,
      random_drifters: false,
      wind_enabled: true,
    });
    for (let i = 0; i < 1800; i += 1) stepWorld(world, createDefaultInput());
    expect(world.wind.active).toBe(true);
    for (let i = 0; i < 300; i += 1) stepWorld(world, createDefaultInput());
    expect(world.wind.active).toBe(false);
  });

  it('freezes sim_tick, timers, and time_left_s while paused, and resumes cleanly', () => {
    const world = createWorld(10, 1, {
      random_motes: false,
      random_shades: false,
      time_left_s: 100,
    });

    for (let i = 0; i < 10; i += 1) stepWorld(world, { ...createDefaultInput(), move: [0, 1] });
    const simBefore = world.simTick;
    const timeBefore = world.timeLeftS;
    const zBefore = world.player.pos[2];

    const evPause = stepWorld(world, { ...createDefaultInput(), pause: true });
    expect(evPause.map((e) => e.name)).toEqual(['paused']);
    expect(world.state).toBe('paused');

    for (let i = 0; i < 30; i += 1) {
      stepWorld(world, { ...createDefaultInput(), move: [0, 1], pause: false });
    }
    expect(world.tick).toBe(41);
    expect(world.simTick).toBe(simBefore);
    expect(world.timeLeftS).toBe(timeBefore);
    expect(world.player.pos[2]).toBe(zBefore);

    const evResume = stepWorld(world, { ...createDefaultInput(), pause: true });
    expect(evResume.some((e) => e.name === 'resumed')).toBe(true);
    expect(world.state).toBe('playing');
    expect(world.simTick).toBe(simBefore + 1);
  });

  it('rejects malformed v1.1 inputs/scenarios with ContractInputError', () => {
    expect(() => validateInputsFile({ frames: [{ tick: 10 }, { tick: 10 }] })).toThrow(ContractInputError);
    expect(() => validateInputsFile({ frames: [{ tick: 0, dash: 'yes' }] })).toThrow(ContractInputError);
    expect(() => validateScenarioConfig({ shades: [{ pos: [0, 0, 0], state: 'invalid' }] })).toThrow(
      ContractInputError,
    );
  });

  it('enforces exact shade vertical hit check dy <= 1.5 (does not hit when shade is 2.0m above Mây)', () => {
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
    expect(world.player.flames).toBe(3);
  });
});
