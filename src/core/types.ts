export type Vec3Tuple = [number, number, number];
export type Vec2Tuple = [number, number];

export type NightId = 1 | 2 | 3;
export type GamePhaseState = 'playing' | 'paused' | 'won' | 'lost';
export type ShadeStateName = 'spawning' | 'wander' | 'chase' | 'recoil' | 'stunned' | 'drain';
export type DrifterStateName = 'idle' | 'chase' | 'flee' | 'removed';
export type MoteKind = 'random' | 'dropped';
export type GameOverReason = 'dawn_survived' | 'dawn' | 'no_flames';

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
  capacity_max: number;
  lantern_cost: number;
  relight_cost: number;
  lantern_count_night1: number;
  fuel_max: number;
  fuel_decay_per_s: number;
  fuel_per_mote: number;
  drain_per_s: number;
  low_fuel_threshold: number;
  win_ratio: number;
  pickup_radius: number;
  interact_radius: number;
  pulse_cost: number;
  pulse_radius: number;
  night1_duration_s: number;
  night2_duration_s: number;
  night3_duration_s: number;
  dash_speed: number;
  dash_duration_s: number;
  dash_cooldown_s: number;
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
  vel: Vec3Tuple;
  grounded: boolean;
  yawRad: number;
  flames: number;
  carried: number;
  successfulLights: number;
  invulnTicks: number;
  dashTicks: number;
  dashCdTicks: number;
  dashDir: Vec2Tuple;
  pulseCdTicks: number;
  charmTicks: number;
  launched: boolean;
  fallPending: boolean;
  respawnTicks: number;
}

export interface LanternState {
  id: string;
  pos: Vec3Tuple;
  lit: boolean;
  deposited: number;
  /** Exact integer fuel in 1/60 units (100 fuel = 6000) to avoid floating-point drift */
  fuelSixtieths: number;
  everLit: boolean;
  relitCount: number;
}

export interface ShadeEntity {
  id: string;
  pos: Vec3Tuple;
  state: ShadeStateName;
  stateTicksLeft: number;
  pushTicksLeft: number;
  pushDir: Vec2Tuple;
  recoilDir: Vec2Tuple;
  safePushTicks: number;
  wanderAngle: number;
  targetLanternId: string | null;
  drainTicks: number;
  readySimTick: number;
}

export interface MoteEntity {
  id: string;
  pos: Vec3Tuple;
  kind: MoteKind;
  ttlTicks: number | null;
  readySimTick: number;
}

export interface DrifterEntity {
  id: string;
  pos: Vec3Tuple;
  state: DrifterStateName;
  stolen: number;
  fleeTicks: number;
  orbitAngle: number;
  readySimTick: number;
}

export interface CharmEntity {
  id: string;
  pos: Vec3Tuple;
  available: boolean;
  respawnTicks: number;
}

export interface WindState {
  enabled: boolean;
  active: boolean;
  warning: boolean;
  dirDeg: number;
  cycleTick: number;
}

export interface InputFrame {
  tick: number;
  move?: Vec2Tuple;
  cam_yaw_deg?: number;
  jump?: boolean;
  interact?: boolean;
  pulse?: boolean;
  dash?: boolean;
  pause?: boolean;
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
  dash: boolean;
  pause: boolean;
}

export interface ScenarioPlayer {
  pos?: Vec3Tuple;
  carried?: number;
  flames?: number;
  successful_lights?: number;
  invuln_ticks?: number;
  dash_cd_ticks?: number;
  pulse_cd_ticks?: number;
  charm_ticks?: number;
}

export interface ScenarioLantern {
  id: string;
  pos?: Vec3Tuple;
  deposited?: number;
  lit?: boolean;
  fuel?: number;
  ever_lit?: boolean;
}

export interface ScenarioShade {
  id?: string;
  pos: Vec3Tuple;
  state?: ShadeStateName;
  state_ticks_left?: number;
  target_lantern_id?: string | null;
}

export type ScenarioMote =
  | Vec3Tuple
  | { id?: string; pos: Vec3Tuple; kind?: MoteKind; ttl_s?: number | null };

export interface ScenarioDrifter {
  id?: string;
  pos: Vec3Tuple;
  state?: DrifterStateName;
  stolen?: number;
}

export interface ScenarioCharm {
  id?: string;
  pos: Vec3Tuple;
  available?: boolean;
  respawn_s?: number;
}

export interface ScenarioConfig {
  player?: ScenarioPlayer;
  random_motes?: boolean;
  random_shades?: boolean;
  random_drifters?: boolean;
  wind_enabled?: boolean;
  motes?: ScenarioMote[];
  shades?: ScenarioShade[];
  lanterns?: ScenarioLantern[];
  drifters?: ScenarioDrifter[];
  charms?: ScenarioCharm[];
  time_left_s?: number;
}

export interface WorldState {
  seed: number;
  night: NightId;
  tick: number;
  simTick: number;
  state: GamePhaseState;
  gameOverReason: GameOverReason | null;
  initialTimeLeftS: number;
  timeLeftS: number;
  score: number;
  randomMotes: boolean;
  randomShades: boolean;
  randomDrifters: boolean;
  wind: WindState;
  nightStartEmitted: boolean;
  nextMoteId: number;
  nextShadeId: number;
  nextDrifterId: number;
  player: PlayerState;
  lanterns: LanternState[];
  shades: ShadeEntity[];
  motes: MoteEntity[];
  drifters: DrifterEntity[];
  charms: CharmEntity[];
  prevInput: EffectiveInput;
  rngState: number;
  lastPulseTick: number;
}

export interface SnapshotRecord {
  type: 'snapshot';
  tick: number;
  sim_tick: number;
  night: NightId;
  state: GamePhaseState;
  time_left_s: number;
  score: number;
  wind: {
    active: boolean;
    dir_deg: number;
  };
  player: {
    pos: Vec3Tuple;
    vel: Vec3Tuple;
    grounded: boolean;
    flames: number;
    carried: number;
    capacity: number;
    invuln: boolean;
    dash_cd_s: number;
    pulse_cd_s: number;
    charm_s: number;
  };
  lanterns: Array<{
    id: string;
    pos: Vec3Tuple;
    lit: boolean;
    deposited: number;
    fuel: number;
    ever_lit: boolean;
    relit_count: number;
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
    kind: MoteKind;
    ttl_s: number | null;
  }>;
  drifters: Array<{
    id: string;
    pos: Vec3Tuple;
    state: DrifterStateName;
    stolen: number;
  }>;
  charms: Array<{
    id: string;
    available: boolean;
    respawn_s: number;
  }>;
}

export type EventName =
  | 'night_start'
  | 'mote_picked'
  | 'deposit'
  | 'lantern_lit'
  | 'refuel'
  | 'lantern_out'
  | 'fuel_drain'
  | 'pulse'
  | 'dash'
  | 'charm_picked'
  | 'drifter_steal'
  | 'drifter_drop'
  | 'player_hit'
  | 'shade_spawned'
  | 'paused'
  | 'resumed'
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
