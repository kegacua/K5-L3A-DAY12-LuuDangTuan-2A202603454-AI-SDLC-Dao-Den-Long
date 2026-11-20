import * as THREE from 'three';
import { createHelloWorld, stepHelloWorld } from '../core/hello.js';

const container = document.getElementById('app');
const hudState = document.getElementById('hud-state');

if (!container) {
  throw new Error('Missing #app mount element');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);
scene.fog = new THREE.FogExp2(0x0b1020, 0.045);

const camera = new THREE.PerspectiveCamera(
  55,
  window.innerWidth / window.innerHeight,
  0.1,
  100,
);
camera.position.set(0, 5.2, 8.5);
camera.lookAt(0, 1.2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// Ambient twilight + lantern glow
scene.add(new THREE.AmbientLight(0x3a4a7a, 0.9));

const lanternLight = new THREE.PointLight(0xffb84d, 18, 22, 1.6);
lanternLight.position.set(0, 2.2, 0);
scene.add(lanternLight);

// Island ground disc
const islandGeo = new THREE.CylinderGeometry(5.2, 5.8, 0.8, 32);
const islandMat = new THREE.MeshStandardMaterial({
  color: 0x1f2d3d,
  roughness: 0.85,
  metalness: 0.05,
});
const island = new THREE.Mesh(islandGeo, islandMat);
island.position.y = -0.4;
scene.add(island);

// Central Great Lantern pillar + glowing core
const post = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.25, 1.8, 12),
  new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 0.8 }),
);
post.position.y = 0.9;
scene.add(post);

const lanternCore = new THREE.Mesh(
  new THREE.OctahedronGeometry(0.55, 0),
  new THREE.MeshStandardMaterial({
    color: 0xffd479,
    emissive: 0xff9f2e,
    emissiveIntensity: 1.5,
    roughness: 0.25,
  }),
);
lanternCore.position.y = 2.2;
scene.add(lanternCore);

// Orbiting Firefly driven by pure deterministic src/core/hello.ts
const fireflyMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.18, 16, 16),
  new THREE.MeshBasicMaterial({ color: 0xfff3a8 }),
);
scene.add(fireflyMesh);

const fireflyLight = new THREE.PointLight(0xffe680, 6, 8, 1.5);
scene.add(fireflyLight);

const FIXED_DT = 1 / 60;
let world = createHelloWorld();
let accumulator = 0;
let lastFrameMs = performance.now();

function animate(nowMs: number): void {
  requestAnimationFrame(animate);
  const deltaSec = Math.min((nowMs - lastFrameMs) / 1000, 0.1);
  lastFrameMs = nowMs;

  accumulator += deltaSec;
  while (accumulator >= FIXED_DT) {
    world = stepHelloWorld(world, FIXED_DT);
    accumulator -= FIXED_DT;
  }

  fireflyMesh.position.set(world.fireflyPos.x, world.fireflyPos.y, world.fireflyPos.z);
  fireflyLight.position.copy(fireflyMesh.position);
  lanternCore.rotation.y = world.time * 0.6;

  if (hudState) {
    hudState.textContent =
      `Tick: ${world.tick} | Time: ${world.time.toFixed(2)}s | ` +
      `Firefly: (${world.fireflyPos.x.toFixed(2)}, ${world.fireflyPos.y.toFixed(2)}, ${world.fireflyPos.z.toFixed(2)})`;
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(animate);
