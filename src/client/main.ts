import * as THREE from 'three';
import {
  DEFAULT_TUNING,
  FIXED_DT,
  FUEL_UNITS_PER_POINT,
  getPlayerCapacity,
  TICK_RATE,
} from '../core/config.js';
import {
  addLeaderboardEntry,
  isValidLeaderboardName,
  normalizeLeaderboardFile,
  type LeaderboardEntry,
} from '../core/leaderboard.js';
import { NIGHT_MAPS } from '../core/maps.js';
import {
  createBenchWorld,
  createWorld,
  distXZ,
  hasActiveSafeZone,
  stepBenchWorld,
  stepWorld,
} from '../core/simulation.js';
import type { EffectiveInput, EventRecord, NightId, Vec3Tuple, WorldState } from '../core/types.js';
import { FairyAudio } from './audio.js';

const searchParams = new URLSearchParams(window.location.search);
const isBenchMode = searchParams.get('bench') === '1';
const benchSeed = Number(searchParams.get('seed') ?? '42') || 42;
const benchDurationS = Math.max(1, Number(searchParams.get('duration') ?? '30') || 30);

if (isBenchMode) {
  window.addEventListener('error', (ev) => {
    void fetch('/__bench_err', { method: 'POST', body: String(ev.message || ev.error) }).catch(() => undefined);
  });
}

const PALETTE = {
  sky: 0x0e1430,
  fog: 0x1b2350,
  grass: 0x2f5d50,
  sand: 0xc9b48a,
  wood: 0x6b4a2f,
  cloudSea: 0x12384a,
  lanternLit: 0xffb347,
  lanternCore: 0xffe9b0,
  lanternUnlit: 0x5b5f6e,
  moteCore: 0xfff6c2,
  moteHalo: 0xffe58a,
  shadeBody: 0x120a1a,
  shadeRim: 0x7a3cff,
  shadeRimColorblind: 0x00b3ff,
  shadeStunned: 0x3a3450,
  mayCloak: 0xe8e2d0,
  mayScarf: 0xc8102e,
  gold: 0xf2c14e,
  drifter: 0x8fa3b8,
  danger: 0xff5a5f,
  dangerColorblind: 0xffffff,
  uiText: 0xf5f1e6,
};

const SETTINGS_KEY = 'dao-den-long-settings-v4';
const LEADERBOARD_LOCAL_KEY = 'dao-den-long-leaderboard-v1';

type ActionKey = 'up' | 'down' | 'left' | 'right' | 'jump' | 'dash' | 'interact' | 'pulse' | 'pause';

const ACTION_LABELS: Record<ActionKey, string> = {
  up: 'Đi tới',
  down: 'Đi lùi',
  left: 'Sang trái',
  right: 'Sang phải',
  jump: 'Nhảy',
  dash: 'Lướt',
  interact: 'Tương tác / Châm dầu',
  pulse: 'Tỏa Sáng',
  pause: 'Tạm dừng',
};

const DEFAULT_KEYBINDS: Record<ActionKey, string> = {
  up: 'KeyW',
  down: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  jump: 'Space',
  dash: 'ShiftLeft',
  interact: 'KeyE',
  pulse: 'KeyF',
  pause: 'Escape',
};

interface SavedSettings {
  volume: number;
  sensitivity: number;
  colorblind: boolean;
  reduceMotion: boolean;
  largeText: boolean;
  keybinds: Record<ActionKey, string>;
}

function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'Shift';
  if (code === 'Escape') return 'Esc';
  if (code === 'Space') return 'Space';
  return code;
}

function formatLocalIsoWithTz(date: Date): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const tzOffsetMin = -date.getTimezoneOffset();
  const sign = tzOffsetMin >= 0 ? '+' : '-';
  const hh = pad(tzOffsetMin / 60);
  const mm = pad(tzOffsetMin % 60);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${sign}${hh}:${mm}`;
}

function loadSettings(): SavedSettings {
  const defaults: SavedSettings = {
    volume: 65,
    sensitivity: 100,
    colorblind: false,
    reduceMotion: false,
    largeText: false,
    keybinds: { ...DEFAULT_KEYBINDS },
  };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<SavedSettings>;
      return {
        volume: typeof p.volume === 'number' ? Math.max(0, Math.min(100, p.volume)) : defaults.volume,
        sensitivity:
          typeof p.sensitivity === 'number'
            ? Math.max(30, Math.min(250, p.sensitivity))
            : defaults.sensitivity,
        colorblind: Boolean(p.colorblind),
        reduceMotion: Boolean(p.reduceMotion),
        largeText: Boolean(p.largeText),
        keybinds: { ...DEFAULT_KEYBINDS, ...(p.keybinds ?? {}) },
      };
    }
  } catch {
    // ignore
  }
  return defaults;
}

function saveSettings(s: SavedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
  void fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  }).catch(() => undefined);
}

async function loadLeaderboardEntries(): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard');
    if (res.ok) {
      const data = normalizeLeaderboardFile(await res.json());
      localStorage.setItem(LEADERBOARD_LOCAL_KEY, JSON.stringify(data));
      return data.entries;
    }
  } catch {
    // static server fallback
  }
  try {
    const raw = localStorage.getItem(LEADERBOARD_LOCAL_KEY);
    if (raw) return normalizeLeaderboardFile(JSON.parse(raw)).entries;
  } catch {
    // ignore
  }
  return [];
}

async function submitLeaderboardEntry(entry: LeaderboardEntry): Promise<LeaderboardEntry[]> {
  try {
    const res = await fetch('/api/leaderboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (res.ok) {
      const data = normalizeLeaderboardFile(await res.json());
      localStorage.setItem(LEADERBOARD_LOCAL_KEY, JSON.stringify(data));
      return data.entries;
    }
  } catch {
    // fallback localStorage when opened via static preview without API
  }
  const current = await loadLeaderboardEntries();
  const updated = addLeaderboardEntry(current, entry);
  localStorage.setItem(LEADERBOARD_LOCAL_KEY, JSON.stringify({ entries: updated }));
  return updated;
}

// --- DOM Handles ---
const container = document.getElementById('app')!;
const hudEl = document.getElementById('hud')!;
const nightLabelEl = document.getElementById('night-label')!;
const flamesValEl = document.getElementById('flames-val')!;
const charmBadgeEl = document.getElementById('charm-badge')!;
const timerValEl = document.getElementById('timer-val')!;
const windBannerEl = document.getElementById('wind-banner')!;
const lanternsValEl = document.getElementById('lanterns-val')!;
const scoreValEl = document.getElementById('score-val')!;
const fpsValEl = document.getElementById('fps-val')!;
const subtitleBannerEl = document.getElementById('subtitle-banner')!;
const moteBarLabelEl = document.getElementById('mote-bar-label')!;
const moteSlotsEl = document.getElementById('mote-slots')!;
const dashBoxEl = document.getElementById('dash-box')!;
const dashKeyLabelEl = document.getElementById('dash-key-label')!;
const dashStatusEl = document.getElementById('dash-status')!;
const pulseBoxEl = document.getElementById('pulse-box')!;
const pulseKeyLabelEl = document.getElementById('pulse-key-label')!;
const pulseStatusEl = document.getElementById('pulse-status')!;
const actionHintEl = document.getElementById('action-hint')!;
const lanternArrowEl = document.getElementById('lantern-arrow')!;
const shadeArrowEl = document.getElementById('shade-arrow')!;
const controlsSummaryEl = document.getElementById('controls-summary')!;

const menuModal = document.getElementById('menu-modal')!;
const introModal = document.getElementById('intro-modal')!;
const introTitleEl = document.getElementById('intro-title')!;
const introQuoteEl = document.getElementById('intro-quote')!;
const pauseModal = document.getElementById('pause-modal')!;
const settingsModal = document.getElementById('settings-modal')!;
const leaderboardModal = document.getElementById('leaderboard-modal')!;
const lbTbodyEl = document.getElementById('lb-tbody')!;
const resultModal = document.getElementById('result-modal')!;
const resultCardEl = document.getElementById('result-card')!;
const resultTitleEl = document.getElementById('result-title')!;
const resultDescEl = document.getElementById('result-desc')!;
const resultStatsEl = document.getElementById('result-stats')!;
const btnResultPrimary = document.getElementById('btn-result-primary') as HTMLButtonElement;

const lbSubmitAreaEl = document.getElementById('lb-submit-area')!;
const lbNameInputEl = document.getElementById('lb-name-input') as HTMLInputElement;
const btnLbSaveEl = document.getElementById('btn-lb-save') as HTMLButtonElement;
const lbSaveMsgEl = document.getElementById('lb-save-msg')!;

const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const volumeValEl = document.getElementById('volume-val')!;
const sensSlider = document.getElementById('sens-slider') as HTMLInputElement;
const sensValEl = document.getElementById('sens-val')!;
const colorblindToggle = document.getElementById('colorblind-toggle') as HTMLInputElement;
const reduceMotionToggle = document.getElementById('reduce-motion-toggle') as HTMLInputElement;
const largeTextToggle = document.getElementById('large-text-toggle') as HTMLInputElement;
const keybindGridEl = document.getElementById('keybind-grid')!;
const keybindWarningEl = document.getElementById('keybind-warning')!;

const moteSlotEls: HTMLDivElement[] = [];
function ensureSlotCount(capacity: number): void {
  while (moteSlotEls.length < capacity) {
    const slot = document.createElement('div');
    slot.className = 'mote-slot';
    moteSlotsEl.appendChild(slot);
    moteSlotEls.push(slot);
  }
  for (let i = 0; i < moteSlotEls.length; i += 1) {
    moteSlotEls[i]!.style.display = i < capacity ? 'block' : 'none';
  }
}
ensureSlotCount(DEFAULT_TUNING.carry_capacity);

const settings = loadSettings();
const audio = new FairyAudio();

let listeningAction: ActionKey | null = null;
const keybindBtns = new Map<ActionKey, HTMLButtonElement>();

function refreshKeybindUI(): void {
  const counts = new Map<string, number>();
  for (const code of Object.values(settings.keybinds)) {
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const conflicts = new Set<string>();
  for (const [code, cnt] of counts.entries()) {
    if (cnt > 1) conflicts.add(code);
  }

  for (const [action, btn] of keybindBtns.entries()) {
    const code = settings.keybinds[action];
    btn.textContent = listeningAction === action ? 'Nhấn phím...' : formatKeyCode(code);
    btn.classList.toggle('listening', listeningAction === action);
    btn.classList.toggle('conflict', conflicts.has(code));
  }

  keybindWarningEl.textContent =
    conflicts.size > 0
      ? `⚠ Trùng phím: ${[...conflicts].map(formatKeyCode).join(', ')} — hãy đổi phím khác!`
      : '';

  dashKeyLabelEl.textContent = `[${formatKeyCode(settings.keybinds.dash)}]`;
  pulseKeyLabelEl.textContent = `[${formatKeyCode(settings.keybinds.pulse)}]`;
  controlsSummaryEl.textContent =
    `${formatKeyCode(settings.keybinds.up)}${formatKeyCode(settings.keybinds.left)}${formatKeyCode(
      settings.keybinds.down,
    )}${formatKeyCode(settings.keybinds.right)} Chạy · ${formatKeyCode(
      settings.keybinds.jump,
    )} Nhảy · ${formatKeyCode(settings.keybinds.dash)} Lướt · ${formatKeyCode(
      settings.keybinds.interact,
    )} Nạp/Châm · ${formatKeyCode(settings.keybinds.pulse)} Tỏa Sáng · ${formatKeyCode(
      settings.keybinds.pause,
    )} Tạm dừng`;
}

for (const action of Object.keys(ACTION_LABELS) as ActionKey[]) {
  const lbl = document.createElement('span');
  lbl.textContent = ACTION_LABELS[action];
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'keybind-btn';
  btn.addEventListener('click', () => {
    listeningAction = action;
    refreshKeybindUI();
  });
  keybindGridEl.appendChild(lbl);
  keybindGridEl.appendChild(btn);
  keybindBtns.set(action, btn);
}

// --- Three.js Scene & Instanced Renderers (Zero per-frame allocation) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.FogExp2(PALETTE.fog, 0.015);

const camera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.1, 300);

const renderer = new THREE.WebGLRenderer({ antialias: !isBenchMode, powerPreference: 'high-performance' });
renderer.setPixelRatio(isBenchMode ? 1 : Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xd8e0ff, 0.15);
scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(0xaec4ff, 0.72);
moonLight.position.set(-25, 50, -20);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(512, 512);
const dCam = 65;
moonLight.shadow.camera.left = -dCam;
moonLight.shadow.camera.right = dCam;
moonLight.shadow.camera.top = dCam;
moonLight.shadow.camera.bottom = -dCam;
scene.add(moonLight);

const cloudSea = new THREE.Mesh(
  new THREE.CircleGeometry(220, 32),
  new THREE.MeshBasicMaterial({ color: PALETTE.cloudSea }),
);
cloudSea.rotation.x = -Math.PI / 2;
cloudSea.position.y = -11;
scene.add(cloudSea);

const starPos: number[] = [];
for (let i = 0; i < 360; i += 1) {
  const u = ((i * 73) % 360) * (Math.PI / 180);
  const v = 0.18 + (((i * 37) % 100) / 100) * 1.2;
  starPos.push(Math.cos(u) * Math.cos(v) * 165, Math.sin(v) * 165 + 12, Math.sin(u) * Math.cos(v) * 165);
}
const starGeo = new THREE.BufferGeometry();
starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
scene.add(
  new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: PALETTE.moteCore, size: 0.9, transparent: true, opacity: 0.8 }),
  ),
);

const windLeaves = new THREE.Group();
const leafGeo = new THREE.PlaneGeometry(0.35, 0.18);
const leafMat = new THREE.MeshBasicMaterial({ color: PALETTE.gold, side: THREE.DoubleSide });
for (let i = 0; i < 32; i += 1) {
  const leaf = new THREE.Mesh(leafGeo, leafMat);
  leaf.position.set(((i * 19) % 40) - 20, 1 + (i % 6) * 1.1, ((i * 29) % 40) - 20);
  windLeaves.add(leaf);
}
windLeaves.visible = false;
scene.add(windLeaves);

// Instanced Motes (up to 300 in 2 draw calls!)
const MAX_MOTE_INSTANCES = 300;
const moteCoreInst = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.24, 10, 8),
  new THREE.MeshBasicMaterial({ color: PALETTE.moteCore }),
  MAX_MOTE_INSTANCES,
);
const moteHaloInst = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.42, 8, 8),
  new THREE.MeshBasicMaterial({ color: PALETTE.moteHalo, transparent: true, opacity: 0.35 }),
  MAX_MOTE_INSTANCES,
);
moteCoreInst.frustumCulled = false;
moteHaloInst.frustumCulled = false;
moteCoreInst.count = 0;
moteHaloInst.count = 0;
scene.add(moteCoreInst, moteHaloInst);

// Instanced Shades (up to 250 in 3 draw calls!)
const MAX_SHADE_INSTANCES = 250;
const shadeBodyMat = new THREE.MeshLambertMaterial({
  color: PALETTE.shadeBody,
  emissive: PALETTE.shadeRim,
  emissiveIntensity: 0.55,
});
const shadeBodyInst = new THREE.InstancedMesh(
  new THREE.SphereGeometry(0.68, 8, 6),
  shadeBodyMat,
  MAX_SHADE_INSTANCES,
);
const shadeEyeMat = new THREE.MeshBasicMaterial({ color: PALETTE.shadeRim });
const shadeEyeInst = new THREE.InstancedMesh(
  new THREE.BoxGeometry(0.54, 0.18, 0.18),
  shadeEyeMat,
  MAX_SHADE_INSTANCES,
);
const shadeHaloInst = new THREE.InstancedMesh(
  new THREE.TorusGeometry(0.55, 0.06, 6, 16),
  new THREE.MeshBasicMaterial({ color: PALETTE.gold }),
  MAX_SHADE_INSTANCES,
);
shadeBodyInst.frustumCulled = false;
shadeEyeInst.frustumCulled = false;
shadeHaloInst.frustumCulled = false;
shadeBodyInst.count = 0;
shadeEyeInst.count = 0;
shadeHaloInst.count = 0;
scene.add(shadeBodyInst, shadeEyeInst, shadeHaloInst);

// Pre-allocated scratch math objects (0 per-frame heap allocations)
const _dummy = new THREE.Object3D();
const _camTarget = new THREE.Vector3();
const _projVec = new THREE.Vector3();

function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material.dispose();
      }
    }
  });
}

function buildNightEnvironment(night: NightId): THREE.Group {
  const group = new THREE.Group();
  const grassMat = new THREE.MeshLambertMaterial({ color: PALETTE.grass });
  const sandMat = new THREE.MeshLambertMaterial({ color: PALETTE.sand });
  const woodMat = new THREE.MeshLambertMaterial({ color: PALETTE.wood });
  const padMat = new THREE.MeshLambertMaterial({
    color: PALETTE.gold,
    emissive: PALETTE.lanternLit,
    emissiveIntensity: 0.9,
  });

  if (night === 1) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(40, 41.5, 3, 56), grassMat);
    disc.position.y = -1.5;
    disc.receiveShadow = true;
    group.add(disc);

    const sandPlaza = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 6.8, 0.12, 24), sandMat);
    sandPlaza.position.y = 0.02;
    sandPlaza.receiveShadow = true;
    group.add(sandPlaza);

    const pier = new THREE.Mesh(new THREE.BoxGeometry(5, 0.35, 9), woodMat);
    pier.position.set(0, 0.12, 36.5);
    group.add(pier);
  } else if (night === 2) {
    for (const cx of [0, 70]) {
      const isl = new THREE.Mesh(new THREE.CylinderGeometry(28, 29, 3, 48), grassMat);
      isl.position.set(cx, -1.5, 0);
      isl.receiveShadow = true;
      group.add(isl);

      const centerSand = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.2, 0.12, 20), sandMat);
      centerSand.position.set(cx, 0.02, 0);
      group.add(centerSand);
    }

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 4), woodMat);
    bridge.position.set(35, -0.15, 0);
    bridge.receiveShadow = true;
    group.add(bridge);
  } else {
    const tier0 = new THREE.Mesh(new THREE.CylinderGeometry(45, 46.5, 3, 64), grassMat);
    tier0.position.y = -1.5;
    tier0.receiveShadow = true;
    group.add(tier0);

    const tier1Shape = new THREE.Shape();
    tier1Shape.absarc(0, 0, 24, 0, Math.PI, false);
    tier1Shape.absarc(0, 0, 12, Math.PI, 0, true);
    const tier1Geo = new THREE.ExtrudeGeometry(tier1Shape, { depth: 3, bevelEnabled: false });
    tier1Geo.rotateX(Math.PI / 2);
    const tier1 = new THREE.Mesh(tier1Geo, sandMat);
    tier1.position.y = 3;
    tier1.receiveShadow = true;
    group.add(tier1);

    const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(8, 8.2, 6, 32), sandMat);
    tier2.position.y = 3;
    tier2.receiveShadow = true;
    group.add(tier2);

    const rampLen = Math.hypot(6, 3);
    const rampPitch = Math.atan2(3, 6);
    for (const deg of [30, 150]) {
      const rad = (deg * Math.PI) / 180;
      const rampHolder = new THREE.Group();
      const midR = 27;
      rampHolder.position.set(Math.cos(rad) * midR, 1.5, Math.sin(rad) * midR);
      rampHolder.rotation.y = -rad;
      const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.25, 3), woodMat);
      rampMesh.rotation.z = -rampPitch;
      rampMesh.receiveShadow = true;
      rampHolder.add(rampMesh);
      group.add(rampHolder);
    }

    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 8, 20), woodMat);
    tower.position.set(0, 10, 0);
    tower.castShadow = true;
    group.add(tower);

    const bellRoof = new THREE.Mesh(
      new THREE.ConeGeometry(3.0, 2.4, 8),
      new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.7 }),
    );
    bellRoof.position.set(0, 15.1, 0);
    group.add(bellRoof);
  }

  for (const pad of NIGHT_MAPS[night].jumpPads) {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(pad.radius, pad.radius * 1.15, 0.22, 20), padMat);
    disc.position.set(pad.pos[0], pad.pos[1] + 0.11, pad.pos[2]);
    group.add(disc);
  }

  return group;
}

interface PlayerRig {
  root: THREE.Group;
  body: THREE.Group;
  miniLanternLight: THREE.PointLight;
  pulseRing: THREE.Mesh;
}

function buildPlayerRig(): PlayerRig {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.46, 1.15, 12),
    new THREE.MeshLambertMaterial({ color: PALETTE.mayCloak }),
  );
  cloak.position.y = 0.58;
  cloak.castShadow = true;
  body.add(cloak);

  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.08, 8, 16),
    new THREE.MeshLambertMaterial({ color: PALETTE.mayScarf }),
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.12;
  body.add(scarf);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 12, 10),
    new THREE.MeshLambertMaterial({ color: 0xf4d4b6 }),
  );
  head.position.y = 1.34;
  body.add(head);

  const nonLa = new THREE.Mesh(
    new THREE.ConeGeometry(0.74, 0.4, 20),
    new THREE.MeshLambertMaterial({ color: PALETTE.sand }),
  );
  nonLa.position.y = 1.62;
  body.add(nonLa);

  const miniLantern = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshLambertMaterial({
      color: PALETTE.lanternCore,
      emissive: PALETTE.lanternLit,
      emissiveIntensity: 1.6,
    }),
  );
  miniLantern.position.set(0, 1.2, 0.66);
  body.add(miniLantern);

  const miniLanternLight = new THREE.PointLight(PALETTE.lanternLit, 9, 13, 1.6);
  miniLanternLight.position.set(0, 1.3, 0.7);
  body.add(miniLanternLight);

  const pulseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.75, 1.0, 36),
    new THREE.MeshBasicMaterial({
      color: PALETTE.gold,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    }),
  );
  pulseRing.rotation.x = -Math.PI / 2;
  pulseRing.position.y = 0.2;
  pulseRing.visible = false;
  root.add(pulseRing);

  return { root, body, miniLanternLight, pulseRing };
}

interface LanternVis {
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshLambertMaterial;
  tearMarks: THREE.Group;
  light: THREE.PointLight;
  safeRing: THREE.Mesh;
  fuelBarGroup: THREE.Group;
  fuelFill: THREE.Mesh;
  fuelFillMat: THREE.MeshBasicMaterial;
}

function createLanternVis(pos: [number, number, number]): LanternVis {
  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.95, 1.15, 0.4, 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.wood }),
  );
  base.position.y = 0.2;
  group.add(base);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 2.6, 8),
    new THREE.MeshLambertMaterial({ color: PALETTE.wood }),
  );
  post.position.y = 1.5;
  group.add(post);

  const coreMat = new THREE.MeshLambertMaterial({
    color: PALETTE.lanternUnlit,
    emissive: PALETTE.lanternUnlit,
    emissiveIntensity: 0.2,
  });
  const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), coreMat);
  coreMesh.position.y = 3.1;
  group.add(coreMesh);

  const tearMarks = new THREE.Group();
  tearMarks.position.y = 3.1;
  const tearMat = new THREE.MeshBasicMaterial({ color: 0x120a1a, side: THREE.DoubleSide });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    const slash = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.1), tearMat);
    slash.position.set(Math.cos(a) * 0.56, 0, Math.sin(a) * 0.56);
    slash.rotation.y = -a + Math.PI / 2;
    slash.rotation.z = 0.45;
    tearMarks.add(slash);
  }
  group.add(tearMarks);

  const light = new THREE.PointLight(PALETTE.lanternLit, 0, 24, 1.45);
  light.position.y = 3.1;
  group.add(light);

  const safeRing = new THREE.Mesh(
    new THREE.RingGeometry(DEFAULT_TUNING.safe_radius - 0.14, DEFAULT_TUNING.safe_radius, 40),
    new THREE.MeshBasicMaterial({
      color: PALETTE.lanternLit,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.36,
    }),
  );
  safeRing.rotation.x = -Math.PI / 2;
  safeRing.position.y = 0.08;
  safeRing.visible = false;
  group.add(safeRing);

  const fuelBarGroup = new THREE.Group();
  fuelBarGroup.position.y = 4.45;
  const fuelBg = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 0.26),
    new THREE.MeshBasicMaterial({ color: 0x0e1430, side: THREE.DoubleSide }),
  );
  const fuelFillMat = new THREE.MeshBasicMaterial({
    color: PALETTE.lanternLit,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
  });
  const fuelFill = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.18), fuelFillMat);
  fuelFill.position.z = 0.01;
  fuelBarGroup.add(fuelBg, fuelFill);
  fuelBarGroup.visible = false;
  group.add(fuelBarGroup);

  return { group, coreMesh, coreMat, tearMarks, light, safeRing, fuelBarGroup, fuelFill, fuelFillMat };
}

function createDrifterVis(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    color: PALETTE.drifter,
    emissive: PALETTE.drifter,
    emissiveIntensity: 0.4,
    transparent: true,
    opacity: 0.86,
    side: THREE.DoubleSide,
  });
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.18, 2.2), mat));
  return g;
}

function createCharmVis(): THREE.Group {
  const g = new THREE.Group();
  const card = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.85, 0.08),
    new THREE.MeshStandardMaterial({
      color: PALETTE.mayScarf,
      emissive: PALETTE.mayScarf,
      emissiveIntensity: 0.45,
    }),
  );
  const border = new THREE.Mesh(
    new THREE.BoxGeometry(0.64, 0.94, 0.04),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold }),
  );
  g.add(border, card);
  return g;
}

// --- App / Campaign / Bench State ---
type UiScreen = 'menu' | 'intro' | 'playing' | 'paused' | 'result' | 'bench';
let uiScreen: UiScreen = isBenchMode ? 'bench' : 'menu';
let settingsReturnScreen: 'menu' | 'paused' = 'menu';
let currentNight: NightId = 1;
let campaignTotalScore = 0;
let nightsWonCount = 0;
let runSeed = 2026;
let scoreSubmittedForRun = false;

let world: WorldState = isBenchMode ? createBenchWorld(benchSeed) : createWorld(runSeed, 1);
let envGroup: THREE.Group = buildNightEnvironment(1);
scene.add(envGroup);

const playerRig = buildPlayerRig();
scene.add(playerRig.root);

const lanternVisMap = new Map<string, LanternVis>();
const drifterVisMap = new Map<string, THREE.Group>();
const charmVisMap = new Map<string, THREE.Group>();

let pulseAnimElapsed = 99;
let camYawDeg = 0;
let isDragging = false;
let lastPointerX = 0;
let lastCountdownSec = -1;
let prevWindWarning = false;
let lastSpawnedShadePos: Vec3Tuple | null = null;
let shadeAlertTimer = 0;

const keys = new Set<string>();
let qJump = false;
let qInteract = false;
let qPulse = false;
let qDash = false;
let qPause = false;

function applyAccessibilitySettings(): void {
  volumeSlider.value = String(settings.volume);
  volumeValEl.textContent = `${settings.volume}%`;
  sensSlider.value = String(settings.sensitivity);
  sensValEl.textContent = `${(settings.sensitivity / 100).toFixed(1)}x`;
  colorblindToggle.checked = settings.colorblind;
  reduceMotionToggle.checked = settings.reduceMotion;
  largeTextToggle.checked = settings.largeText;

  audio.setVolume(settings.volume / 100);
  document.body.classList.toggle('colorblind', settings.colorblind);
  document.body.classList.toggle('reduce-motion', settings.reduceMotion);
  document.body.classList.toggle('large-text', settings.largeText);

  const rimHex = settings.colorblind ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
  shadeBodyMat.emissive.setHex(rimHex);
  shadeEyeMat.color.setHex(rimHex);
  refreshKeybindUI();
}

function clearDynamicVisuals(): void {
  for (const v of lanternVisMap.values()) {
    scene.remove(v.group);
    disposeObject3D(v.group);
  }
  lanternVisMap.clear();

  for (const d of drifterVisMap.values()) {
    scene.remove(d);
    disposeObject3D(d);
  }
  drifterVisMap.clear();

  for (const c of charmVisMap.values()) {
    scene.remove(c);
    disposeObject3D(c);
  }
  charmVisMap.clear();

  moteCoreInst.count = 0;
  moteHaloInst.count = 0;
  shadeBodyInst.count = 0;
  shadeEyeInst.count = 0;
  shadeHaloInst.count = 0;
}

function loadNightWorld(night: NightId, customWorld?: WorldState): void {
  currentNight = night;
  runSeed += 1;
  world = customWorld ?? createWorld(runSeed, night);
  camYawDeg = 0;
  pulseAnimElapsed = 99;
  lastCountdownSec = -1;
  prevWindWarning = false;
  lastSpawnedShadePos = null;
  shadeAlertTimer = 0;
  qJump = qInteract = qPulse = qDash = qPause = false;

  clearDynamicVisuals();
  scene.remove(envGroup);
  disposeObject3D(envGroup);
  envGroup = buildNightEnvironment(night);
  scene.add(envGroup);

  for (const l of world.lanterns) {
    const vis = createLanternVis(l.pos);
    lanternVisMap.set(l.id, vis);
    scene.add(vis.group);
  }
  for (const c of world.charms) {
    const vis = createCharmVis();
    vis.position.set(c.pos[0], c.pos[1] + 1.0, c.pos[2]);
    charmVisMap.set(c.id, vis);
    scene.add(vis);
  }

  nightLabelEl.textContent = NIGHT_MAPS[night].name;
}

function hideAllModals(): void {
  menuModal.classList.remove('visible');
  introModal.classList.remove('visible');
  pauseModal.classList.remove('visible');
  settingsModal.classList.remove('visible');
  leaderboardModal.classList.remove('visible');
  resultModal.classList.remove('visible');
}

function showMenu(): void {
  uiScreen = 'menu';
  hideAllModals();
  hudEl.classList.add('hidden');
  menuModal.classList.add('visible');
}

function showNightIntro(night: NightId): void {
  loadNightWorld(night);
  uiScreen = 'intro';
  hideAllModals();
  hudEl.classList.add('hidden');
  const reqLit = Math.ceil(DEFAULT_TUNING.win_ratio * world.lanterns.length);
  introTitleEl.textContent = NIGHT_MAPS[night].name;
  introQuoteEl.textContent = `${NIGHT_MAPS[night].introQuote} (Giữ ít nhất ${reqLit}/${world.lanterns.length} đèn sáng tới bình minh!)`;
  introModal.classList.add('visible');
}

function beginPlayingNight(): void {
  audio.startNightMusic();
  uiScreen = 'playing';
  hideAllModals();
  hudEl.classList.remove('hidden');
}

function showSettings(from: 'menu' | 'paused'): void {
  settingsReturnScreen = from;
  listeningAction = null;
  refreshKeybindUI();
  hideAllModals();
  settingsModal.classList.add('visible');
}

async function showLeaderboard(): Promise<void> {
  hideAllModals();
  const entries = await loadLeaderboardEntries();
  lbTbodyEl.innerHTML = '';
  if (entries.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'Chưa có kỷ lục nào — hãy hoàn thành một lượt chơi!';
    tr.appendChild(td);
    lbTbodyEl.appendChild(tr);
  } else {
    entries.forEach((e, idx) => {
      const tr = document.createElement('tr');
      for (const val of [String(idx + 1), e.name, String(e.score), `${e.nights_won}/3`, String(e.seed)]) {
        const td = document.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      }
      lbTbodyEl.appendChild(tr);
    });
  }
  leaderboardModal.classList.add('visible');
}

function showNightResult(won: boolean, reason: string): void {
  uiScreen = 'result';
  hideAllModals();
  if (won) {
    campaignTotalScore += world.score;
    nightsWonCount = Math.min(3, nightsWonCount + 1);
  }

  const isFinalDawn = won && currentNight === 3;
  const reqLit = Math.ceil(DEFAULT_TUNING.win_ratio * world.lanterns.length);
  resultCardEl.classList.toggle('lost', !won);

  if (isFinalDawn) {
    resultTitleEl.textContent = 'Bình Minh Trên Ba Hòn Đảo!';
    resultDescEl.textContent =
      'Mây đã giữ vững ánh sáng qua Đảo Bến, Đảo Cau và Đảo Chuông tới tận bình minh!';
    btnResultPrimary.textContent = 'Chơi lại từ Đêm 1';
  } else if (won) {
    resultTitleEl.textContent = `Đón Bình Minh tại ${NIGHT_MAPS[currentNight].name}!`;
    resultDescEl.textContent = 'Hòn đảo đã giữ vững ánh sáng tới bình minh. Chuẩn bị sang đảo tiếp theo!';
    btnResultPrimary.textContent = `Sang Đêm ${currentNight + 1}`;
  } else {
    resultTitleEl.textContent = 'Đêm chưa vượt qua...';
    resultDescEl.textContent =
      reason === 'dawn'
        ? `Khi bình minh tới, cần ít nhất ${reqLit}/${world.lanterns.length} đèn đang sáng.`
        : 'Mây đã mất hết Ngọn Lửa. Hãy dùng Lướt, Tỏa Sáng và vùng an toàn đèn sáng (dầu ≥ 30)!';
    btnResultPrimary.textContent = `Chơi lại Đêm ${currentNight}`;
  }

  // Show leaderboard submission after Dawn (win Night 3) OR after losing ANY Night
  const allowSaveScore = isFinalDawn || !won;
  lbSubmitAreaEl.style.display = allowSaveScore ? 'block' : 'none';
  scoreSubmittedForRun = false;
  btnLbSaveEl.disabled = false;
  lbSaveMsgEl.textContent = '';

  const litCount = world.lanterns.filter((l) => l.lit).length;
  resultStatsEl.innerHTML = `
    <div class="stat-row"><span>Đèn sáng lúc kết thúc</span><span>${litCount} / ${world.lanterns.length} (cần ${reqLit})</span></div>
    <div class="stat-row"><span>Ngọn Lửa còn lại</span><span>${world.player.flames}</span></div>
    <div class="stat-row"><span>Điểm Đêm ${currentNight}</span><span>${world.score}</span></div>
    <div class="stat-row" style="color:#F2C14E;font-weight:800"><span>Tổng điểm (các Đêm đã thắng)</span><span>${campaignTotalScore}</span></div>
  `;
  resultModal.classList.add('visible');
}

// --- Button & Input Wiring ---
document.getElementById('btn-play-campaign')!.addEventListener('click', () => {
  campaignTotalScore = 0;
  nightsWonCount = 0;
  showNightIntro(1);
});

document.querySelectorAll<HTMLButtonElement>('.night-select').forEach((btn) => {
  btn.addEventListener('click', () => {
    campaignTotalScore = 0;
    nightsWonCount = 0;
    const n = Number(btn.dataset.night) as NightId;
    showNightIntro(n);
  });
});

document.getElementById('btn-menu-leaderboard')!.addEventListener('click', () => void showLeaderboard());
document.getElementById('btn-lb-close')!.addEventListener('click', () => showMenu());
document.getElementById('btn-menu-settings')!.addEventListener('click', () => showSettings('menu'));
document.getElementById('btn-start-night')!.addEventListener('click', () => beginPlayingNight());

document.getElementById('btn-resume')!.addEventListener('click', () => {
  if (world.state === 'paused') qPause = true;
  uiScreen = 'playing';
  hideAllModals();
});

document.getElementById('btn-pause-restart')!.addEventListener('click', () => {
  loadNightWorld(currentNight);
  beginPlayingNight();
});

document.getElementById('btn-pause-settings')!.addEventListener('click', () => showSettings('paused'));
document.getElementById('btn-pause-menu')!.addEventListener('click', () => showMenu());

volumeSlider.addEventListener('input', () => {
  settings.volume = Number(volumeSlider.value);
  applyAccessibilitySettings();
});
sensSlider.addEventListener('input', () => {
  settings.sensitivity = Number(sensSlider.value);
  applyAccessibilitySettings();
});
colorblindToggle.addEventListener('change', () => {
  settings.colorblind = colorblindToggle.checked;
  applyAccessibilitySettings();
});
reduceMotionToggle.addEventListener('change', () => {
  settings.reduceMotion = reduceMotionToggle.checked;
  applyAccessibilitySettings();
});
largeTextToggle.addEventListener('change', () => {
  settings.largeText = largeTextToggle.checked;
  applyAccessibilitySettings();
});

document.getElementById('btn-reset-keys')!.addEventListener('click', () => {
  settings.keybinds = { ...DEFAULT_KEYBINDS };
  listeningAction = null;
  applyAccessibilitySettings();
});

document.getElementById('btn-settings-close')!.addEventListener('click', () => {
  listeningAction = null;
  saveSettings(settings);
  applyAccessibilitySettings();
  hideAllModals();
  if (settingsReturnScreen === 'menu') menuModal.classList.add('visible');
  else pauseModal.classList.add('visible');
});

btnLbSaveEl.addEventListener('click', async () => {
  if (scoreSubmittedForRun) return;
  const name = lbNameInputEl.value.trim();
  if (!isValidLeaderboardName(name)) {
    lbSaveMsgEl.textContent = '⚠ Tên phải dài 3–12 ký tự (chữ, số hoặc _).';
    return;
  }
  btnLbSaveEl.disabled = true;
  try {
    await submitLeaderboardEntry({
      name,
      score: campaignTotalScore,
      nights_won: nightsWonCount,
      achieved_at: formatLocalIsoWithTz(new Date()),
      seed: world.seed,
    });
    scoreSubmittedForRun = true;
    lbSaveMsgEl.textContent = 'Đã lưu vào Bảng xếp hạng!';
  } catch (err) {
    btnLbSaveEl.disabled = false;
    lbSaveMsgEl.textContent = `Lỗi lưu điểm: ${err instanceof Error ? err.message : String(err)}`;
  }
});

btnResultPrimary.addEventListener('click', () => {
  if (world.state === 'won') {
    if (currentNight < 3) {
      showNightIntro((currentNight + 1) as NightId);
    } else {
      campaignTotalScore = 0;
      nightsWonCount = 0;
      showNightIntro(1);
    }
  } else {
    loadNightWorld(currentNight);
    beginPlayingNight();
  }
});

document.getElementById('btn-result-menu')!.addEventListener('click', () => showMenu());

function isUnboundAlias(code: string): boolean {
  return !Object.values(settings.keybinds).includes(code);
}

window.addEventListener('keydown', (e) => {
  const code = e.code;

  // Remapping capture mode
  if (listeningAction !== null) {
    e.preventDefault();
    settings.keybinds[listeningAction] = code;
    listeningAction = null;
    applyAccessibilitySettings();
    return;
  }

  // If Settings modal is open, Escape returns to Menu/Pause instead of resuming gameplay
  if (settingsModal.classList.contains('visible')) {
    if (code === 'Escape') {
      document.getElementById('btn-settings-close')!.click();
    }
    return;
  }

  if (document.activeElement === lbNameInputEl) return;

  if (!keys.has(code)) {
    if (uiScreen === 'intro' && (code === 'Space' || code === 'Enter')) {
      beginPlayingNight();
      return;
    }
    if (
      (uiScreen === 'playing' || uiScreen === 'paused') &&
      (code === settings.keybinds.pause || (code === 'KeyP' && isUnboundAlias('KeyP')))
    ) {
      qPause = true;
    }
    if (uiScreen === 'playing') {
      if (code === settings.keybinds.jump) {
        qJump = true;
        if (world.player.grounded) audio.playJump();
      }
      if (code === settings.keybinds.interact) qInteract = true;
      if (code === settings.keybinds.pulse || (code === 'KeyQ' && isUnboundAlias('KeyQ'))) {
        qPulse = true;
      }
      if (
        code === settings.keybinds.dash ||
        (code === 'ShiftRight' && isUnboundAlias('ShiftRight'))
      ) {
        qDash = true;
      }
    }
  }
  keys.add(code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (uiScreen !== 'playing') return;
  isDragging = true;
  lastPointerX = e.clientX;
});
window.addEventListener('pointerup', () => {
  isDragging = false;
});
window.addEventListener('pointermove', (e) => {
  if (!isDragging || uiScreen !== 'playing') return;
  const dx = e.clientX - lastPointerX;
  lastPointerX = e.clientX;
  camYawDeg -= dx * 0.25 * (settings.sensitivity / 100);
});

function buildLiveInput(): EffectiveInput {
  let x = 0;
  let z = 0;
  if (uiScreen === 'playing') {
    if (keys.has(settings.keybinds.up) || (keys.has('ArrowUp') && isUnboundAlias('ArrowUp'))) z -= 1;
    if (keys.has(settings.keybinds.down) || (keys.has('ArrowDown') && isUnboundAlias('ArrowDown'))) z += 1;
    if (keys.has(settings.keybinds.left) || (keys.has('ArrowLeft') && isUnboundAlias('ArrowLeft'))) x -= 1;
    if (keys.has(settings.keybinds.right) || (keys.has('ArrowRight') && isUnboundAlias('ArrowRight'))) x += 1;
  }

  const input: EffectiveInput = {
    move: [x, z],
    cam_yaw_deg: camYawDeg,
    jump: qJump || (uiScreen === 'playing' && keys.has(settings.keybinds.jump)),
    interact: qInteract || (uiScreen === 'playing' && keys.has(settings.keybinds.interact)),
    pulse:
      qPulse ||
      (uiScreen === 'playing' &&
        (keys.has(settings.keybinds.pulse) || (keys.has('KeyQ') && isUnboundAlias('KeyQ')))),
    dash:
      qDash ||
      (uiScreen === 'playing' &&
        (keys.has(settings.keybinds.dash) ||
          (keys.has('ShiftRight') && isUnboundAlias('ShiftRight')))),
    pause: qPause,
  };
  qJump = qInteract = qPulse = qDash = qPause = false;
  return input;
}

function handleEvents(events: EventRecord[]): void {
  for (const ev of events) {
    if (ev.name === 'paused') {
      uiScreen = 'paused';
      pauseModal.classList.add('visible');
    } else if (ev.name === 'resumed') {
      uiScreen = 'playing';
      hideAllModals();
    } else if (ev.name === 'mote_picked') {
      audio.playMotePick(Number(ev.data.carried ?? 1));
    } else if (ev.name === 'deposit') {
      audio.playDeposit();
    } else if (ev.name === 'refuel') {
      audio.playRefuel();
    } else if (ev.name === 'lantern_lit') {
      audio.playLanternLit();
    } else if (ev.name === 'lantern_out') {
      audio.playLanternOut();
    } else if (ev.name === 'pulse') {
      audio.playPulse();
      pulseAnimElapsed = 0;
    } else if (ev.name === 'dash') {
      audio.playDash();
    } else if (ev.name === 'charm_picked') {
      audio.playCharm();
    } else if (ev.name === 'player_hit') {
      audio.playHit();
    } else if (ev.name === 'shade_spawned') {
      audio.playShadeSpawn();
      const s = world.shades.find((sh) => sh.id === ev.data.id);
      if (s) {
        lastSpawnedShadePos = [s.pos[0], s.pos[1], s.pos[2]];
        shadeAlertTimer = 2.6;
      }
    } else if (ev.name === 'drifter_steal') {
      audio.playDrifterSteal();
    } else if (ev.name === 'game_over') {
      const won = ev.data.result === 'won';
      if (won) audio.playWin();
      else audio.playLose();
      showNightResult(won, String(ev.data.reason));
    }
  }
}

function projectEdgeIndicator(
  worldPos: Vec3Tuple,
  el: HTMLElement,
  alwaysShowWhenOffscreen: boolean,
): void {
  _projVec.set(worldPos[0], worldPos[1] + 2.2, worldPos[2]).project(camera);
  const inFront = _projVec.z < 1;
  const onScreen = inFront && Math.abs(_projVec.x) <= 0.9 && Math.abs(_projVec.y) <= 0.9;
  if (!onScreen || !alwaysShowWhenOffscreen) {
    let sx = _projVec.x;
    let sy = _projVec.y;
    if (!inFront) {
      sx = -sx;
      sy = -sy;
    }
    const angle = Math.atan2(sy, sx);
    const pad = 62;
    const hw = window.innerWidth / 2 - pad;
    const hh = window.innerHeight / 2 - pad;
    el.style.left = `${window.innerWidth / 2 + Math.cos(angle) * hw}px`;
    el.style.top = `${window.innerHeight / 2 - Math.sin(angle) * hh}px`;
    el.style.transform = `rotate(${90 - (angle * 180) / Math.PI}deg)`;
    el.classList.add('visible');
  } else {
    el.classList.remove('visible');
  }
}

function syncVisualsAndHud(dtSec: number, nowSec: number, benchElapsedSec?: number): void {
  const litCount = world.lanterns.filter((l) => l.lit).length;
  const totalLanterns = Math.max(1, world.lanterns.length);
  const reqLit = Math.ceil(DEFAULT_TUNING.win_ratio * totalLanterns);
  ambientLight.intensity = 0.15 + 0.55 * (litCount / totalLanterns);

  // Wind visuals (off in bench)
  if (!isBenchMode) {
    if (world.wind.warning && !prevWindWarning) audio.playWindWarning();
    prevWindWarning = world.wind.warning;

    if (world.wind.warning || world.wind.active) {
      windLeaves.visible = true;
      const rad = (world.wind.dirDeg * Math.PI) / 180;
      const speed = world.wind.active ? 14 : 6;
      windLeaves.position.set(world.player.pos[0], world.player.pos[1], world.player.pos[2]);
      for (const child of windLeaves.children) {
        child.position.x += Math.cos(rad) * speed * dtSec;
        child.position.z += Math.sin(rad) * speed * dtSec;
        if (Math.abs(child.position.x) > 22) child.position.x *= -0.9;
        if (Math.abs(child.position.z) > 22) child.position.z *= -0.9;
      }
      windBannerEl.classList.add('visible');
      windBannerEl.classList.toggle('active', world.wind.active);
      windBannerEl.textContent = world.wind.active
        ? `⚠ Gió mạnh đang thổi (${Math.round(world.wind.dirDeg)}°)!`
        : '⚠ Gió sắp thổi!';
    } else {
      windLeaves.visible = false;
      windBannerEl.classList.remove('visible', 'active');
    }
  } else {
    windLeaves.visible = false;
  }

  // Player mesh
  playerRig.root.position.set(world.player.pos[0], world.player.pos[1], world.player.pos[2]);
  playerRig.body.rotation.y = world.player.yawRad;
  playerRig.body.visible =
    !world.player.fallPending &&
    (world.player.invulnTicks <= 0 ||
      settings.reduceMotion ||
      Math.floor(world.player.invulnTicks / 6) % 2 === 0);
  playerRig.miniLanternLight.intensity = 7 + world.player.carried * 1.6;

  if (!settings.reduceMotion && pulseAnimElapsed < 0.4) {
    pulseAnimElapsed += dtSec;
    const t = Math.min(1, pulseAnimElapsed / 0.4);
    playerRig.pulseRing.visible = true;
    playerRig.pulseRing.scale.setScalar(0.5 + t * DEFAULT_TUNING.pulse_radius);
    (playerRig.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
  } else {
    playerRig.pulseRing.visible = false;
  }

  const blink1Hz = settings.reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(nowSec * Math.PI * 2);
  const fuelMaxUnits = DEFAULT_TUNING.fuel_max * FUEL_UNITS_PER_POINT;
  const lowFuelIds: string[] = [];

  let nearPrompt: string | null = null;
  let nearestPriorityPos: Vec3Tuple | null = null;
  let nearestPriorityDist = Infinity;

  for (const l of world.lanterns) {
    const vis = lanternVisMap.get(l.id);
    const fuelPct = l.fuelSixtieths / FUEL_UNITS_PER_POINT;
    const lowFuel = l.lit && fuelPct < DEFAULT_TUNING.low_fuel_threshold;
    if (lowFuel) lowFuelIds.push(l.id);
    const activeSafe = hasActiveSafeZone(l, DEFAULT_TUNING);

    if (vis) {
      if (l.lit) {
        vis.coreMesh.scale.set(1, 1, 1);
        vis.tearMarks.visible = false;
        vis.coreMat.color.setHex(PALETTE.lanternCore);
        vis.coreMat.emissive.setHex(PALETTE.lanternLit);
        vis.coreMat.emissiveIntensity = lowFuel ? 0.6 + blink1Hz * 1.3 : 1.9;
        vis.light.intensity = lowFuel ? 10 + blink1Hz * 18 : 30;
        vis.safeRing.visible = activeSafe;

        vis.fuelBarGroup.visible = true;
        vis.fuelBarGroup.lookAt(camera.position);
        const ratio = Math.max(0.02, Math.min(1, l.fuelSixtieths / fuelMaxUnits));
        vis.fuelFill.scale.x = ratio;
        vis.fuelFill.position.x = -(1 - ratio);
        const dangerColor = settings.colorblind ? PALETTE.dangerColorblind : PALETTE.danger;
        vis.fuelFillMat.color.setHex(lowFuel ? dangerColor : PALETTE.lanternLit);
        vis.fuelFillMat.opacity = lowFuel ? 0.4 + blink1Hz * 0.6 : 1;
      } else {
        vis.coreMesh.scale.set(1.06, 0.8, 1.06);
        vis.tearMarks.visible = true;
        vis.coreMat.color.setHex(PALETTE.lanternUnlit);
        vis.coreMat.emissive.setHex(PALETTE.lanternUnlit);
        vis.coreMat.emissiveIntensity = 0.2;
        vis.light.intensity = 0;
        vis.safeRing.visible = false;
        vis.fuelBarGroup.visible = false;
      }
    }

    if (!isBenchMode) {
      const d = distXZ(world.player.pos, l.pos);
      if (d <= DEFAULT_TUNING.interact_radius) {
        const interactName = formatKeyCode(settings.keybinds.interact);
        if (!l.lit) {
          const cost = l.everLit ? DEFAULT_TUNING.relight_cost : DEFAULT_TUNING.lantern_cost;
          nearPrompt = l.everLit
            ? `${interactName} — Thắp lại đèn (${l.deposited}/${cost})`
            : `${interactName} — Nạp ánh sáng (${l.deposited}/${cost})`;
        } else if (l.fuelSixtieths < fuelMaxUnits) {
          nearPrompt = `${interactName} — Châm dầu (${Math.round(fuelPct)}/100)`;
        }
      }
      if ((!l.lit || lowFuel) && d < nearestPriorityDist) {
        nearestPriorityDist = d;
        nearestPriorityPos = l.pos;
      }
    }
  }

  // Sync Instanced Motes
  const mCount = Math.min(MAX_MOTE_INSTANCES, world.motes.length);
  moteCoreInst.count = mCount;
  moteHaloInst.count = mCount;
  for (let i = 0; i < mCount; i += 1) {
    const m = world.motes[i]!;
    const y = m.pos[1] + 0.85 + Math.sin(nowSec * 3.5 + m.pos[0]) * 0.2;
    _dummy.position.set(m.pos[0], y, m.pos[2]);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    moteCoreInst.setMatrixAt(i, _dummy.matrix);
    moteHaloInst.setMatrixAt(i, _dummy.matrix);
  }
  moteCoreInst.instanceMatrix.needsUpdate = true;
  moteHaloInst.instanceMatrix.needsUpdate = true;

  // Sync Instanced Shades
  const sCount = Math.min(MAX_SHADE_INSTANCES, world.shades.length);
  shadeBodyInst.count = sCount;
  shadeEyeInst.count = sCount;
  let haloCount = 0;
  for (let i = 0; i < sCount; i += 1) {
    const s = world.shades[i]!;
    const y = s.pos[1] + Math.sin(nowSec * 4 + s.pos[0]) * 0.1;
    const yaw =
      s.state === 'stunned'
        ? nowSec * 6
        : Math.atan2(world.player.pos[0] - s.pos[0], world.player.pos[2] - s.pos[2]);

    _dummy.position.set(s.pos[0], y, s.pos[2]);
    _dummy.rotation.set(0, yaw, 0);
    _dummy.scale.setScalar(1);
    _dummy.updateMatrix();
    shadeBodyInst.setMatrixAt(i, _dummy.matrix);

    // Offset eye bar forward
    _dummy.position.set(s.pos[0] + Math.sin(yaw) * 0.56, y + 0.14, s.pos[2] + Math.cos(yaw) * 0.56);
    _dummy.rotation.set(0, yaw, 0);
    _dummy.updateMatrix();
    shadeEyeInst.setMatrixAt(i, _dummy.matrix);

    if (s.state === 'stunned') {
      _dummy.position.set(s.pos[0], y + 0.95, s.pos[2]);
      _dummy.rotation.set(Math.PI / 2, 0, 0);
      _dummy.updateMatrix();
      shadeHaloInst.setMatrixAt(haloCount, _dummy.matrix);
      haloCount += 1;
    }
  }
  shadeHaloInst.count = haloCount;
  shadeBodyInst.instanceMatrix.needsUpdate = true;
  shadeEyeInst.instanceMatrix.needsUpdate = true;
  shadeHaloInst.instanceMatrix.needsUpdate = true;

  // Sync Drifters & Charms (non-bench)
  if (!isBenchMode) {
    const drifterIds = new Set(world.drifters.map((d) => d.id));
    for (const [id, mesh] of drifterVisMap.entries()) {
      if (!drifterIds.has(id)) {
        scene.remove(mesh);
        disposeObject3D(mesh);
        drifterVisMap.delete(id);
      }
    }
    for (const d of world.drifters) {
      let mesh = drifterVisMap.get(d.id);
      if (!mesh) {
        mesh = createDrifterVis();
        drifterVisMap.set(d.id, mesh);
        scene.add(mesh);
      }
      mesh.position.set(d.pos[0], d.pos[1] + Math.sin(nowSec * 6 + d.pos[2]) * 0.25, d.pos[2]);
      mesh.rotation.y = nowSec * 2.5;
    }

    for (const c of world.charms) {
      const mesh = charmVisMap.get(c.id);
      if (mesh) {
        mesh.visible = c.available;
        mesh.position.y = c.pos[1] + 1.0 + Math.sin(nowSec * 3) * 0.2;
        mesh.rotation.y = nowSec * 1.8;
      }
    }
  }

  // Camera
  if (isBenchMode && benchElapsedSec !== undefined) {
    // Ticket-04 Section 1 exact orbit: R=30, Y=15, start (30,15,0), CCW, 15s/rev, lookAt (0,0,0)
    const angle = (benchElapsedSec / 15) * Math.PI * 2;
    camera.position.set(Math.cos(angle) * 30, 15, -Math.sin(angle) * 30);
    camera.lookAt(0, 0, 0);
    return;
  }

  const theta = (camYawDeg * Math.PI) / 180;
  const camDist = 11.5;
  const camHeight = 6.4;
  _camTarget.set(
    world.player.pos[0] + Math.sin(theta) * camDist,
    Math.max(1.5, world.player.pos[1] + camHeight),
    world.player.pos[2] + Math.cos(theta) * camDist,
  );
  camera.position.lerp(_camTarget, Math.min(1, dtSec * 8));
  camera.lookAt(world.player.pos[0], world.player.pos[1] + 1.4, world.player.pos[2]);

  if (uiScreen === 'playing' && nearestPriorityPos) {
    projectEdgeIndicator(nearestPriorityPos, lanternArrowEl, true);
  } else {
    lanternArrowEl.classList.remove('visible');
  }

  if (uiScreen === 'playing' && shadeAlertTimer > 0 && lastSpawnedShadePos) {
    shadeAlertTimer = Math.max(0, shadeAlertTimer - dtSec);
    projectEdgeIndicator(lastSpawnedShadePos, shadeArrowEl, false);
  } else {
    shadeArrowEl.classList.remove('visible');
  }

  // HUD & Subtitles
  flamesValEl.textContent = world.player.flames > 0 ? '🔥 '.repeat(world.player.flames).trim() : 'Tắt lửa';
  if (world.player.charmTicks > 0) {
    charmBadgeEl.classList.add('active');
    charmBadgeEl.textContent = `Bùa Gió: ${(world.player.charmTicks / TICK_RATE).toFixed(1)}s`;
  } else {
    charmBadgeEl.classList.remove('active');
  }

  const secsLeft = Math.ceil(world.timeLeftS);
  if (uiScreen === 'playing' && secsLeft <= 10 && secsLeft > 0 && secsLeft !== lastCountdownSec) {
    lastCountdownSec = secsLeft;
    audio.playCountdownTick();
  }
  const mm = String(Math.floor(secsLeft / 60)).padStart(2, '0');
  const ss = String(secsLeft % 60).padStart(2, '0');
  const isDangerTime = secsLeft <= 30;
  timerValEl.textContent = isDangerTime && settings.colorblind ? `⚠ ${mm}:${ss}` : `${mm}:${ss}`;
  timerValEl.classList.toggle('danger', isDangerTime);

  // Accessibility subtitle line
  const alerts: string[] = [];
  if (shadeAlertTimer > 0) alerts.push('⚠ Bóng Mực vừa xuất hiện!');
  if (world.wind.warning) alerts.push('⚠ Gió mạnh sắp thổi!');
  if (secsLeft <= 10 && secsLeft > 0) alerts.push(`⚠ Chỉ còn ${secsLeft} giây cuối!`);
  if (lowFuelIds.length > 0) alerts.push(`⚠ Đèn ${lowFuelIds.join(', ')} sắp cạn dầu (<30)!`);

  if (uiScreen === 'playing' && alerts.length > 0) {
    subtitleBannerEl.textContent = alerts.join(' · ');
    subtitleBannerEl.classList.add('visible');
  } else {
    subtitleBannerEl.classList.remove('visible');
  }

  lanternsValEl.textContent = `Đèn: ${litCount} / ${totalLanterns} (cần ${reqLit})`;
  scoreValEl.textContent = `Điểm: ${world.score}`;

  const capacity = getPlayerCapacity(world.player.successfulLights, DEFAULT_TUNING);
  ensureSlotCount(capacity);
  moteBarLabelEl.textContent = `Đom đóm: ${world.player.carried} / ${capacity}`;
  for (let i = 0; i < capacity; i += 1) {
    moteSlotEls[i]!.classList.toggle('filled', i < world.player.carried);
  }

  const dashReady = world.player.dashCdTicks === 0 || world.player.charmTicks > 0;
  dashBoxEl.classList.toggle('ready', dashReady);
  dashBoxEl.classList.toggle('cd', !dashReady);
  dashStatusEl.textContent =
    world.player.charmTicks > 0
      ? '0s (Bùa)'
      : dashReady
        ? 'Sẵn sàng'
        : `${(world.player.dashCdTicks / TICK_RATE).toFixed(1)}s`;

  const pulseReady =
    world.player.pulseCdTicks === 0 && world.player.carried >= DEFAULT_TUNING.pulse_cost;
  pulseBoxEl.classList.toggle('ready', pulseReady);
  pulseBoxEl.classList.toggle('cd', !pulseReady);
  pulseStatusEl.textContent =
    world.player.pulseCdTicks > 0
      ? `${(world.player.pulseCdTicks / TICK_RATE).toFixed(1)}s`
      : world.player.carried < DEFAULT_TUNING.pulse_cost
        ? `Cần ${DEFAULT_TUNING.pulse_cost}`
        : 'Sẵn sàng';

  if (uiScreen === 'playing' && nearPrompt) {
    actionHintEl.textContent = nearPrompt;
    actionHintEl.classList.add('visible');
  } else {
    actionHintEl.classList.remove('visible');
  }
}

// --- Benchmark Telemetry Runner ---
const benchSamples: number[] = [];
let benchFirstFrameMs: number | null = null;
let benchWarmupDoneMs: number | null = null;
let benchPrevFrameMs: number | null = null;
let benchReported = false;
const pageStartMs = performance.now();

function getRendererLabel(): string {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) {
      const gpu = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      return `Three.js ${THREE.REVISION} WebGL2 (${String(gpu)})`;
    }
  } catch {
    // ignore
  }
  return `Three.js ${THREE.REVISION} WebGL2`;
}

function finalizeBenchmark(): void {
  if (benchReported) return;
  benchReported = true;
  const n = benchSamples.length;
  const sumDt = benchSamples.reduce((a, b) => a + b, 0);
  const avgFps = sumDt > 0 ? Math.round(((1000 * n) / sumDt) * 10) / 10 : 0;

  const sorted = [...benchSamples].sort((a, b) => a - b);
  const k = Math.max(1, Math.ceil(0.01 * n));
  let topSum = 0;
  for (let i = n - k; i < n; i += 1) {
    topSum += sorted[i]!;
  }
  const p1LowFps = topSum > 0 ? Math.round((1000 / (topSum / k)) * 10) / 10 : 0;
  const p95Idx = Math.min(n - 1, Math.max(0, Math.ceil(0.95 * n) - 1));
  const frameMsP95 = Math.round((sorted[p95Idx] ?? 0) * 10) / 10;

  const payload = {
    frames: n,
    avg_fps: avgFps,
    p1_low_fps: p1LowFps,
    frame_ms_p95: frameMsP95,
    load_ms: Math.round(benchFirstFrameMs ?? performance.now() - pageStartMs),
    renderer: getRendererLabel(),
  };

  void fetch('/__bench_done', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }).catch(() => undefined);
}

// --- Main Loop ---
let accumulator = 0;
let lastFrameMs = performance.now();
let fpsFrames = 0;
let fpsLastSample = performance.now();

function animate(nowMs: number): void {
  requestAnimationFrame(animate);

  if (isBenchMode) {
    if (benchFirstFrameMs === null) {
      benchFirstFrameMs = nowMs - pageStartMs;
      benchWarmupDoneMs = nowMs + 3000;
      benchPrevFrameMs = nowMs;
      const dtSec = FIXED_DT;
      syncVisualsAndHud(dtSec, nowMs / 1000, 0);
      renderer.render(scene, camera);
      void fetch('/__bench_ready', { method: 'POST' }).catch(() => undefined);
      return;
    } else if (benchPrevFrameMs !== null) {
      const frameDt = nowMs - benchPrevFrameMs;
      benchPrevFrameMs = nowMs;
      if (benchWarmupDoneMs !== null && nowMs >= benchWarmupDoneMs) {
        benchSamples.push(frameDt);
        if (nowMs - benchWarmupDoneMs >= benchDurationS * 1000) {
          finalizeBenchmark();
          return;
        }
      }
    }

    const dtSec = Math.min(0.1, FIXED_DT);
    accumulator += dtSec;
    while (accumulator >= FIXED_DT) {
      stepBenchWorld(world, DEFAULT_TUNING);
      accumulator -= FIXED_DT;
    }
    const elapsedSec = Math.max(0, (nowMs - (benchFirstFrameMs ?? 0)) / 1000);
    syncVisualsAndHud(dtSec, nowMs / 1000, elapsedSec);
    renderer.render(scene, camera);
    return;
  }

  const dtSec = Math.min((nowMs - lastFrameMs) / 1000, 0.1);
  lastFrameMs = nowMs;

  fpsFrames += 1;
  if (nowMs - fpsLastSample >= 500) {
    const fps = Math.round((fpsFrames * 1000) / (nowMs - fpsLastSample));
    fpsValEl.textContent = `${fps} FPS`;
    fpsFrames = 0;
    fpsLastSample = nowMs;
  }

  if (uiScreen === 'playing') {
    if (keys.has('KeyJ')) camYawDeg += 95 * dtSec;
    if (keys.has('KeyL')) camYawDeg -= 95 * dtSec;
  }

  if (uiScreen === 'playing' || uiScreen === 'paused') {
    accumulator += dtSec;
    while (accumulator >= FIXED_DT) {
      const input = buildLiveInput();
      const events = stepWorld(world, input, DEFAULT_TUNING);
      handleEvents(events);
      accumulator -= FIXED_DT;
    }
  }

  syncVisualsAndHud(dtSec, nowMs / 1000);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Expose clean runtime test hook for 5-restart stability measurement (no impact on core/headless)
(window as unknown as { __DDL_RUNTIME__?: unknown }).__DDL_RUNTIME__ = {
  getStats: () => ({
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    sceneChildren: scene.children.length,
    drawCalls: renderer.info.render.calls,
  }),
  restartNight: (n: NightId) => loadNightWorld(n),
};

if (isBenchMode) {
  hideAllModals();
  hudEl.classList.add('hidden');
  loadNightWorld(1, world);
} else {
  loadNightWorld(1);
  applyAccessibilitySettings();
  showMenu();
  void fetch('/api/settings')
    .then((r) => (r.ok ? r.json() : null))
    .then((disk) => {
      if (disk && typeof disk === 'object') {
        const p = disk as Partial<SavedSettings>;
        if (typeof p.volume === 'number') settings.volume = Math.max(0, Math.min(100, p.volume));
        if (typeof p.sensitivity === 'number') {
          settings.sensitivity = Math.max(30, Math.min(250, p.sensitivity));
        }
        if (typeof p.colorblind === 'boolean') settings.colorblind = p.colorblind;
        if (typeof p.reduceMotion === 'boolean') settings.reduceMotion = p.reduceMotion;
        if (typeof p.largeText === 'boolean') settings.largeText = p.largeText;
        if (p.keybinds && typeof p.keybinds === 'object') {
          settings.keybinds = { ...DEFAULT_KEYBINDS, ...p.keybinds };
        }
        applyAccessibilitySettings();
      }
    })
    .catch(() => undefined);
}

requestAnimationFrame(animate);
