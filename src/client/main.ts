import * as THREE from 'three';
import { DEFAULT_TUNING, FIXED_DT, TICK_RATE } from '../core/config.js';
import { createWorld, distXZ, stepWorld } from '../core/simulation.js';
import type { EffectiveInput, EventRecord, WorldState } from '../core/types.js';
import { FairyAudio } from './audio.js';

const container = document.getElementById('app');
if (!container) {
  throw new Error('Missing #app element');
}

// HUD DOM handles
const lanternsValEl = document.getElementById('lanterns-val')!;
const carriedValEl = document.getElementById('carried-val')!;
const flamesValEl = document.getElementById('flames-val')!;
const pulseValEl = document.getElementById('pulse-val')!;
const timerValEl = document.getElementById('timer-val')!;
const scoreValEl = document.getElementById('score-val')!;
const actionHintEl = document.getElementById('action-hint')!;
const audioBtnEl = document.getElementById('audio-btn') as HTMLButtonElement;
const overlayEl = document.getElementById('overlay')!;
const overlayCardEl = document.getElementById('overlay-card')!;
const overlayTitleEl = document.getElementById('overlay-title')!;
const overlayDescEl = document.getElementById('overlay-desc')!;
const overlayStatsEl = document.getElementById('overlay-stats')!;
const restartBtnEl = document.getElementById('restart-btn') as HTMLButtonElement;

const audio = new FairyAudio();

// Scene, lighting, twilight ink-mist atmosphere
const scene = new THREE.Scene();
const baseFogColor = new THREE.Color(0x0b0e1e);
const warmFogColor = new THREE.Color(0x1f1e38);
scene.background = baseFogColor.clone();
const fog = new THREE.FogExp2(baseFogColor.getHex(), 0.022);
scene.fog = fog;

const camera = new THREE.PerspectiveCamera(
  56,
  window.innerWidth / window.innerHeight,
  0.1,
  260,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const hemiLight = new THREE.HemisphereLight(0x4a558c, 0x16192b, 0.55);
scene.add(hemiLight);

const moonLight = new THREE.DirectionalLight(0x9fb8ff, 0.75);
moonLight.position.set(-22, 42, -18);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(1024, 1024);
moonLight.shadow.camera.near = 5;
moonLight.shadow.camera.far = 120;
const dCam = 55;
moonLight.shadow.camera.left = -dCam;
moonLight.shadow.camera.right = dCam;
moonLight.shadow.camera.top = dCam;
moonLight.shadow.camera.bottom = -dCam;
scene.add(moonLight);

// --- Build Đảo Bến static environment ---
function buildIslandEnvironment(islandRadius: number): THREE.Group {
  const env = new THREE.Group();

  // Main island grass/earth disc (top at Y = 0)
  const topDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(islandRadius, islandRadius * 1.04, 3.0, 64),
    new THREE.MeshStandardMaterial({ color: 0x1b2a34, roughness: 0.92, metalness: 0.04 }),
  );
  topDisc.position.y = -1.5;
  topDisc.receiveShadow = true;
  env.add(topDisc);

  // Subtle cliff underside
  const underside = new THREE.Mesh(
    new THREE.ConeGeometry(islandRadius * 0.98, 22, 24),
    new THREE.MeshStandardMaterial({ color: 0x121826, roughness: 0.95 }),
  );
  underside.rotation.x = Math.PI;
  underside.position.y = -14;
  env.add(underside);

  // Central stone harbor plaza at (0, 0, 0)
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(5.6, 5.9, 0.14, 24),
    new THREE.MeshStandardMaterial({ color: 0x354252, roughness: 0.85 }),
  );
  plaza.position.y = 0.02;
  plaza.receiveShadow = true;
  env.add(plaza);

  // Wooden harbor pier on +Z rim
  const pierMat = new THREE.MeshStandardMaterial({ color: 0x5c422c, roughness: 0.85 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 11), pierMat);
  pier.position.set(0, 0.12, islandRadius - 3.5);
  pier.receiveShadow = true;
  env.add(pier);

  // Stylized boundary pine trees & rocks around outer ring (radius 40..54)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x473325, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1d3f3d, roughness: 0.85 });
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2e3947, roughness: 0.9 });

  for (let i = 0; i < 28; i += 1) {
    const angle = (i / 28) * Math.PI * 2 + 0.12;
    const dist = 42 + (i % 3) * 4.5;
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist;
    if (Math.abs(x) < 6 && z > 35) continue; // keep pier clear

    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.8, 7), trunkMat);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    tree.add(trunk);

    const cone1 = new THREE.Mesh(new THREE.ConeGeometry(1.7, 3.2, 7), leafMat);
    cone1.position.y = 2.9;
    cone1.castShadow = true;
    tree.add(cone1);

    const cone2 = new THREE.Mesh(new THREE.ConeGeometry(1.25, 2.5, 7), leafMat);
    cone2.position.y = 4.6;
    tree.add(cone2);

    const scale = 0.85 + (i % 4) * 0.18;
    tree.scale.setScalar(scale);
    tree.position.set(x, 0, z);
    env.add(tree);
  }

  for (let i = 0; i < 18; i += 1) {
    const angle = (i / 18) * Math.PI * 2 + 0.35;
    const dist = 33 + (i % 4) * 4.2;
    const rock = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.9 + (i % 3) * 0.45, 0),
      rockMat,
    );
    rock.position.set(Math.cos(angle) * dist, 0.4, Math.sin(angle) * dist);
    rock.scale.y = 0.65;
    rock.rotation.y = angle;
    env.add(rock);
  }

  // Starfield dome
  const starPositions: number[] = [];
  for (let i = 0; i < 360; i += 1) {
    const u = ((i * 73) % 360) * (Math.PI / 180);
    const v = 0.18 + (((i * 37) % 100) / 100) * 1.25;
    const r = 140;
    starPositions.push(
      Math.cos(u) * Math.cos(v) * r,
      Math.sin(v) * r + 10,
      Math.sin(u) * Math.cos(v) * r,
    );
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(
    starGeo,
    new THREE.PointsMaterial({ color: 0xffeec9, size: 0.9, transparent: true, opacity: 0.8 }),
  );
  env.add(stars);

  return env;
}

// Sea of drifting fairy-tale clouds around the island
const cloudGroup = new THREE.Group();
const cloudMat = new THREE.MeshStandardMaterial({
  color: 0x262b46,
  emissive: 0x121528,
  roughness: 1,
  transparent: true,
  opacity: 0.72,
});
for (let i = 0; i < 24; i += 1) {
  const angle = (i / 24) * Math.PI * 2;
  const radius = 66 + (i % 3) * 12;
  const puff = new THREE.Mesh(new THREE.SphereGeometry(7 + (i % 4) * 2.5, 12, 10), cloudMat);
  puff.scale.set(1.8, 0.45, 1.3);
  puff.position.set(Math.cos(angle) * radius, -3.5 - (i % 3) * 1.5, Math.sin(angle) * radius);
  cloudGroup.add(puff);
}
scene.add(cloudGroup);

// --- Build Mây (player character with nón lá + hanging glowing lantern) ---
interface PlayerRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  miniLanternMat: THREE.MeshStandardMaterial;
  miniLanternLight: THREE.PointLight;
  pulseRing: THREE.Mesh;
}

function buildPlayerRig(): PlayerRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  // Cloak / dress
  const cloak = new THREE.Mesh(
    new THREE.ConeGeometry(0.48, 1.15, 12),
    new THREE.MeshStandardMaterial({ color: 0x2a5473, roughness: 0.7 }),
  );
  cloak.position.y = 0.58;
  cloak.castShadow = true;
  bodyGroup.add(cloak);

  // Warm scarf collar
  const scarf = new THREE.Mesh(
    new THREE.TorusGeometry(0.24, 0.08, 8, 16),
    new THREE.MeshStandardMaterial({ color: 0xffa74d, roughness: 0.6 }),
  );
  scarf.rotation.x = Math.PI / 2;
  scarf.position.y = 1.12;
  bodyGroup.add(scarf);

  // Head
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    new THREE.MeshStandardMaterial({ color: 0xf6d5b8, roughness: 0.6 }),
  );
  head.position.y = 1.34;
  head.castShadow = true;
  bodyGroup.add(head);

  // Nón lá (Vietnamese conical hat)
  const nonLa = new THREE.Mesh(
    new THREE.ConeGeometry(0.76, 0.42, 20),
    new THREE.MeshStandardMaterial({ color: 0xdfc185, roughness: 0.8 }),
  );
  nonLa.position.y = 1.62;
  nonLa.castShadow = true;
  bodyGroup.add(nonLa);

  // Small lantern hanging from front brim of nón lá
  const stringMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.012, 0.012, 0.24, 6),
    new THREE.MeshBasicMaterial({ color: 0x8c6d46 }),
  );
  stringMesh.position.set(0, 1.34, 0.66);
  bodyGroup.add(stringMesh);

  const miniLanternMat = new THREE.MeshStandardMaterial({
    color: 0xffdf8e,
    emissive: 0xff9f33,
    emissiveIntensity: 1.4,
    roughness: 0.25,
  });
  const miniLantern = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), miniLanternMat);
  miniLantern.position.set(0, 1.18, 0.66);
  bodyGroup.add(miniLantern);

  const miniLanternLight = new THREE.PointLight(0xffb554, 10, 14, 1.6);
  miniLanternLight.position.set(0, 1.3, 0.72);
  bodyGroup.add(miniLanternLight);

  // Expanding light pulse shockwave ring
  const pulseRing = new THREE.Mesh(
    new THREE.RingGeometry(0.7, 1.0, 40),
    new THREE.MeshBasicMaterial({
      color: 0xffd275,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
    }),
  );
  pulseRing.rotation.x = -Math.PI / 2;
  pulseRing.position.y = 0.15;
  pulseRing.visible = false;
  root.add(pulseRing);

  return { root, bodyGroup, miniLanternMat, miniLanternLight, pulseRing };
}

// --- Lantern Shrine visuals ---
interface LanternVisual {
  id: string;
  group: THREE.Group;
  coreMat: THREE.MeshStandardMaterial;
  pointLight: THREE.PointLight;
  safeRing: THREE.Mesh;
  beacon: THREE.Mesh;
  pips: THREE.Mesh[];
}

function createLanternVisual(id: string, pos: [number, number, number]): LanternVisual {
  const group = new THREE.Group();
  group.position.set(pos[0], pos[1], pos[2]);

  // Stone shrine base
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(1.15, 1.35, 0.45, 8),
    new THREE.MeshStandardMaterial({ color: 0x3b4254, roughness: 0.85 }),
  );
  base.position.y = 0.22;
  base.receiveShadow = true;
  group.add(base);

  // Wooden pillar
  const post = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.3, 2.7, 10),
    new THREE.MeshStandardMaterial({ color: 0x523b2a, roughness: 0.85 }),
  );
  post.position.y = 1.55;
  post.castShadow = true;
  group.add(post);

  // Roof cap
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.2, 0.7, 6),
    new THREE.MeshStandardMaterial({ color: 0x3f2e2b, roughness: 0.8 }),
  );
  roof.position.y = 4.1;
  group.add(roof);

  // Glowing lantern paper core
  const coreMat = new THREE.MeshStandardMaterial({
    color: 0x565a6e,
    emissive: 0x222638,
    emissiveIntensity: 0.4,
    roughness: 0.35,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), coreMat);
  core.position.y = 3.2;
  group.add(core);

  const pointLight = new THREE.PointLight(0xffad42, 0, 26, 1.45);
  pointLight.position.y = 3.2;
  group.add(pointLight);

  // Safe zone ring on ground (visible when lit)
  const safeRing = new THREE.Mesh(
    new THREE.RingGeometry(DEFAULT_TUNING.safe_radius - 0.16, DEFAULT_TUNING.safe_radius, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffc663,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.42,
    }),
  );
  safeRing.rotation.x = -Math.PI / 2;
  safeRing.position.y = 0.08;
  safeRing.visible = false;
  group.add(safeRing);

  // Subtle vertical dim beacon when unlit so player can orient easily
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.08, 0.28, 16, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x99b8ff,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  beacon.position.y = 8;
  group.add(beacon);

  // Deposit progress pips around base
  const pips: THREE.Mesh[] = [];
  for (let i = 0; i < DEFAULT_TUNING.lantern_cost; i += 1) {
    const a = (i / DEFAULT_TUNING.lantern_cost) * Math.PI * 2;
    const pip = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x3b4054,
        emissive: 0x000000,
        roughness: 0.4,
      }),
    );
    pip.position.set(Math.cos(a) * 1.05, 0.62, Math.sin(a) * 1.05);
    group.add(pip);
    pips.push(pip);
  }

  return { id, group, coreMat, pointLight, safeRing, beacon, pips };
}

// --- Dynamic entity pools ---
const moteMeshes = new Map<string, THREE.Group>();
const shadeMeshes = new Map<string, { group: THREE.Group; halo: THREE.Mesh; bodyMat: THREE.MeshStandardMaterial }>();

function createMoteVisual(): THREE.Group {
  const g = new THREE.Group();
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffe484 }),
  );
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffa838, transparent: true, opacity: 0.32 }),
  );
  g.add(orb, glow);
  return g;
}

function createShadeVisual(): {
  group: THREE.Group;
  halo: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
} {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x160a24,
    emissive: 0x2c0e4a,
    emissiveIntensity: 0.7,
    roughness: 0.55,
  });

  const mainBlob = new THREE.Mesh(new THREE.SphereGeometry(0.72, 14, 12), bodyMat);
  mainBlob.castShadow = true;
  group.add(mainBlob);

  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    const wisp = new THREE.Mesh(new THREE.SphereGeometry(0.36, 10, 8), bodyMat);
    wisp.position.set(Math.cos(a) * 0.48, -0.35, Math.sin(a) * 0.48);
    group.add(wisp);
  }

  // Violet glowing eyes (spooky-cute, non-violent)
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xd966ff });
  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), eyeMat);
  eyeL.position.set(-0.22, 0.16, 0.62);
  eyeR.position.set(0.22, 0.16, 0.62);
  group.add(eyeL, eyeR);

  // Stun halo
  const halo = new THREE.Mesh(
    new THREE.TorusGeometry(0.55, 0.06, 8, 20),
    new THREE.MeshBasicMaterial({ color: 0xffe48f }),
  );
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 1.05;
  halo.visible = false;
  group.add(halo);

  return { group, halo, bodyMat };
}

// Rising golden embers when lanterns are lit (purely visual creative flair)
interface EmberParticle {
  mesh: THREE.Mesh;
  vy: number;
  life: number;
  maxLife: number;
}
const embers: EmberParticle[] = [];
const emberGeo = new THREE.SphereGeometry(0.09, 6, 6);
const emberMat = new THREE.MeshBasicMaterial({ color: 0xffcf70, transparent: true, opacity: 0.85 });

function spawnLanternEmbers(pos: [number, number, number]): void {
  for (let i = 0; i < 16; i += 1) {
    const mesh = new THREE.Mesh(emberGeo, emberMat.clone());
    const a = (i / 16) * Math.PI * 2;
    mesh.position.set(pos[0] + Math.cos(a) * 0.8, 2.8, pos[2] + Math.sin(a) * 0.8);
    scene.add(mesh);
    embers.push({
      mesh,
      vy: 2.2 + (i % 5) * 0.45,
      life: 0,
      maxLife: 1.4 + (i % 4) * 0.25,
    });
  }
}

// --- Game Lifecycle & Input ---
let world: WorldState = createWorld(2026, 1);
let islandEnv = buildIslandEnvironment(world.islandRadius);
scene.add(islandEnv);

const playerRig = buildPlayerRig();
scene.add(playerRig.root);

const lanternVisuals = new Map<string, LanternVisual>();
let pulseAnimElapsed = 99;
let camYawDeg = 0;
let isDragging = false;
let lastPointerX = 0;
let runSeed = 2026;

const keys = new Set<string>();
let queuedInteract = false;
let queuedPulse = false;
let queuedJump = false;

function rebuildLanternVisuals(): void {
  for (const v of lanternVisuals.values()) {
    scene.remove(v.group);
  }
  lanternVisuals.clear();
  for (const l of world.lanterns) {
    const vis = createLanternVisual(l.id, l.pos);
    lanternVisuals.set(l.id, vis);
    scene.add(vis.group);
  }
}

function resetGame(): void {
  runSeed += 1;
  world = createWorld(runSeed, 1);
  pulseAnimElapsed = 99;
  camYawDeg = 0;
  queuedInteract = false;
  queuedPulse = false;
  queuedJump = false;

  for (const m of moteMeshes.values()) scene.remove(m);
  moteMeshes.clear();
  for (const s of shadeMeshes.values()) scene.remove(s.group);
  shadeMeshes.clear();

  scene.remove(islandEnv);
  islandEnv = buildIslandEnvironment(world.islandRadius);
  scene.add(islandEnv);

  rebuildLanternVisuals();
  overlayEl.classList.remove('visible');
}

rebuildLanternVisuals();

window.addEventListener('keydown', (e) => {
  const code = e.code;
  if (!keys.has(code)) {
    if (code === 'Space') queuedJump = true;
    if (code === 'KeyE') queuedInteract = true;
    if (code === 'KeyF' || code === 'KeyQ') queuedPulse = true;
    if (code === 'KeyR') resetGame();
    if (code === 'KeyM') {
      audio.muted = !audio.muted;
      audioBtnEl.textContent = `Âm thanh: ${audio.muted ? 'Tắt' : 'Bật'} [M]`;
    }
  }
  keys.add(code);
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  isDragging = true;
  lastPointerX = e.clientX;
});
window.addEventListener('pointerup', () => {
  isDragging = false;
});
window.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastPointerX;
  lastPointerX = e.clientX;
  camYawDeg -= dx * 0.28;
});

audioBtnEl.addEventListener('click', () => {
  audio.muted = !audio.muted;
  audioBtnEl.textContent = `Âm thanh: ${audio.muted ? 'Tắt' : 'Bật'} [M]`;
});

restartBtnEl.addEventListener('click', () => {
  resetGame();
});

function buildLiveInput(): EffectiveInput {
  let x = 0;
  let z = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) z -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) z += 1;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;

  const input: EffectiveInput = {
    move: [x, z],
    cam_yaw_deg: camYawDeg,
    jump: queuedJump || keys.has('Space'),
    interact: queuedInteract || keys.has('KeyE'),
    pulse: queuedPulse || keys.has('KeyF') || keys.has('KeyQ'),
  };
  queuedJump = false;
  queuedInteract = false;
  queuedPulse = false;
  return input;
}

function handleEvents(events: EventRecord[]): void {
  for (const ev of events) {
    if (ev.name === 'mote_picked') {
      audio.playMotePick(Number(ev.data.carried ?? 1));
    } else if (ev.name === 'deposit') {
      audio.playDeposit();
    } else if (ev.name === 'lantern_lit') {
      audio.playLanternLit();
      const id = String(ev.data.lantern_id);
      const l = world.lanterns.find((item) => item.id === id);
      if (l) spawnLanternEmbers(l.pos);
    } else if (ev.name === 'pulse') {
      audio.playPulse();
      pulseAnimElapsed = 0;
    } else if (ev.name === 'player_hit') {
      audio.playHit();
    } else if (ev.name === 'game_over') {
      const won = ev.data.result === 'won';
      if (won) audio.playWin();
      else audio.playLose();
      showGameOverOverlay(won, String(ev.data.reason));
    }
  }
}

function showGameOverOverlay(won: boolean, reason: string): void {
  overlayCardEl.classList.toggle('lost', !won);
  overlayTitleEl.textContent = won ? 'Ánh sáng đã trở lại Đảo Bến!' : 'Đêm tối đã thắng...';
  if (reason === 'all_lit') {
    overlayDescEl.textContent = 'Mây đã thắp sáng cả 5 Đèn Lồng Lớn và đẩy lùi sương đen khỏi hòn đảo.';
  } else if (reason === 'dawn') {
    overlayDescEl.textContent = 'Thời gian Đêm 1 đã hết trước khi tất cả Đèn Lồng Lớn được thắp sáng.';
  } else {
    overlayDescEl.textContent = 'Mây đã mất hết ngọn lửa trước Bóng Mực. Hãy dùng [F] tỏa sáng và trú gần đèn sáng!';
  }

  const litCount = world.lanterns.filter((l) => l.lit).length;
  overlayStatsEl.innerHTML = `
    <div class="stat-row"><span class="stat-label">Đèn đã thắp</span><span class="stat-value">${litCount} / ${world.lanterns.length}</span></div>
    <div class="stat-row"><span class="stat-label">Thời gian còn lại</span><span class="stat-value">${Math.floor(world.timeLeftS)}s</span></div>
    <div class="stat-row"><span class="stat-label">Ngọn lửa còn lại</span><span class="stat-value">${world.player.flames}</span></div>
    <div class="stat-row"><span class="stat-label">Tổng điểm</span><span class="stat-value">${world.score}</span></div>
  `;
  overlayEl.classList.add('visible');
}

function syncVisualsAndHud(dtSec: number, nowSec: number): void {
  // Progressive island lighting based on lit lanterns (0..5)
  const litCount = world.lanterns.filter((l) => l.lit).length;
  const litRatio = litCount / Math.max(1, world.lanterns.length);
  hemiLight.intensity = 0.55 + litRatio * 0.95;
  fog.density = 0.022 - litRatio * 0.011;
  const currentBg = baseFogColor.clone().lerp(warmFogColor, litRatio);
  scene.background = currentBg;
  fog.color.copy(currentBg);

  // Rotate cloud sea gently
  cloudGroup.rotation.y = nowSec * 0.015;

  // Player mesh sync
  playerRig.root.position.set(world.player.pos[0], world.player.pos[1], world.player.pos[2]);
  playerRig.bodyGroup.rotation.y = world.player.yawRad;
  const isMoving =
    Math.abs(world.prevInput.move[0]) > 0.01 || Math.abs(world.prevInput.move[1]) > 0.01;
  playerRig.bodyGroup.position.y =
    isMoving && world.player.pos[1] <= 0.01 ? Math.abs(Math.sin(nowSec * 12)) * 0.1 : 0;

  // Blink gently during invulnerability
  playerRig.bodyGroup.visible =
    world.player.invulnTicks <= 0 || Math.floor(world.player.invulnTicks / 6) % 2 === 0;

  // Hanging lantern glows stronger with carried fireflies
  playerRig.miniLanternLight.intensity = 8 + world.player.carried * 3.5;
  playerRig.miniLanternMat.emissiveIntensity = 1.0 + world.player.carried * 0.45;

  // Pulse shockwave animation
  if (pulseAnimElapsed < 0.45) {
    pulseAnimElapsed += dtSec;
    const t = Math.min(1, pulseAnimElapsed / 0.45);
    const radius = 0.5 + t * DEFAULT_TUNING.pulse_radius;
    playerRig.pulseRing.visible = true;
    playerRig.pulseRing.scale.setScalar(radius);
    (playerRig.pulseRing.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.85;
  } else {
    playerRig.pulseRing.visible = false;
  }

  // Sync lanterns
  let nearUnlitLantern: { id: string; needed: number } | null = null;
  for (const l of world.lanterns) {
    const vis = lanternVisuals.get(l.id);
    if (!vis) continue;
    vis.group.position.set(l.pos[0], l.pos[1], l.pos[2]);

    if (l.lit) {
      vis.coreMat.color.setHex(0xffe094);
      vis.coreMat.emissive.setHex(0xff9924);
      vis.coreMat.emissiveIntensity = 2.0 + Math.sin(nowSec * 3.5 + l.pos[0]) * 0.25;
      vis.pointLight.intensity = 34;
      vis.safeRing.visible = true;
      vis.beacon.visible = false;
    } else {
      vis.coreMat.color.setHex(0x52576b);
      vis.coreMat.emissive.setHex(0x28324a);
      vis.coreMat.emissiveIntensity = 0.45;
      vis.pointLight.intensity = 0;
      vis.safeRing.visible = false;
      vis.beacon.visible = true;

      if (distXZ(world.player.pos, l.pos) <= DEFAULT_TUNING.interact_radius) {
        nearUnlitLantern = { id: l.id, needed: Math.max(0, DEFAULT_TUNING.lantern_cost - l.deposited) };
      }
    }

    vis.pips.forEach((pip, idx) => {
      const mat = pip.material as THREE.MeshStandardMaterial;
      const filled = idx < l.deposited || l.lit;
      mat.color.setHex(filled ? 0xffd573 : 0x3b4054);
      mat.emissive.setHex(filled ? 0xff9b2e : 0x000000);
      mat.emissiveIntensity = filled ? 1.4 : 0;
    });
  }

  // Sync firefly motes
  const activeMoteIds = new Set(world.motes.map((m) => m.id));
  for (const [id, mesh] of moteMeshes.entries()) {
    if (!activeMoteIds.has(id)) {
      scene.remove(mesh);
      moteMeshes.delete(id);
    }
  }
  for (const m of world.motes) {
    let mesh = moteMeshes.get(m.id);
    if (!mesh) {
      mesh = createMoteVisual();
      moteMeshes.set(m.id, mesh);
      scene.add(mesh);
    }
    const phase = m.pos[0] * 0.7 + m.pos[2] * 0.5;
    // Display-only float height; logical position remains Y = 0
    mesh.position.set(m.pos[0], 0.95 + Math.sin(nowSec * 3.2 + phase) * 0.25, m.pos[2]);
  }

  // Sync Shades (Bóng Mực)
  const activeShadeIds = new Set(world.shades.map((s) => s.id));
  for (const [id, item] of shadeMeshes.entries()) {
    if (!activeShadeIds.has(id)) {
      scene.remove(item.group);
      shadeMeshes.delete(id);
    }
  }
  for (const s of world.shades) {
    let item = shadeMeshes.get(s.id);
    if (!item) {
      item = createShadeVisual();
      shadeMeshes.set(s.id, item);
      scene.add(item.group);
    }
    const bob = Math.sin(nowSec * 4.5 + s.pos[0]) * 0.14;
    item.group.position.set(s.pos[0], s.pos[1] + bob, s.pos[2]);
    if (s.state === 'stunned') {
      item.halo.visible = true;
      item.group.rotation.y += dtSec * 6;
      item.bodyMat.emissive.setHex(0x6b4ca8);
    } else {
      item.halo.visible = false;
      item.bodyMat.emissive.setHex(0x2c0e4a);
      item.group.lookAt(world.player.pos[0], s.pos[1] + bob, world.player.pos[2]);
    }
  }

  // Update rising lantern embers
  for (let i = embers.length - 1; i >= 0; i -= 1) {
    const p = embers[i]!;
    p.life += dtSec;
    p.mesh.position.y += p.vy * dtSec;
    const mat = p.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = Math.max(0, 1 - p.life / p.maxLife);
    if (p.life >= p.maxLife) {
      scene.remove(p.mesh);
      mat.dispose();
      embers.splice(i, 1);
    }
  }

  // Third-person camera following Mây based on camYawDeg
  const theta = (camYawDeg * Math.PI) / 180;
  const camDist = 11.5;
  const camHeight = 6.2;
  const targetCamX = world.player.pos[0] + Math.sin(theta) * camDist;
  const targetCamZ = world.player.pos[2] + Math.cos(theta) * camDist;
  camera.position.lerp(
    new THREE.Vector3(targetCamX, world.player.pos[1] + camHeight, targetCamZ),
    Math.min(1, dtSec * 8),
  );
  camera.lookAt(world.player.pos[0], world.player.pos[1] + 1.4, world.player.pos[2]);

  // HUD updates
  lanternsValEl.textContent = `${litCount} / ${world.lanterns.length}`;
  carriedValEl.textContent = `${world.player.carried} / ${DEFAULT_TUNING.carry_capacity}`;
  flamesValEl.textContent =
    world.player.flames > 0 ? '🔥'.repeat(world.player.flames) : 'Tắt lửa';

  if (world.player.pulseCooldownTicks > 0) {
    pulseValEl.textContent = `Hồi ${(world.player.pulseCooldownTicks / TICK_RATE).toFixed(1)}s`;
  } else if (world.player.carried < DEFAULT_TUNING.pulse_cost) {
    pulseValEl.textContent = `Cần ${DEFAULT_TUNING.pulse_cost} đom đóm`;
  } else {
    pulseValEl.textContent = 'Sẵn sàng';
  }

  const totalSec = Math.ceil(world.timeLeftS);
  const mins = String(Math.floor(totalSec / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  timerValEl.textContent = `${mins}:${secs}`;
  scoreValEl.textContent = `Điểm: ${world.score}`;

  if (nearUnlitLantern && world.state === 'playing') {
    if (world.player.carried > 0) {
      actionHintEl.textContent = `Nhấn [E] để nạp đom đóm vào Đèn ${nearUnlitLantern.id} (còn cần ${nearUnlitLantern.needed})`;
    } else {
      actionHintEl.textContent = `Đèn ${nearUnlitLantern.id} cần thêm ${nearUnlitLantern.needed} đom đóm — hãy đi gom đom đóm!`;
    }
    actionHintEl.classList.add('visible');
  } else {
    actionHintEl.classList.remove('visible');
  }
}

// Fixed-timestep simulation loop (60 Hz)
let accumulator = 0;
let lastFrameMs = performance.now();

function animate(nowMs: number): void {
  requestAnimationFrame(animate);
  const dtSec = Math.min((nowMs - lastFrameMs) / 1000, 0.1);
  lastFrameMs = nowMs;

  if (keys.has('KeyJ')) camYawDeg += 95 * dtSec;
  if (keys.has('KeyL')) camYawDeg -= 95 * dtSec;

  accumulator += dtSec;
  while (accumulator >= FIXED_DT) {
    if (world.state === 'playing') {
      const input = buildLiveInput();
      const events = stepWorld(world, input, DEFAULT_TUNING);
      handleEvents(events);
    }
    accumulator -= FIXED_DT;
  }

  syncVisualsAndHud(dtSec, nowMs / 1000);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(animate);
