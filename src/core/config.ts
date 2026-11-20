import contractJson from '../../game.contract.json';
import type { GameContract, NightId, TuningConfig } from './types.js';

export const GAME_CONTRACT: GameContract = contractJson as GameContract;
export const DEFAULT_TUNING: TuningConfig = GAME_CONTRACT.tuning;

export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;

// Standardized movement & combat constants (Ticket-02 + Ticket-03)
export const JUMP_VELOCITY = 7.0;
export const GRAVITY = 20.0;
export const CHARM_PLAYER_SPEED = 7.2;
export const CHARM_DURATION_TICKS = 600;
export const CHARM_RESPAWN_TICKS = 2700;

export const PICKUP_MAX_DY = 1.5;
export const SHADE_HIT_MAX_DY = 1.5;
export const SHADE_DETECT_RADIUS = 12.0;
export const SHADE_DROP_CHASE_RADIUS = 18.0;
export const SHADE_DRAIN_RADIUS = 2.0;
export const SHADE_DRAIN_ALERT_PLAYER_RADIUS = 6.0;
export const SHADE_DRAIN_EVENT_INTERVAL_TICKS = 60;
export const SHADE_WANDER_SPEED = 2.0;
export const SHADE_NIGHT3_SPEED = 4.5;
export const SHADE_SPAWN_DELAY_TICKS = 30;
export const SHADE_RECOIL_TICKS = 60;
export const SHADE_RECOIL_DIST = 2.0;
export const SHADE_MIN_SPAWN_PLAYER_DIST = 15.0;
export const SAFE_PUSH_MAX_TICKS = 30;

// Ticket-03 Fuel & Scoring constants
export const FUEL_UNITS_PER_POINT = 60; // exact integer 1/60 units
export const SCORE_RELIGHT = 40;
export const SCORE_PULSE_DRAINING_SHADE = 15;
export const SCORE_DAWN_LIT_LANTERN_BASE = 50;
export const CAPACITY_BONUS_PER_LIGHT = 2;

export const PULSE_CENTER_Y_OFFSET = 0.8;
export const PULSE_PUSH_TICKS = 15;

export const DROPPED_MOTE_TTL_TICKS = 480;
export const DROPPED_MOTE_RING_MIN = 1.5;
export const DROPPED_MOTE_RING_MAX = 2.5;

export const FALL_THRESHOLD_Y = -10.0;
export const FALL_RESPAWN_TICKS = 60;

export const INITIAL_RANDOM_MOTES = 20;
export const MAX_RANDOM_MOTES = 30;
export const MOTE_SPAWN_INTERVAL_TICKS = 240;

export const SHADE_FIRST_SPAWN_TICK = 300;
export const SHADE_FIRST_SPAWN_COUNT = 2;

export const DRIFTER_IDLE_SPEED = 2.0;
export const DRIFTER_SPEED = 7.0;
export const DRIFTER_MAX_ACTIVE = 2;
export const DRIFTER_SPAWN_INTERVAL_TICKS = 1200;
export const DRIFTER_TRIGGER_CARRIED = 5;
export const DRIFTER_TRIGGER_DIST = 15.0;
export const DRIFTER_STEAL_RADIUS = 1.2;
export const DRIFTER_STEAL_MAX = 3;
export const DRIFTER_FLEE_TICKS = 240;
export const DRIFTER_PULSE_DROP_FLEE_TICKS = 120;

export const WIND_CYCLE_TICKS = 1800; // every 30s
export const WIND_WARN_TICKS = 120; // 2s warning
export const WIND_ACTIVE_TICKS = 300; // 5s active gust
export const WIND_PUSH_SPEED = 2.0;

export function getNightDurationS(night: NightId, tuning: TuningConfig = DEFAULT_TUNING): number {
  if (night === 1) return tuning.night1_duration_s;
  if (night === 2) return tuning.night2_duration_s;
  return tuning.night3_duration_s;
}

export function getShadeSpeed(night: NightId, tuning: TuningConfig = DEFAULT_TUNING): number {
  return night === 3 ? SHADE_NIGHT3_SPEED : tuning.shade_speed;
}

export function getPlayerCapacity(
  successfulLights: number,
  tuning: TuningConfig = DEFAULT_TUNING,
): number {
  return Math.min(
    tuning.capacity_max,
    tuning.carry_capacity + CAPACITY_BONUS_PER_LIGHT * successfulLights,
  );
}
