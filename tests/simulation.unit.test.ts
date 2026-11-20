import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNING, TICK_RATE } from '../src/core/config.js';
import {
  createDefaultInput,
  createWorld,
  distXZ,
  runHeadlessSimulation,
  stepWorld,
} from '../src/core/simulation.js';
import { ContractInputError, validateInputsFile, validateScenarioConfig } from '../src/core/validation.js';

describe('Phase 1 Core Simulation (PRD-0 & Test Contract v1.0)', () => {
  it('moves accurately according to player_speed, cam_yaw_deg, and diagonal normalization', () => {
    // 1. Straight +Z at yaw=0 for 60 ticks (1s) => z = player_speed
    const w1 = createWorld(1, 1, { random_motes: false, random_shades: false });
    const inp1 = { ...createDefaultInput(), move: [0, 1] as [number, number], cam_yaw_deg: 0 };
    for (let i = 0; i < 60; i += 1) stepWorld(w1, inp1);
    expect(w1.player.pos[0]).toBeCloseTo(0, 5);
    expect(w1.player.pos[2]).toBeCloseTo(DEFAULT_TUNING.player_speed, 4);

    // 2. Rotated 90 deg: x' = x*cos90 + z*sin90 = +1, z' = -x*sin90 + z*cos90 = 0
    const w2 = createWorld(1, 1, { random_motes: false, random_shades: false });
    const inp2 = { ...createDefaultInput(), move: [0, 1] as [number, number], cam_yaw_deg: 90 };
    for (let i = 0; i < 60; i += 1) stepWorld(w2, inp2);
    expect(w2.player.pos[0]).toBeCloseTo(DEFAULT_TUNING.player_speed, 4);
    expect(w2.player.pos[2]).toBeCloseTo(0, 4);

    // 3. Diagonal [1, 1] normalized to length 1 => distance after 1s === player_speed
    const w3 = createWorld(1, 1, { random_motes: false, random_shades: false });
    const inp3 = { ...createDefaultInput(), move: [1, 1] as [number, number], cam_yaw_deg: 0 };
    for (let i = 0; i < 60; i += 1) stepWorld(w3, inp3);
    const moved = Math.hypot(w3.player.pos[0], w3.player.pos[2]);
    expect(moved).toBeCloseTo(DEFAULT_TUNING.player_speed, 4);
  });

  it('jumps on false->true rising edge and lands back on y = 0', () => {
    const world = createWorld(1, 1, { random_motes: false, random_shades: false });
    stepWorld(world, { ...createDefaultInput(), jump: true });
    expect(world.player.pos[1]).toBeGreaterThan(0);

    let peakY = world.player.pos[1];
    for (let i = 0; i < 60; i += 1) {
      stepWorld(world, { ...createDefaultInput(), jump: true }); // held true should NOT re-jump on landing
      peakY = Math.max(peakY, world.player.pos[1]);
    }
    expect(peakY).toBeGreaterThan(1.0);
    expect(world.player.pos[1]).toBe(0);
  });

  it('picks up motes within pickup_radius respecting carry_capacity and awards per_mote', () => {
    const world = createWorld(1, 1, {
      random_motes: false,
      random_shades: false,
      player: { pos: [0, 0, 0], carried: DEFAULT_TUNING.carry_capacity - 1 },
      motes: [
        [0, 0, DEFAULT_TUNING.pickup_radius], // exactly on boundary -> picked
        [0, 0, 0.5], // closer -> picked first, fills capacity so outer stays unpicked!
      ],
    });
    const events = stepWorld(world, createDefaultInput());
    expect(events).toHaveLength(1);
    expect(events[0]?.name).toBe('mote_picked');
    expect(events[0]?.data).toEqual({ carried: DEFAULT_TUNING.carry_capacity });
    expect(world.motes).toHaveLength(1);
    expect(world.score).toBe(DEFAULT_TUNING.score.per_mote);
  });

  it('deposits on interact rising edge, lights lantern, and wins when all 5 are lit with bonus score', () => {
    const { world, records } = runHeadlessSimulation({
      seed: 7,
      night: 1,
      ticks: 60,
      snapshotEvery: 10,
      scenario: {
        player: { pos: [0, 0, 23], carried: 3, flames: 3 },
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
      inputs: {
        frames: [{ tick: 0, interact: true }],
      },
    });

    // Scenario setup emitted 0 events and 0 score at tick 0
    const snap0 = records[0];
    expect(snap0?.type).toBe('snapshot');
    if (snap0?.type === 'snapshot') {
      expect(snap0.tick).toBe(0);
      expect(snap0.score).toBe(0);
    }

    const eventNames = records.filter((r) => r.type === 'event').map((r) => r.name);
    expect(eventNames).toEqual(['deposit', 'lantern_lit', 'game_over']);

    expect(world.state).toBe('won');
    expect(world.tick).toBe(1);
    // timeLeftS at tick 1 is 100 - 1/60 => floor = 99
    const expectedScore =
      DEFAULT_TUNING.score.per_lantern +
      99 * DEFAULT_TUNING.score.per_second_left +
      3 * DEFAULT_TUNING.score.per_flame_left;
    expect(world.score).toBe(expectedScore);
  });

  it('pulses to stun and push shades by pulse_push_m for exact pulse_stun_s duration and respects cooldown', () => {
    const world = createWorld(2, 1, {
      player: { pos: [0, 0, 0], carried: 3, flames: 3 },
      random_motes: false,
      random_shades: false,
      shades: [{ id: 'S1', pos: [5, 1, 0] }],
    });

    // Trigger pulse on step 0 (tick 1)
    const ev1 = stepWorld(world, { ...createDefaultInput(), pulse: true });
    expect(ev1.some((e) => e.name === 'pulse')).toBe(true);
    const pulseEv = ev1.find((e) => e.name === 'pulse');
    expect(pulseEv?.data).toEqual({ stunned_ids: ['S1'] });
    expect(world.player.carried).toBe(3 - DEFAULT_TUNING.pulse_cost);
    expect(world.score).toBe(DEFAULT_TUNING.score.per_stun);
    expect(world.shades[0]?.state).toBe('stunned');
    expect(world.shades[0]?.pos[0]).toBeCloseTo(5 + DEFAULT_TUNING.pulse_push_m, 4);

    // Release and immediately re-press during cooldown => blocked!
    stepWorld(world, { ...createDefaultInput(), pulse: false });
    const blockedEv = stepWorld(world, { ...createDefaultInput(), pulse: true });
    expect(blockedEv.some((e) => e.name === 'pulse')).toBe(false);

    // Advance to tick 180 (1 tick before stun expires at tick 1 + 180 = 181) => still stunned
    const stunTicks = Math.round(DEFAULT_TUNING.pulse_stun_s * TICK_RATE);
    while (world.tick < 1 + stunTicks - 1) {
      stepWorld(world, createDefaultInput());
    }
    expect(world.tick).toBe(180);
    expect(world.shades[0]?.state).toBe('stunned');

    // On exact stun expiration tick (tick 181 = 3.0s after pulse) => transitions back to chase and moves
    const xBefore = world.shades[0]!.pos[0];
    stepWorld(world, createDefaultInput());
    expect(world.tick).toBe(181);
    expect(world.shades[0]?.state).toBe('chase');
    expect(world.shades[0]!.pos[0]).toBeLessThan(xBefore);
  });

  it('keeps chasing shades strictly outside safe_radius of lit lanterns', () => {
    const world = createWorld(3, 1, {
      player: { pos: [0, 0, 25], carried: 0, flames: 3 },
      random_motes: false,
      random_shades: false,
      lanterns: [{ id: 'L1', pos: [0, 0, 25], lit: true }],
      shades: [{ id: 'S1', pos: [0, 1, 15] }],
    });

    for (let i = 0; i < 300; i += 1) {
      stepWorld(world, createDefaultInput());
      const d = distXZ(world.shades[0]!.pos, world.lanterns[0]!.pos);
      expect(d).toBeGreaterThan(DEFAULT_TUNING.safe_radius);
    }
    expect(world.player.flames).toBe(3);
  });

  it('damages player on shade hit, drops motes by hit_drop_ratio, enforces invuln_s, and loses at 0 flames', () => {
    const world = createWorld(4, 1, {
      player: { pos: [0, 0, 0], carried: 4, flames: 2 },
      random_motes: false,
      random_shades: false,
      shades: [{ id: 'S1', pos: [1.0, 1, 0] }],
    });

    // Tick 1: immediate hit
    const ev1 = stepWorld(world, createDefaultInput());
    const hit1 = ev1.find((e) => e.name === 'player_hit');
    expect(hit1?.data).toEqual({ by: 'shade', flames: 1, dropped: 2 });
    expect(world.player.carried).toBe(2);

    // During invuln_s (119 more ticks): no second hit!
    const invulnTicks = Math.round(DEFAULT_TUNING.invuln_s * TICK_RATE);
    for (let i = 1; i < invulnTicks; i += 1) {
      const ev = stepWorld(world, createDefaultInput());
      expect(ev.some((e) => e.name === 'player_hit')).toBe(false);
    }

    // Exact tick invuln expires: second hit => 0 flames => lost (no_flames)
    const evFinal = stepWorld(world, createDefaultInput());
    expect(evFinal.map((e) => e.name)).toEqual(['player_hit', 'game_over']);
    expect(evFinal[1]?.data).toEqual({ result: 'lost', reason: 'no_flames' });
    expect(world.state).toBe('lost');
  });

  it('ends with lost (dawn) when time runs out', () => {
    const { world, records } = runHeadlessSimulation({
      seed: 9,
      night: 1,
      ticks: 120,
      snapshotEvery: 30,
      scenario: {
        random_motes: false,
        random_shades: false,
        time_left_s: 1.0,
      },
    });
    expect(world.state).toBe('lost');
    expect(world.tick).toBe(60);
    const go = records.find((r) => r.type === 'event' && r.name === 'game_over');
    expect(go?.type === 'event' ? go.data : null).toEqual({ result: 'lost', reason: 'dawn' });
  });

  it('rejects malformed inputs/scenarios with ContractInputError', () => {
    expect(() =>
      validateInputsFile({ frames: [{ tick: 10 }, { tick: 10 }] }),
    ).toThrow(ContractInputError);
    expect(() =>
      validateInputsFile({ frames: [{ tick: 10 }, { tick: 5 }] }),
    ).toThrow(ContractInputError);
    expect(() =>
      validateInputsFile({ frames: [{ tick: 0, move: [2, 0] }] }),
    ).toThrow(ContractInputError);
    expect(() =>
      validateScenarioConfig({ time_left_s: -5 }),
    ).toThrow(ContractInputError);
  });

  it('prevents duplicate IDs when mixing explicit and auto-generated scenario motes/shades', () => {
    const world = createWorld(10, 1, {
      random_motes: true,
      random_shades: true,
      motes: [
        [10, 0, 0],
        { id: 'M1', pos: [12, 0, 0] },
      ],
      shades: [
        { id: 'S1', pos: [30, 1, 0] },
        { pos: [35, 1, 0] },
      ],
    });
    const moteIds = world.motes.map((m) => m.id);
    const shadeIds = world.shades.map((s) => s.id);
    expect(new Set(moteIds).size).toBe(2);
    expect(moteIds).toContain('M1');
    expect(new Set(shadeIds).size).toBe(2);
    expect(shadeIds).toContain('S1');

    // Advance enough ticks for random mote & shade spawns and ensure all IDs stay unique
    for (let i = 0; i < 950; i += 1) {
      stepWorld(world, createDefaultInput());
    }
    expect(new Set(world.motes.map((m) => m.id)).size).toBe(world.motes.length);
    expect(new Set(world.shades.map((s) => s.id)).size).toBe(world.shades.length);
  });
});
