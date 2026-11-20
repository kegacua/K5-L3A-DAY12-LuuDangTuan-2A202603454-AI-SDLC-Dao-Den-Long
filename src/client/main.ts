import * as THREE from 'three';
import {
  DEFAULT_TUNING,
  FIXED_DT,
  FUEL_UNITS_PER_POINT,
  getPlayerCapacity,
  TICK_RATE,
} from '../core/config.js';
import { NIGHT_MAPS } from '../core/maps.js';
import { createWorld, distXZ, hasActiveSafeZone, stepWorld } from '../core/simulation.js';
import type { EffectiveInput, EventRecord, NightId, WorldState } from '../core/types.js';
import { FairyAudio } from './audio.js';

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

const SETTINGS_KEY = 'dao-den-long-settings-v2';

interface SavedSettings {
  volume: number;
  sensitivity: number;
  colorblind: boolean;
}

function loadSettings(): SavedSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SavedSettings>;
      return {
        volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(100, parsed.volume)) : 65,
        sensitivity:
          typeof parsed.sensitivity === 'number'
            ? Math.max(30, Math.min(250, parsed.sensitivity))
            : 100,
        colorblind: Boolean(parsed.colorblind),
      };
    }
  } catch {
    // ignore storage errors
  }
  return { volume: 65, sensitivity: 100, colorblind: false };
}

function saveSettings(s: SavedSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // ignore storage errors
  }
}

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
const moteBarLabelEl = document.getElementById('mote-bar-label')!;
const moteSlotsEl = document.getElementById('mote-slots')!;
const dashBoxEl = document.getElementById('dash-box')!;
const dashStatusEl = document.getElementById('dash-status')!;
const pulseBoxEl = document.getElementById('pulse-box')!;
const pulseStatusEl = document.getElementById('pulse-status')!;
const actionHintEl = document.getElementById('action-hint')!;
const lanternArrowEl = document.getElementById('lantern-arrow')!;

// Modals
const menuModal = document.getElementById('menu-modal')!;
const introModal = document.getElementById('intro-modal')!;
const introTitleEl = document.getElementById('intro-title')!;
const introQuoteEl = document.getElementById('intro-quote')!;
const pauseModal = document.getElementById('pause-modal')!;
const settingsModal = document.getElementById('settings-modal')!;
const resultModal = document.getElementById('result-modal')!;
const resultCardEl = document.getElementById('result-card')!;
const resultTitleEl = document.getElementById('result-title')!;
const resultDescEl = document.getElementById('result-desc')!;
const resultStatsEl = document.getElementById('result-stats')!;
const btnResultPrimary = document.getElementById('btn-result-primary') as HTMLButtonElement;

const volumeSlider = document.getElementById('volume-slider') as HTMLInputElement;
const volumeValEl = document.getElementById('volume-val')!;
const sensSlider = document.getElementById('sens-slider') as HTMLInputElement;
const sensValEl = document.getElementById('sens-val')!;
const colorblindToggle = document.getElementById('colorblind-toggle') as HTMLInputElement;

// Dynamic capacity firefly slots (up to capacity_max = 20)
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
volumeSlider.value = String(settings.volume);
volumeValEl.textContent = `${settings.volume}%`;
sensSlider.value = String(settings.sensitivity);
sensValEl.textContent = `${(settings.sensitivity / 100).toFixed(1)}x`;
colorblindToggle.checked = settings.colorblind;
document.body.classList.toggle('colorblind', settings.colorblind);

const audio = new FairyAudio();
audio.setVolume(settings.volume / 100);

// --- Three.js Scene ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
const fog = new THREE.FogExp2(PALETTE.fog, 0.015);
scene.fog = fog;

const camera = new THREE.PerspectiveCamera(
  56,
  window.innerWidth / window.innerHeight,
  0.1,
  300,
);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const ambientLight = new THREE.AmbientLight(0xd8e0ff, 0.15);
scene.add(ambientLight);

const moonLight = new THREE.DirectionalLight(0xaec4ff, 0.72);
moonLight.position.set(-25, 50, -20);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
const dCam = 65;
moonLight.shadow.camera.left = -dCam;
moonLight.shadow.camera.right = dCam;
moonLight.shadow.camera.top = dCam;
moonLight.shadow.camera.bottom = -dCam;
scene.add(moonLight);

const cloudSea = new THREE.Mesh(
  new THREE.CircleGeometry(220, 48),
  new THREE.MeshStandardMaterial({ color: PALETTE.cloudSea, roughness: 0.95 }),
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

// --- Build Map Geometry per Night ---
function buildNightEnvironment(night: NightId): THREE.Group {
  const group = new THREE.Group();
  const grassMat = new THREE.MeshStandardMaterial({ color: PALETTE.grass, roughness: 0.9 });
  const sandMat = new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 });
  const padMat = new THREE.MeshStandardMaterial({
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

// --- Mây Rig ---
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
    new THREE.MeshStandardMaterial({ color: PALETTE.mayCloak, roughness: 0.75 }),
  );
  cloak.position.y = 0.58;
  cloak.castShadow = true;
  body.add(cloak);

  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.08, 8, 16),
    new THREE.MeshStandardMaterial({ color: PALETTE.mayScarf, roughness: 0.6 }),
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.12;
  body.add(scarf);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf4d4b6, roughness: 0.65 }),
  );
  head.position.y = 1.34;
  body.add(head);

  const nonLa = new THREE.Mesh(
    new THREE.ConeGeometry(0.74, 0.4, 20),
    new THREE.MeshStandardMaterial({ color: PALETTE.sand, roughness: 0.8 }),
  );
  nonLa.position.y = 1.62;
  body.add(nonLa);

  const miniLantern = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.13, 0),
    new THREE.MeshStandardMaterial({
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

// --- Lantern Visual with Fuel Bar + Non-Color Torn/Squished Unlit Shape ---
interface LanternVis {
  group: THREE.Group;
  coreMesh: THREE.Mesh;
  coreMat: THREE.MeshStandardMaterial;
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
    new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 }),
  );
  base.position.y = 0.2;
  group.add(base);

  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.2, 0.26, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: PALETTE.wood, roughness: 0.85 }),
  );
  post.position.y = 1.5;
  group.add(post);

  const coreMat = new THREE.MeshStandardMaterial({
    color: PALETTE.lanternUnlit,
    emissive: PALETTE.lanternUnlit,
    emissiveIntensity: 0.2,
  });
  const coreMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), coreMat);
  coreMesh.position.y = 3.1;
  group.add(coreMesh);

  // Non-color distinction for unlit lanterns: visible dark paper tear slashes
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

  // Overhead 3D Fuel Bar (visible when lit)
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

const sharedMoteGeo = new THREE.SphereGeometry(0.24, 10, 8);
const sharedMoteHaloGeo = new THREE.SphereGeometry(0.42, 8, 8);
const sharedMoteMat = new THREE.MeshBasicMaterial({ color: PALETTE.moteCore });
const sharedMoteHaloMat = new THREE.MeshBasicMaterial({
  color: PALETTE.moteHalo,
  transparent: true,
  opacity: 0.35,
});

function createMoteVis(): THREE.Group {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(sharedMoteGeo, sharedMoteMat), new THREE.Mesh(sharedMoteHaloGeo, sharedMoteHaloMat));
  return g;
}

interface ShadeVis {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  eyeMat: THREE.MeshBasicMaterial;
  halo: THREE.Mesh;
}

function createShadeVis(): ShadeVis {
  const group = new THREE.Group();
  const rimHex = settings.colorblind ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
  const bodyMat = new THREE.MeshStandardMaterial({
    color: PALETTE.shadeBody,
    emissive: rimHex,
    emissiveIntensity: 0.55,
    roughness: 0.6,
  });
  group.add(new THREE.Mesh(new THREE.SphereGeometry(0.68, 12, 10), bodyMat));

  const eyeMat = new THREE.MeshBasicMaterial({ color: rimHex });
  const eL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), eyeMat);
  const eR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), eyeMat);
  eL.position.set(-0.22, 0.15, 0.6);
  eR.position.set(0.22, 0.15, 0.6);
  group.add(eL, eR);

  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.06, 6, 16),
    new THREE.MeshBasicMaterial({ color: PALETTE.gold }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.95;
  halo.visible = false;
  group.add(halo);

  return { group, bodyMat, eyeMat, halo };
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

// --- App / Campaign State ---
type UiScreen = 'menu' | 'intro' | 'playing' | 'paused' | 'result';
let uiScreen: UiScreen = 'menu';
let settingsReturnScreen: 'menu' | 'paused' = 'menu';
let currentNight: NightId = 1;
let campaignTotalScore = 0;
let runSeed = 2026;

let world: WorldState = createWorld(runSeed, 1);
let envGroup: THREE.Group = buildNightEnvironment(1);
scene.add(envGroup);

const playerRig = buildPlayerRig();
scene.add(playerRig.root);

const lanternVisMap = new Map<string, LanternVis>();
const moteVisMap = new Map<string, THREE.Group>();
const shadeVisMap = new Map<string, ShadeVis>();
const drifterVisMap = new Map<string, THREE.Group>();
const charmVisMap = new Map<string, THREE.Group>();

let pulseAnimElapsed = 99;
let camYawDeg = 0;
let isDragging = false;
let lastPointerX = 0;
let lastCountdownSec = -1;
let prevWindWarning = false;

const keys = new Set<string>();
let qJump = false;
let qInteract = false;
let qPulse = false;
let qDash = false;
let qPause = false;

function applyColorblindMode(): void {
  document.body.classList.toggle('colorblind', settings.colorblind);
  const rimHex = settings.colorblind ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
  for (const s of shadeVisMap.values()) {
    s.bodyMat.emissive.setHex(rimHex);
    s.eyeMat.color.setHex(rimHex);
  }
}

function clearDynamicVisuals(): void {
  for (const v of lanternVisMap.values()) scene.remove(v.group);
  lanternVisMap.clear();
  for (const m of moteVisMap.values()) scene.remove(m);
  moteVisMap.clear();
  for (const s of shadeVisMap.values()) scene.remove(s.group);
  shadeVisMap.clear();
  for (const d of drifterVisMap.values()) scene.remove(d);
  drifterVisMap.clear();
  for (const c of charmVisMap.values()) scene.remove(c);
  charmVisMap.clear();
}

function loadNightWorld(night: NightId): void {
  currentNight = night;
  runSeed += 1;
  world = createWorld(runSeed, night);
  camYawDeg = 0;
  pulseAnimElapsed = 99;
  lastCountdownSec = -1;
  prevWindWarning = false;
  qJump = qInteract = qPulse = qDash = qPause = false;

  clearDynamicVisuals();
  scene.remove(envGroup);
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
  hideAllModals();
  settingsModal.classList.add('visible');
}

function showNightResult(won: boolean, reason: string): void {
  uiScreen = 'result';
  hideAllModals();
  if (won) {
    campaignTotalScore += world.score;
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
        ? `Khi bình minh tới, cần ít nhất ${reqLit}/${world.lanterns.length} đèn đang sáng. Hãy châm dầu và canh Bóng Mực hút dầu!`
        : 'Mây đã mất hết Ngọn Lửa. Hãy dùng Lướt [Shift], Tỏa Sáng [F] và vùng an toàn đèn sáng (dầu ≥ 30)!';
    btnResultPrimary.textContent = `Chơi lại Đêm ${currentNight}`;
  }

  const litCount = world.lanterns.filter((l) => l.lit).length;
  resultStatsEl.innerHTML = `
    <div class="stat-row"><span>Đèn sáng lúc kết thúc</span><span>${litCount} / ${world.lanterns.length} (cần ${reqLit})</span></div>
    <div class="stat-row"><span>Ngọn Lửa còn lại</span><span>${world.player.flames}</span></div>
    <div class="stat-row"><span>Điểm Đêm ${currentNight}</span><span>${world.score}</span></div>
    <div class="stat-row" style="color:#F2C14E;font-weight:800"><span>Tổng điểm hành trình</span><span>${campaignTotalScore}</span></div>
  `;
  resultModal.classList.add('visible');
}

// --- Button & Input Wiring ---
document.getElementById('btn-play-campaign')!.addEventListener('click', () => {
  campaignTotalScore = 0;
  showNightIntro(1);
});

document.querySelectorAll<HTMLButtonElement>('.night-select').forEach((btn) => {
  btn.addEventListener('click', () => {
    campaignTotalScore = 0;
    const n = Number(btn.dataset.night) as NightId;
    showNightIntro(n);
  });
});

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
  volumeValEl.textContent = `${settings.volume}%`;
  audio.setVolume(settings.volume / 100);
});

sensSlider.addEventListener('input', () => {
  settings.sensitivity = Number(sensSlider.value);
  sensValEl.textContent = `${(settings.sensitivity / 100).toFixed(1)}x`;
});

colorblindToggle.addEventListener('change', () => {
  settings.colorblind = colorblindToggle.checked;
  applyColorblindMode();
});

document.getElementById('btn-settings-close')!.addEventListener('click', () => {
  saveSettings(settings);
  applyColorblindMode();
  hideAllModals();
  if (settingsReturnScreen === 'menu') menuModal.classList.add('visible');
  else pauseModal.classList.add('visible');
});

btnResultPrimary.addEventListener('click', () => {
  if (world.state === 'won') {
    if (currentNight < 3) {
      showNightIntro((currentNight + 1) as NightId);
    } else {
      campaignTotalScore = 0;
      showNightIntro(1);
    }
  } else {
    loadNightWorld(currentNight);
    beginPlayingNight();
  }
});

document.getElementById('btn-result-menu')!.addEventListener('click', () => showMenu());

window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (!keys.has(code)) {
    if (uiScreen === 'intro' && (code === 'Space' || code === 'Enter')) {
      beginPlayingNight();
      return;
    }
    if ((uiScreen === 'playing' || uiScreen === 'paused') && (code === 'Escape' || code === 'KeyP')) {
      qPause = true;
    }
    if (uiScreen === 'playing') {
      if (code === 'Space') {
        qJump = true;
        if (world.player.grounded) audio.playJump();
      }
      if (code === 'KeyE') qInteract = true;
      if (code === 'KeyF' || code === 'KeyQ') qPulse = true;
      if (code === 'ShiftLeft' || code === 'ShiftRight') qDash = true;
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
    if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
  }

  const input: EffectiveInput = {
    move: [x, z],
    cam_yaw_deg: camYawDeg,
    jump: qJump || (uiScreen === 'playing' && keys.has('Space')),
    interact: qInteract || (uiScreen === 'playing' && keys.has('KeyE')),
    pulse: qPulse || (uiScreen === 'playing' && (keys.has('KeyF') || keys.has('KeyQ'))),
    dash: qDash || (uiScreen === 'playing' && (keys.has('ShiftLeft') || keys.has('ShiftRight'))),
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

const projVec = new THREE.Vector3();

function syncVisualsAndHud(dtSec: number, nowSec: number): void {
  const litCount = world.lanterns.filter((l) => l.lit).length;
  const totalLanterns = Math.max(1, world.lanterns.length);
  const reqLit = Math.ceil(DEFAULT_TUNING.win_ratio * totalLanterns);
  ambientLight.intensity = 0.15 + 0.55 * (litCount / totalLanterns);

  // Wind visuals
  if (world.wind.warning && !prevWindWarning) {
    audio.playWindWarning();
  }
  prevWindWarning = world.wind.warning;

  if (world.wind.warning || world.wind.active) {
    windLeaves.visible = true;
    const rad = (world.wind.dirDeg * Math.PI) / 180;
    const speed = world.wind.active ? 14 : 6;
    windLeaves.position.set(world.player.pos[0], world.player.pos[1], world.player.pos[2]);
    for (const child of windLeaves.children) {
      child.position.x += Math.cos(rad) * speed * dtSec;
      child.position.z += Math.sin(rad) * speed * dtSec;
      child.rotation.x += dtSec * 4;
      child.rotation.y += dtSec * 3;
      if (Math.abs(child.position.x) > 22) child.position.x *= -0.9;
      if (Math.abs(child.position.z) > 22) child.position.z *= -0.9;
    }
    windBannerEl.classList.add('visible');
    windBannerEl.classList.toggle('active', world.wind.active);
    const warnIcon = settings.colorblind ? '⚠ ' : '';
    windBannerEl.textContent = world.wind.active
      ? `${warnIcon}Gió mạnh đang thổi (${Math.round(world.wind.dirDeg)}°)!`
      : `${warnIcon}Lá bay — Cơn gió sắp nổi...`;
  } else {
    windLeaves.visible = false;
    windBannerEl.classList.remove('visible', 'active');
  }

  // Player mesh
  playerRig.root.position.set(world.player.pos[0], world.player.pos[1], world.player.pos[2]);
  playerRig.body.rotation.y = world.player.yawRad;
  playerRig.body.visible =
    !world.player.fallPending &&
    (world.player.invulnTicks <= 0 || Math.floor(world.player.invulnTicks / 6) % 2 === 0);
  playerRig.miniLanternLight.intensity = 7 + world.player.carried * 1.6;

  if (pulseAnimElapsed < 0.4) {
    pulseAnimElapsed += dtSec;
    const t = Math.min(1, pulseAnimElapsed / 0.4);
    playerRig.pulseRing.visible = true;
    playerRig.pulseRing.scale.setScalar(0.5 + t * DEFAULT_TUNING.pulse_radius);
    (playerRig.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
  } else {
    playerRig.pulseRing.visible = false;
  }

  // 1 Hz slow blink wave for low-fuel lanterns (fuel < 30)
  const blink1Hz = 0.5 + 0.5 * Math.sin(nowSec * Math.PI * 2);
  const fuelMaxUnits = DEFAULT_TUNING.fuel_max * FUEL_UNITS_PER_POINT;

  let nearPrompt: string | null = null;
  let nearestPriorityPos: [number, number, number] | null = null;
  let nearestPriorityDist = Infinity;

  for (const l of world.lanterns) {
    const vis = lanternVisMap.get(l.id);
    const fuelPct = l.fuelSixtieths / FUEL_UNITS_PER_POINT;
    const lowFuel = l.lit && fuelPct < DEFAULT_TUNING.low_fuel_threshold;
    const activeSafe = hasActiveSafeZone(l, DEFAULT_TUNING);

    if (vis) {
      if (l.lit) {
        // Full shape, no tears
        vis.coreMesh.scale.set(1, 1, 1);
        vis.tearMarks.visible = false;
        vis.coreMat.color.setHex(PALETTE.lanternCore);
        vis.coreMat.emissive.setHex(PALETTE.lanternLit);
        vis.coreMat.emissiveIntensity = lowFuel ? 0.5 + blink1Hz * 1.4 : 1.9;
        vis.light.intensity = lowFuel ? 8 + blink1Hz * 20 : 30;
        vis.safeRing.visible = activeSafe;

        // Fuel bar faces camera, blinks at 1 Hz when fuel < 30
        vis.fuelBarGroup.visible = true;
        vis.fuelBarGroup.lookAt(camera.position);
        const ratio = Math.max(0.02, Math.min(1, l.fuelSixtieths / fuelMaxUnits));
        vis.fuelFill.scale.x = ratio;
        vis.fuelFill.position.x = -(1 - ratio);
        const dangerColor = settings.colorblind ? PALETTE.dangerColorblind : PALETTE.danger;
        vis.fuelFillMat.color.setHex(lowFuel ? dangerColor : PALETTE.lanternLit);
        vis.fuelFillMat.opacity = lowFuel ? 0.35 + blink1Hz * 0.65 : 1;
      } else {
        // Non-color distinction: squished 20% vertically + visible paper tears
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

    const d = distXZ(world.player.pos, l.pos);
    if (d <= DEFAULT_TUNING.interact_radius) {
      if (!l.lit) {
        const cost = l.everLit ? DEFAULT_TUNING.relight_cost : DEFAULT_TUNING.lantern_cost;
        nearPrompt = l.everLit
          ? `E — Thắp lại đèn (${l.deposited}/${cost})`
          : `E — Nạp ánh sáng (${l.deposited}/${cost})`;
      } else if (l.fuelSixtieths < fuelMaxUnits) {
        nearPrompt = `E — Châm dầu (${Math.round(fuelPct)}/100)`;
      }
    }

    // Off-screen arrow targets nearest unlit or low-fuel lantern
    if ((!l.lit || lowFuel) && d < nearestPriorityDist) {
      nearestPriorityDist = d;
      nearestPriorityPos = l.pos;
    }
  }

  // Sync motes
  const moteIds = new Set(world.motes.map((m) => m.id));
  for (const [id, mesh] of moteVisMap.entries()) {
    if (!moteIds.has(id)) {
      scene.remove(mesh);
      moteVisMap.delete(id);
    }
  }
  for (const m of world.motes) {
    let mesh = moteVisMap.get(m.id);
    if (!mesh) {
      mesh = createMoteVis();
      moteVisMap.set(m.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(m.pos[0], m.pos[1] + 0.85 + Math.sin(nowSec * 3.5 + m.pos[0]) * 0.2, m.pos[2]);
  }

  // Sync shades
  const shadeIds = new Set(world.shades.map((s) => s.id));
  for (const [id, item] of shadeVisMap.entries()) {
    if (!shadeIds.has(id)) {
      scene.remove(item.group);
      shadeVisMap.delete(id);
    }
  }
  const rimHex = settings.colorblind ? PALETTE.shadeRimColorblind : PALETTE.shadeRim;
  for (const s of world.shades) {
    let item = shadeVisMap.get(s.id);
    if (!item) {
      item = createShadeVis();
      shadeVisMap.set(s.id, item);
      scene.add(item.group);
    }
    item.bodyMat.emissive.setHex(rimHex);
    item.eyeMat.color.setHex(rimHex);
    item.group.position.set(s.pos[0], s.pos[1] + Math.sin(nowSec * 4 + s.pos[0]) * 0.12, s.pos[2]);
    if (s.state === 'stunned') {
      item.halo.visible = true;
      item.bodyMat.color.setHex(PALETTE.shadeStunned);
      item.group.rotation.y += dtSec * 6;
    } else {
      item.halo.visible = false;
      item.bodyMat.color.setHex(PALETTE.shadeBody);
      item.bodyMat.emissiveIntensity = s.state === 'drain' ? 1.15 : 0.55;
      item.group.lookAt(world.player.pos[0], s.pos[1], world.player.pos[2]);
    }
  }

  // Sync drifters
  const drifterIds = new Set(world.drifters.map((d) => d.id));
  for (const [id, mesh] of drifterVisMap.entries()) {
    if (!drifterIds.has(id)) {
      scene.remove(mesh);
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

  // Sync charms
  for (const c of world.charms) {
    const mesh = charmVisMap.get(c.id);
    if (mesh) {
      mesh.visible = c.available;
      mesh.position.y = c.pos[1] + 1.0 + Math.sin(nowSec * 3) * 0.2;
      mesh.rotation.y = nowSec * 1.8;
    }
  }

  // Camera follow
  const theta = (camYawDeg * Math.PI) / 180;
  const camDist = 11.5;
  const camHeight = 6.4;
  camera.position.lerp(
    new THREE.Vector3(
      world.player.pos[0] + Math.sin(theta) * camDist,
      Math.max(1.5, world.player.pos[1] + camHeight),
      world.player.pos[2] + Math.cos(theta) * camDist,
    ),
    Math.min(1, dtSec * 8),
  );
  camera.lookAt(world.player.pos[0], world.player.pos[1] + 1.4, world.player.pos[2]);

  // Off-screen arrow
  if (uiScreen === 'playing' && nearestPriorityPos) {
    projVec.set(nearestPriorityPos[0], nearestPriorityPos[1] + 2.8, nearestPriorityPos[2]).project(camera);
    const inFront = projVec.z < 1;
    const onScreen = inFront && Math.abs(projVec.x) <= 0.92 && Math.abs(projVec.y) <= 0.92;
    if (!onScreen) {
      let sx = projVec.x;
      let sy = projVec.y;
      if (!inFront) {
        sx = -sx;
        sy = -sy;
      }
      const angle = Math.atan2(sy, sx);
      const pad = 56;
      const hw = window.innerWidth / 2 - pad;
      const hh = window.innerHeight / 2 - pad;
      lanternArrowEl.style.left = `${window.innerWidth / 2 + Math.cos(angle) * hw}px`;
      lanternArrowEl.style.top = `${window.innerHeight / 2 - Math.sin(angle) * hh}px`;
      lanternArrowEl.style.transform = `rotate(${90 - (angle * 180) / Math.PI}deg)`;
      lanternArrowEl.classList.add('visible');
    } else {
      lanternArrowEl.classList.remove('visible');
    }
  } else {
    lanternArrowEl.classList.remove('visible');
  }

  // HUD values
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

  lanternsValEl.textContent = `Đèn: ${litCount} / ${totalLanterns} (cần ${reqLit})`;
  scoreValEl.textContent = `Điểm: ${world.score}`;

  // Dynamic carry capacity HUD
  const capacity = getPlayerCapacity(world.player.successfulLights, DEFAULT_TUNING);
  ensureSlotCount(capacity);
  moteBarLabelEl.textContent = `Đom đóm: ${world.player.carried} / ${capacity}`;
  for (let i = 0; i < capacity; i += 1) {
    moteSlotEls[i]!.classList.toggle('filled', i < world.player.carried);
  }

  // Ability icons
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

let accumulator = 0;
let lastFrameMs = performance.now();
let fpsFrames = 0;
let fpsLastSample = performance.now();

function animate(nowMs: number): void {
  requestAnimationFrame(animate);
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

loadNightWorld(1);
applyColorblindMode();
showMenu();
requestAnimationFrame(animate);
