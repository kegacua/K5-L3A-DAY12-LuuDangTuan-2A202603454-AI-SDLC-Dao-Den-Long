import type { CharmEntity, LanternState, NightId, Vec3Tuple } from './types.js';

export interface JumpPadDef {
  pos: Vec3Tuple;
  radius: number;
  velY: number;
  velHoriz: number;
  dirXZ: [number, number];
}

export interface NightMapDef {
  night: NightId;
  name: string;
  introQuote: string;
  spawnPos: Vec3Tuple;
  lanterns: ReadonlyArray<Readonly<LanternState>>;
  moteSpawnPoints: ReadonlyArray<Vec3Tuple>;
  shadeSpawnPoints: ReadonlyArray<Vec3Tuple>;
  shadeSpawnIntervalTicks: number;
  shadeMaxActive: number;
  jumpPads: ReadonlyArray<JumpPadDef>;
  charms: ReadonlyArray<Readonly<CharmEntity>>;
  hasDrifters: boolean;
  hasWind: boolean;
}

function round3(v: number): number {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? 0 : r;
}

function polarPoint(cx: number, cz: number, radius: number, deg: number, y = 0): Vec3Tuple {
  const rad = (deg * Math.PI) / 180;
  return [round3(cx + Math.cos(rad) * radius), y, round3(cz + Math.sin(rad) * radius)];
}

function normalize2D(dx: number, dz: number): [number, number] {
  const len = Math.hypot(dx, dz);
  return len > 1e-9 ? [dx / len, dz / len] : [0, 1];
}

// --- Night 1: Đảo Bến ---
const night1MotePoints: Vec3Tuple[] = [];
for (let i = 0; i < 8; i += 1) {
  night1MotePoints.push(polarPoint(0, 0, 12, i * 45, 0));
}
for (let i = 0; i < 16; i += 1) {
  night1MotePoints.push(polarPoint(0, 0, 33, i * 22.5, 0));
}

const night1ShadePoints: Vec3Tuple[] = [];
for (let i = 0; i < 12; i += 1) {
  night1ShadePoints.push(polarPoint(0, 0, 37, 15 + i * 30, 1.0));
}

// --- Night 2: Đảo Cau ---
const night2MotePoints: Vec3Tuple[] = [];
for (const cx of [0, 70]) {
  for (let i = 0; i < 4; i += 1) {
    night2MotePoints.push(polarPoint(cx, 0, 10, i * 90, 0));
  }
  for (let i = 0; i < 8; i += 1) {
    night2MotePoints.push(polarPoint(cx, 0, 22, i * 45, 0));
  }
}

const night2ShadePoints: Vec3Tuple[] = [];
for (const cx of [0, 70]) {
  for (let i = 0; i < 8; i += 1) {
    night2ShadePoints.push(polarPoint(cx, 0, 26, 22.5 + i * 45, 1.0));
  }
}

// --- Night 3: Đảo Chuông ---
const night3MotePoints: Vec3Tuple[] = [];
for (let i = 0; i < 18; i += 1) {
  night3MotePoints.push(polarPoint(0, 0, 34, i * 20, 0));
}
for (let deg = 20; deg <= 160; deg += 20) {
  night3MotePoints.push(polarPoint(0, 0, 18, deg, 3));
}
for (const deg of [45, 135, 225, 315]) {
  night3MotePoints.push(polarPoint(0, 0, 5, deg, 6));
}

const night3ShadePoints: Vec3Tuple[] = [];
for (let i = 0; i < 16; i += 1) {
  night3ShadePoints.push(polarPoint(0, 0, 43, i * 22.5, 1.0));
}

export const NIGHT_MAPS: Record<NightId, NightMapDef> = {
  1: {
    night: 1,
    name: 'Đêm 1 · Đảo Bến',
    introQuote:
      'Ông Đăng: "Sương đen đã nuốt trọn Đảo Bến. Mây à, hãy gom đom đóm thắp sáng 5 Đèn Lồng Lớn trước khi bình minh tới!"',
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 25], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L2', pos: [23.8, 0, 7.7], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L3', pos: [14.7, 0, -20.2], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L4', pos: [-14.7, 0, -20.2], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L5', pos: [-23.8, 0, 7.7], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
    ],
    moteSpawnPoints: night1MotePoints,
    shadeSpawnPoints: night1ShadePoints,
    shadeSpawnIntervalTicks: 480, // 8s
    shadeMaxActive: 6,
    jumpPads: [],
    charms: [],
    hasDrifters: false,
    hasWind: false,
  },
  2: {
    night: 2,
    name: 'Đêm 2 · Đảo Cau',
    introQuote:
      'Ông Đăng: "Đảo Cau có cây cầu tre mảnh và những bục nhảy gió. Coi chừng Gió Lạc cướp đom đóm, hãy tìm Bùa Gió giữa cầu!"',
    spawnPos: [0, 0, 0],
    lanterns: [
      { id: 'L1', pos: [0, 0, 20], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L2', pos: [17, 0, -10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L3', pos: [-17, 0, -10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L4', pos: [70, 0, 20], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L5', pos: [87, 0, -10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L6', pos: [53, 0, -10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
    ],
    moteSpawnPoints: night2MotePoints,
    shadeSpawnPoints: night2ShadePoints,
    shadeSpawnIntervalTicks: 420, // 7s
    shadeMaxActive: 8,
    jumpPads: [
      {
        pos: [20, 0, 18],
        radius: 1.0,
        velY: 14.0,
        velHoriz: 24.0,
        dirXZ: normalize2D(70 - 20, 0 - 18),
      },
      {
        pos: [50, 0, -18],
        radius: 1.0,
        velY: 14.0,
        velHoriz: 24.0,
        dirXZ: normalize2D(0 - 50, 0 - -18),
      },
    ],
    charms: [{ id: 'C1', pos: [35, 0, 0], available: true, respawnTicks: 0 }],
    hasDrifters: true,
    hasWind: false,
  },
  3: {
    night: 3,
    name: 'Đêm 3 · Đảo Chuông',
    introQuote:
      'Ông Đăng: "Đêm cuối trên Đảo Chuông ba tầng! Gió lớn sẽ nổi lên từng cơn — hãy dùng dốc gỗ và bục nhảy để thắp cả 7 Đèn Lồng Lớn!"',
    spawnPos: [0, 0, -10],
    lanterns: [
      { id: 'L1', pos: [0, 6, 6], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L2', pos: [18, 3, 10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L3', pos: [-18, 3, 10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L4', pos: [35, 0, -10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L5', pos: [-35, 0, -10], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L6', pos: [20, 0, -35], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
      { id: 'L7', pos: [-20, 0, -35], lit: false, deposited: 0, fuelSixtieths: 0, everLit: false, relitCount: 0 },
    ],
    moteSpawnPoints: night3MotePoints,
    shadeSpawnPoints: night3ShadePoints,
    shadeSpawnIntervalTicks: 360, // 6s
    shadeMaxActive: 10,
    jumpPads: [
      {
        pos: [0, 3, 13],
        radius: 1.0,
        velY: 12.0,
        velHoriz: 8.0,
        dirXZ: [0, -1],
      },
    ],
    charms: [
      { id: 'C1', pos: [30, 0, 25], available: true, respawnTicks: 0 },
      { id: 'C2', pos: [-30, 0, 25], available: true, respawnTicks: 0 },
    ],
    hasDrifters: true,
    hasWind: true,
  },
};

const RAMP_ANGLES_RAD = [(30 * Math.PI) / 180, (150 * Math.PI) / 180];
const RAMP_HALF_WIDTH = 1.5;
const RAMP_INNER_R = 24;
const RAMP_OUTER_R = 30;
export const NIGHT3_BELL_TOWER_RADIUS = 2.0;

function sampleNight3RampHeight(x: number, z: number): number | null {
  for (const rad of RAMP_ANGLES_RAD) {
    const ux = Math.cos(rad);
    const uz = Math.sin(rad);
    const along = x * ux + z * uz;
    if (along >= RAMP_INNER_R - 0.05 && along <= RAMP_OUTER_R + 0.05) {
      const perp = Math.abs(-x * uz + z * ux);
      if (perp <= RAMP_HALF_WIDTH) {
        const clampedAlong = Math.min(RAMP_OUTER_R, Math.max(RAMP_INNER_R, along));
        return ((RAMP_OUTER_R - clampedAlong) / (RAMP_OUTER_R - RAMP_INNER_R)) * 3.0;
      }
    }
  }
  return null;
}

/**
 * Returns solid obstacle blocker status (Night 3 Bell Tower cylinder r <= 2 at center).
 */
export function isInsideBellTower(night: NightId, x: number, z: number): boolean {
  return night === 3 && Math.hypot(x, z) < NIGHT3_BELL_TOWER_RADIUS;
}

/**
 * Returns the exact terrain ground height Y at horizontal coordinates (x, z),
 * or `null` if over the cloud sea void.
 */
export function getGroundHeight(night: NightId, x: number, z: number): number | null {
  if (night === 1) {
    return Math.hypot(x, z) <= 40 ? 0 : null;
  }

  if (night === 2) {
    const onIslandA = Math.hypot(x, z) <= 28;
    const onIslandB = Math.hypot(x - 70, z) <= 28;
    const onBridge = x >= 26 && x <= 44 && z >= -2 && z <= 2;
    return onIslandA || onIslandB || onBridge ? 0 : null;
  }

  // Night 3: Đảo Chuông
  const r = Math.hypot(x, z);
  if (r > 45) return null;

  // Tier 2: center disk radius 8m at Y = 6 (Bell tower at r <= 2 is blocked separately)
  if (r <= 8) return 6;

  // Tier 1: annulus radius 12..24m in half z > 0 at Y = 3
  if (r >= 12 && r <= 24 && z > 0) return 3;

  // Ramps connecting r = 30 (Y=0) to r = 24 (Y=3) along 30° and 150°
  const rampY = sampleNight3RampHeight(x, z);
  if (rampY !== null) return rampY;

  // Tier 0: whole island at Y = 0
  return 0;
}
