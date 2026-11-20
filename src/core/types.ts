export type Vec3Tuple = [number, number, number];
export type Vec2Tuple = [number, number];

export type GamePhaseState = 'playing' | 'won' | 'lost';
export type ShadeStateName = 'chase' | 'stunned';
export type GameOverReason = 'all_lit' | 'dawn' | 'no_flames';

export interface ScoreTuning {
  per_mote: number;
  per_lantern: number;
  per_stun: number;
  per_second_left: number;
  per_flame_left: number;
}

export interface TuningConfig {
  player_speed: number;
  carry_capacity: number;
  lantern_cost: number;
  lantern_count_night1: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  flames: number;
  invuln_s: number;
  hit_drop_ratio: number;
  pulse_stun_s: number;
  pulse_push_m: number;
  pulse_cooldown_s: number;
  safe_radius: number;
  shade_speed: number;
  shade_hit_radius: number;
  fall_enabled: boolean;
  score: ScoreTuning;
}

export interface GameContract {
  contract_version: string;
  team: string;
  build_cmd: string;
  run_cmd: string;
  headless_cmd: string;
  tuning: TuningConfig;
}

export interface PlayerState {
  pos: Vec3Tuple;
  vy: number;
  yawRad: number;
  flames: number;
  carried: number;
  invulnTicks: number;
  pulseCooldownTicks: number;
}

export interface LanternState {
  id: string;
  pos: Vec3Tuple;
  lit: boolean;
  deposited: number;
}

export interface ShadeEntity {
  id: string;
  pos: Vec3Tuple;
  state: ShadeStateName;
  stunTicks: number;
}

export interface MoteEntity {
  id: string;
  pos: Vec3Tuple;
}

export interface InputFrame {
  tick: number;
  move?: Vec2Tuple;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
}

export interface InputsFile {
  frames: InputFrame[];
}

export interface EffectiveInput {
  move: Vec2Tuple;
  cam_yaw_deg: number;
  jump: boolean;
  interact: boolean;
  pulse: boolean;
}

export interface ScenarioPlayer {
  pos?: Vec3Tuple;
  carried?: number;
  flames?: number;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3Tuple;
  deposited?: number;
  lit?: boolean;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3Tuple;
  state?: ShadeStateName;
}

export type ScenarioMote = Vec3Tuple | { id?: string; pos: Vec3Tuple };

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  time_left_s?: number;
}

export interface WorldState {
  seed: number;
  night: number;
  tick: number;
  simTick: number;
  state: GamePhaseState;
  gameOverReason: GameOverReason | null;
  initialTimeLeftS: number;
  timeLeftS: number;
  score: number;
  islandRadius: number;
  randomMotes: boolean;
  randomShades: boolean;
  moteSpawnCooldownTicks: number;
  shadeSpawnCooldownTicks: number;
  nextMoteId: number;
  nextShadeId: number;
  player: PlayerState;
  lanterns: LanternState[];
  shades: ShadeEntity[];
  motes: MoteEntity[];
  prevInput: EffectiveInput;
  rngState: number;
  lastPulseTick: number;
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  state: GamePhaseState;
  time_left_s: number;
  score: number;
  player: {
    pos: Vec3Tuple;
    flames: number;
    carried: number;
  };
  lanterns: Array<{
    id: string;
    pos: Vec3Tuple;
    lit: boolean;
    deposited: number;
  }>;
  shades: Array<{
    id: string;
    pos: Vec3Tuple;
    state: ShadeStateName;
  }>;
  motes_active: number;
  motes: Array<{
    id: string;
    pos: Vec3Tuple;
  }>;
}

export type EventName =
  | 'mote_picked'
  | 'deposit'
  | 'lantern_lit'
  | 'pulse'
  | 'player_hit'
  | 'shade_spawned'
  | 'game_over';

export interface EventRecord {
  type: 'event';
  tick: number;
  name: EventName;
  data: Record<string, unknown>;
}

export interface EndRecord {
  type: 'end';
  ticks: number;
  state: GamePhaseState;
  score: number;
}

export type OutputRecord = SnapshotRecord | EventRecord | EndRecord;
