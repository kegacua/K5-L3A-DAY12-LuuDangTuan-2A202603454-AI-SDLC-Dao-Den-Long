import contractJson from '../../game.contract.json';
import type { GameContract, LanternState, TuningConfig } from './types.js';

export const GAME_CONTRACT: GameContract = contractJson as GameContract;
export const DEFAULT_TUNING: TuningConfig = GAME_CONTRACT.tuning;

export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;

export const DEFAULT_ISLAND_RADIUS = 60;
export const JUMP_VELOCITY = 7.2;
export const GRAVITY = 20.0;

export const MAX_RANDOM_MOTES = 18;
export const INITIAL_RANDOM_MOTES = 15;
export const MOTE_RESPAWN_TICKS = 180; // every 3s when below cap

export const MAX_RANDOM_SHADES = 4;
export const INITIAL_RANDOM_SHADES = 2;
export const SHADE_RESPAWN_TICKS = 900; // every 15s when below cap
export const SHADE_MIN_SPAWN_PLAYER_DIST = 16;

export const NIGHT1_LANTERNS: ReadonlyArray<Readonly<LanternState>> = [
  { id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0 },
  { id: 'L2', pos: [23.776, 0, 7.725], lit: false, deposited: 0 },
  { id: 'L3', pos: [14.695, 0, -20.225], lit: false, deposited: 0 },
  { id: 'L4', pos: [-14.695, 0, -20.225], lit: false, deposited: 0 },
  { id: 'L5', pos: [-23.776, 0, 7.725], lit: false, deposited: 0 },
];
