import * as THREE from 'three';
import {
  ARENA,
  WEAPONS,
  THROWABLES,
  MAPS,
  MAP_BOXES,
  SPAWN_POINTS,
  getMap,
  rayBoxIntersect,
  raycastMap,
  resolvePlayerPhysics,
  stepThrowablePhysics
} from './shared.js';

// --- PROCEDURAL AUDIO SYNTH (Zero external assets required) ---
class SoundFX {
  constructor() {
    this.ctx = null;
  }
  init() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }
  playShot(weaponId, dist = 0) {
    if (!this.ctx) return;
    const vol = Math.max(0.04, Math.min(0.45, 0.45 * (1 - dist / 140)));
    const now = this.ctx.currentTime;

    // Noise burst for gunshot crack
    const dur = weaponId === 'AWM' ? 0.28 : weaponId === 'S12K' ? 0.22 : 0.11;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.28));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value =
      weaponId === 'AWM' ? 650 : weaponId === 'AKM' ? 900 : weaponId === 'S12K' ? 750 : 1250;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }
  playHit(headshot = false) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = headshot ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(headshot ? 1550 : 720, now);
    osc.frequency.exponentialRampToValueAtTime(headshot ? 2200 : 320, now + 0.08);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);
  }
  playReload() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.setValueAtTime(520, now + 0.06);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }
  playDeath() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.42);
    gain.gain.setValueAtTime(0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  }
  playRespawn() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(660, now + 0.08);
    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.24);
  }
  playThrow() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, now);
    osc.frequency.exponentialRampToValueAtTime(210, now + 0.14);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  }
  playExplosion(kind = 'GRENADE', dist = 0) {
    if (!this.ctx) return;
    const vol = Math.max(0.06, Math.min(0.75, 0.75 * (1 - dist / 120)));
    const now = this.ctx.currentTime;
    const dur = kind === 'GRENADE' ? 0.65 : 0.35;
    const bufSize = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.32));
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = kind === 'GRENADE' ? 'lowpass' : 'bandpass';
    filter.frequency.value = kind === 'GRENADE' ? 320 : 1600;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
  }
  playFlashTinnitus(durationMs = 2200) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const dur = Math.min(3.5, durationMs / 1000);
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(3650, now);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + dur);
  }
}

const sfx = new SoundFX();

// --- PROCEDURAL TEXTURES ---
function makeFloorTexture(baseHex = '#252a32', gridHex = '#2f3640') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = gridHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.035)';
  ctx.beginPath();
  ctx.moveTo(128, 0);
  ctx.lineTo(128, 256);
  ctx.moveTo(0, 128);
  ctx.lineTo(256, 128);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(28, 38);
  return tex;
}

function makeContainerTexture(hexColor) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(hexColor);
  ctx.fillStyle = `#${col.getHexString()}`;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < 128; x += 16) {
    ctx.fillRect(x, 0, 6, 128);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 124, 124);
  return new THREE.CanvasTexture(c);
}

function makeStoneTexture(hexColor) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(hexColor);
  ctx.fillStyle = `#${col.getHexString()}`;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  for (let y = 0; y < 128; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
    const offset = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offset; x < 128; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + 32);
      ctx.stroke();
    }
  }
  return new THREE.CanvasTexture(c);
}

// --- THREE.JS SCENE SETUP ---
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x18222f);
scene.fog = new THREE.FogExp2(0x18222f, 0.0022);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 800);
scene.add(camera);

const hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x334155, 0.85);
scene.add(hemiLight);

const dirLight = new THREE.DirectionalLight(0xfff7ed, 1.15);
dirLight.position.set(38, 68, 32);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(2048, 2048);
dirLight.shadow.camera.left = -65;
dirLight.shadow.camera.right = 65;
dirLight.shadow.camera.top = 65;
dirLight.shadow.camera.bottom = -65;
scene.add(dirLight);

// Ground Plane + Team Zone Markings
const groundGeo = new THREE.PlaneGeometry(ARENA.width, ARENA.depth);
const groundMat = new THREE.MeshStandardMaterial({
  map: makeFloorTexture(),
  roughness: 0.88,
  metalness: 0.1
});
const groundMesh = new THREE.Mesh(groundGeo, groundMat);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Blue & Red Base Floor Stripes
const stripeGeo = new THREE.PlaneGeometry(ARENA.width - 2, 1.2);
const blueStripe = new THREE.Mesh(
  stripeGeo,
  new THREE.MeshBasicMaterial({ color: 0x3b82f6, side: THREE.DoubleSide })
);
blueStripe.rotation.x = -Math.PI / 2;
blueStripe.position.set(0, 0.02, -42);
scene.add(blueStripe);

const redStripe = new THREE.Mesh(
  stripeGeo,
  new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide })
);
redStripe.rotation.x = -Math.PI / 2;
redStripe.position.set(0, 0.02, 42);
scene.add(redStripe);

// Dynamic Arena Map Builder
const mapGroup = new THREE.Group();
scene.add(mapGroup);
const texCache = new Map();
let currentMap = 'WAREHOUSE';

function buildArenaMap(mapId) {
  const cfg = getMap(mapId);
  currentMap = cfg.id;

  scene.background.setHex(cfg.skyColor);
  scene.fog.color.setHex(cfg.fogColor);
  scene.fog.density = cfg.fogDensity;

  if (groundMat.map) groundMat.map.dispose();
  groundMat.map = makeFloorTexture(cfg.floorBase, cfg.floorGrid);
  groundMat.needsUpdate = true;

  while (mapGroup.children.length) {
    const ch = mapGroup.children[0];
    mapGroup.remove(ch);
    if (ch.geometry) ch.geometry.dispose();
  }

  const isRuins = cfg.id === 'RUINS';
  for (const b of cfg.boxes) {
    const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
    let mat;
    if (b.tag === 'container' || b.tag === 'crate') {
      const key = `${isRuins ? 'stone' : 'cont'}_${b.color}`;
      if (!texCache.has(key)) {
        texCache.set(key, isRuins ? makeStoneTexture(b.color) : makeContainerTexture(b.color));
      }
      mat = new THREE.MeshStandardMaterial({
        map: texCache.get(key),
        roughness: isRuins ? 0.85 : 0.65,
        metalness: isRuins ? 0.08 : 0.25
      });
    } else if (isRuins) {
      const key = `stone_${b.color}`;
      if (!texCache.has(key)) {
        texCache.set(key, makeStoneTexture(b.color));
      }
      mat = new THREE.MeshStandardMaterial({
        map: texCache.get(key),
        roughness: 0.88,
        metalness: 0.05
      });
    } else {
      mat = new THREE.MeshStandardMaterial({
        color: b.color,
        roughness: 0.8,
        metalness: 0.15
      });
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(b.x, b.y + b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mapGroup.add(mesh);
  }

  if (cfg.roofBeams) {
    const beamGeo = new THREE.BoxGeometry(44, 0.45, 0.8);
    const beamMat = new THREE.MeshStandardMaterial({ color: 0x333942, metalness: 0.6, roughness: 0.4 });
    for (let z = -22; z <= 22; z += 7.3) {
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(0, 7.6, z);
      beam.castShadow = true;
      mapGroup.add(beam);
    }
  }

  document.querySelectorAll('#map-select .seg-btn').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-map') === currentMap);
  });
  const sbTitleEl = document.getElementById('sb-title');
  if (sbTitleEl) sbTitleEl.textContent = `${cfg.name.toUpperCase()} TDM — SCOREBOARD`;
}

buildArenaMap('WAREHOUSE');

// --- FIRST-PERSON VIEWMODEL GUN ---
const fpGunGroup = new THREE.Group();
camera.add(fpGunGroup);

let muzzleFlashMesh = null;
function rebuildFpGun(weaponId) {
  while (fpGunGroup.children.length) fpGunGroup.remove(fpGunGroup.children[0]);
  const wep = WEAPONS[weaponId] || WEAPONS.M416;
  const isAkm = wep.id === 'AKM';
  const isAwm = Boolean(wep.sniper);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: wep.color,
    roughness: isAkm ? 0.55 : 0.4,
    metalness: isAkm ? 0.45 : 0.68
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x16191d,
    roughness: 0.48,
    metalness: 0.82
  });
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    roughness: 0.3,
    metalness: 0.9
  });
  const woodMat = new THREE.MeshStandardMaterial({
    color: 0x6e3b1e,
    roughness: 0.65,
    metalness: 0.1
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x1e242c,
    roughness: 0.8,
    metalness: 0.1
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd9a985,
    roughness: 0.65
  });
  const sleeveMat = new THREE.MeshStandardMaterial({
    color: 0x263142,
    roughness: 0.85
  });

  // Upper & Lower Receiver
  const upperRec = new THREE.Mesh(
    new THREE.BoxGeometry(0.068, 0.068, isAwm ? 0.48 : 0.38),
    isAkm ? darkMat : bodyMat
  );
  upperRec.position.set(0, 0.02, 0);
  fpGunGroup.add(upperRec);

  const lowerRec = new THREE.Mesh(
    new THREE.BoxGeometry(0.062, 0.056, 0.28),
    darkMat
  );
  lowerRec.position.set(0, -0.032, 0.02);
  fpGunGroup.add(lowerRec);

  // Ejection port & metallic bolt carrier on right side
  const boltCarrier = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.026, 0.095), steelMat);
  boltCarrier.position.set(0.033, 0.022, -0.02);
  fpGunGroup.add(boltCarrier);

  // Handguard / Forend
  const hgLen = isAwm ? 0.36 : 0.28;
  const handguard = new THREE.Mesh(
    new THREE.BoxGeometry(0.058, 0.064, hgLen),
    isAkm ? woodMat : bodyMat
  );
  handguard.position.set(0, 0.012, -0.18 - hgLen / 2);
  fpGunGroup.add(handguard);

  // Picatinny top rail ribs
  for (let z = -0.14; z <= 0.12; z += 0.032) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.044, 0.01, 0.014), darkMat);
    rib.position.set(0, 0.058, z);
    fpGunGroup.add(rib);
  }

  // Barrel + Gas Tube / Fluting
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(isAwm ? 0.018 : 0.014, isAwm ? 0.022 : 0.016, wep.barrelLen, 14),
    darkMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.022, -wep.barrelLen / 2 - 0.14);
  fpGunGroup.add(barrel);

  if (isAkm) {
    // AKM Gas tube + triangular front iron sight
    const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.28, 10), darkMat);
    gasTube.rotation.x = Math.PI / 2;
    gasTube.position.set(0, 0.046, -0.32);
    const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.052, 0.024), darkMat);
    frontPost.position.set(0, 0.048, -wep.barrelLen - 0.06);
    fpGunGroup.add(gasTube, frontPost);
  } else if (isAwm) {
    // AWM Bolt handle + knob & folded bipod
    const boltStem = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.055, 8), steelMat);
    boltStem.rotation.z = Math.PI / 3;
    boltStem.position.set(0.046, 0.01, 0.09);
    const boltKnob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), darkMat);
    boltKnob.position.set(0.068, -0.004, 0.09);
    const bipodL = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.22, 8), darkMat);
    bipodL.rotation.x = Math.PI / 2;
    bipodL.position.set(-0.024, -0.028, -0.38);
    const bipodR = bipodL.clone();
    bipodR.position.x = 0.024;
    fpGunGroup.add(boltStem, boltKnob, bipodL, bipodR);
  } else {
    // M416 Tactical vertical foregrip + laser box
    const foregrip = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.095, 10), darkMat);
    foregrip.position.set(0, -0.062, -0.31);
    const peqBox = new THREE.Mesh(new THREE.BoxGeometry(0.042, 0.024, 0.075), darkMat);
    peqBox.position.set(0.032, 0.036, -0.34);
    fpGunGroup.add(foregrip, peqBox);
  }

  // Muzzle Brake / Compensator
  const muzzleBrake = new THREE.Mesh(
    isAwm
      ? new THREE.BoxGeometry(0.042, 0.034, 0.075)
      : new THREE.CylinderGeometry(0.021, 0.021, 0.065, 12),
    steelMat
  );
  if (!isAwm) muzzleBrake.rotation.x = Math.PI / 2;
  muzzleBrake.position.set(0, 0.022, -wep.barrelLen - 0.15);
  fpGunGroup.add(muzzleBrake);

  // Pistol Grip & Trigger Guard
  const pGrip = new THREE.Mesh(
    new THREE.BoxGeometry(0.044, 0.115, 0.052),
    isAkm ? woodMat : darkMat
  );
  pGrip.position.set(0, -0.1, 0.11);
  pGrip.rotation.x = -0.28;
  const trigGuard = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.032, 0.055), darkMat);
  trigGuard.position.set(0, -0.068, 0.06);
  fpGunGroup.add(pGrip, trigGuard);

  // Buttstock + Cheek Rest
  const stock = new THREE.Mesh(
    new THREE.BoxGeometry(0.054, 0.088, 0.24),
    isAkm ? woodMat : bodyMat
  );
  stock.position.set(0, -0.008, 0.28);
  const buttPad = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.105, 0.025), darkMat);
  buttPad.position.set(0, -0.012, 0.4);
  fpGunGroup.add(stock, buttPad);

  // Magazine
  if (isAkm) {
    // Curved 7.62 banana mag
    const magUpper = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.11, 0.078), woodMat);
    magUpper.position.set(0, -0.095, -0.055);
    magUpper.rotation.x = 0.18;
    const magLower = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.11, 0.076), woodMat);
    magLower.position.set(0, -0.18, -0.088);
    magLower.rotation.x = 0.42;
    fpGunGroup.add(magUpper, magLower);
  } else {
    const mag = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, isAwm ? 0.11 : 0.18, isAwm ? 0.11 : 0.078),
      darkMat
    );
    mag.position.set(0, isAwm ? -0.085 : -0.125, -0.055);
    mag.rotation.x = isAwm ? 0.04 : 0.18;
    fpGunGroup.add(mag);
  }

  // First-Person Tactical Gloved Hands & Forearms
  const leftArmGroup = new THREE.Group();
  leftArmGroup.position.set(-0.048, -0.065, -0.26);
  const leftSleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.044, 0.28, 10), sleeveMat);
  leftSleeve.rotation.x = Math.PI / 2.3;
  leftSleeve.rotation.z = -0.32;
  leftSleeve.position.set(-0.06, -0.05, 0.14);
  const leftGlove = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.052, 0.075), gloveMat);
  const leftFingers = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.038, 0.045), skinMat);
  leftFingers.position.set(0.015, 0.01, -0.025);
  leftArmGroup.add(leftSleeve, leftGlove, leftFingers);
  fpGunGroup.add(leftArmGroup);

  const rightHand = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.058, 0.068), gloveMat);
  rightHand.position.set(0.008, -0.088, 0.11);
  rightHand.rotation.x = -0.25;
  fpGunGroup.add(rightHand);

  // Sight / Scope (8x Sniper Scope for AWM, 3D Reflex Sight for M416 & AKM)
  if (isAwm) {
    const mountF = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.032, 0.024), darkMat);
    mountF.position.set(0, 0.068, -0.09);
    const mountR = mountF.clone();
    mountR.position.z = 0.03;

    const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 14), darkMat);
    scopeTube.rotation.x = Math.PI / 2;
    scopeTube.position.set(0, 0.096, -0.03);

    const objBell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.022, 0.075, 16), darkMat);
    objBell.rotation.x = Math.PI / 2;
    objBell.position.set(0, 0.096, -0.17);

    const eyeBell = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.06, 16), darkMat);
    eyeBell.rotation.x = Math.PI / 2;
    eyeBell.position.set(0, 0.096, 0.1);

    const turretTop = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.022, 10), steelMat);
    turretTop.position.set(0, 0.12, -0.03);
    fpGunGroup.add(mountF, mountR, scopeTube, objBell, eyeBell, turretTop);
  } else {
    const rdsBase = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.018, 0.095), darkMat);
    rdsBase.position.set(0, 0.062, -0.02);
    fpGunGroup.add(rdsBase);

    const rdsLeft = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.044, 0.048), darkMat);
    rdsLeft.position.set(-0.024, 0.09, -0.02);
    const rdsRight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.044, 0.048), darkMat);
    rdsRight.position.set(0.024, 0.09, -0.02);
    const rdsTop = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.006, 0.048), darkMat);
    rdsTop.position.set(0, 0.112, -0.02);
    fpGunGroup.add(rdsLeft, rdsRight, rdsTop);

    const rdsDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0032, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff1e1e })
    );
    rdsDot.position.set(0, 0.091, -0.02);
    fpGunGroup.add(rdsDot);
  }

  // Multi-fin Muzzle Flash
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0,
    side: THREE.DoubleSide
  });
  muzzleFlashMesh = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.24, 6), flashMat);
  muzzleFlashMesh.rotation.x = -Math.PI / 2;
  muzzleFlashMesh.position.set(0, 0.022, -wep.barrelLen - 0.24);
  const flashCross1 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  const flashCross2 = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flashCross2.rotation.y = Math.PI / 2;
  muzzleFlashMesh.add(flashCross1, flashCross2);
  fpGunGroup.add(muzzleFlashMesh);

  fpGunGroup.position.set(0.24, -0.22, -0.42);
}

rebuildFpGun('M416');

// --- REMOTE PLAYER 3D AVATARS ---
const remoteAvatars = new Map();

function makeNameSprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.1, 0.52, 1);
  sprite.position.set(0, 2.15, 0);
  return { sprite, canvas, tex };
}

function updateNameSprite(avatar, name, hp, isEnemy) {
  const key = `${name}_${hp}_${isEnemy}`;
  if (avatar.lastBadgeKey === key) return;
  avatar.lastBadgeKey = key;

  const ctx = avatar.badgeCanvas.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);

  // Name background
  ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
  ctx.fillRect(28, 6, 200, 48);

  ctx.font = 'bold 20px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = isEnemy ? '#ff6b6b' : '#58a6ff';
  ctx.fillText(name, 128, 28);

  // Health bar
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(44, 36, 168, 10);
  ctx.fillStyle = isEnemy ? '#ef4444' : '#22c55e';
  ctx.fillRect(44, 36, Math.max(0, (hp / 100) * 168), 10);

  avatar.badgeTex.needsUpdate = true;
}

function createSoldierAvatar(teamColorHex) {
  const group = new THREE.Group();

  const teamMat = new THREE.MeshStandardMaterial({ color: teamColorHex, roughness: 0.45, metalness: 0.2 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x222730, roughness: 0.65, metalness: 0.15 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe2b897, roughness: 0.6 });
  const pantMat = new THREE.MeshStandardMaterial({ color: 0x313b48, roughness: 0.8 });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x16191f, roughness: 0.7, metalness: 0.25 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x181b20, roughness: 0.4, metalness: 0.78 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.2, metalness: 0.9 });

  // Articulated Hip-Pivoting Legs (Thigh + Knee Pad + Boot)
  function buildLeg(side) {
    const legPivot = new THREE.Group();
    legPivot.position.set(side * 0.145, 0.74, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.36, 0.23), pantMat);
    thigh.position.set(0, -0.18, 0);
    thigh.castShadow = true;

    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.06), bootMat);
    kneePad.position.set(0, -0.35, -0.11);

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.28, 0.21), pantMat);
    shin.position.set(0, -0.46, 0);
    shin.castShadow = true;

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.15, 0.29), bootMat);
    boot.position.set(0, -0.665, -0.03);
    boot.castShadow = true;

    legPivot.add(thigh, kneePad, shin, boot);
    return legPivot;
  }

  const leftLeg = buildLeg(-1);
  const rightLeg = buildLeg(1);
  group.add(leftLeg, rightLeg);

  // Pelvis & Tactical Utility Belt
  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.28), pantMat);
  pelvis.position.set(0, 0.76, 0);
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.53, 0.08, 0.31), bootMat);
  belt.position.set(0, 0.82, 0);
  group.add(pelvis, belt);

  // Torso, Armored Plate Carrier, Mag Pouches & Backpack
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.58, 0.28), pantMat);
  torso.position.set(0, 1.11, 0);
  torso.castShadow = true;

  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.48, 0.33), vestMat);
  vest.position.set(0, 1.11, 0);
  vest.castShadow = true;

  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.16), vestMat);
  backpack.position.set(0, 1.12, 0.22);
  backpack.castShadow = true;

  for (let i = -1; i <= 1; i++) {
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.15, 0.06), bootMat);
    pouch.position.set(i * 0.14, 0.99, -0.18);
    group.add(pouch);
  }
  group.add(torso, vest, backpack);

  // Team Identification Chest Band + Shoulder Pauldrons
  const chestBand = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.35), teamMat);
  chestBand.position.set(0, 1.21, 0);
  const padL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.26), teamMat);
  padL.position.set(-0.34, 0.06, 0);
  const padR = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.26), teamMat);
  padR.position.set(0.34, 0.06, 0);
  chestBand.add(padL, padR);
  group.add(chestBand);

  // Neck, Head, Balaclava & Level-3 Spetsnaz Helmet with Visor
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.56, 0);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.12, 10), bootMat);
  neck.position.set(0, -0.16, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), skinMat);
  const balaclava = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.16, 0.33), bootMat);
  balaclava.position.set(0, -0.08, 0);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, 0.39), teamMat);
  helmet.position.set(0, 0.09, 0.01);
  const visorShield = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.16, 0.06), bootMat);
  visorShield.position.set(0, -0.04, -0.19);
  const visorSlit = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.07), visorMat);
  visorSlit.position.set(0, -0.03, -0.19);
  helmet.add(visorShield, visorSlit);

  headGroup.add(neck, head, balaclava, helmet);
  group.add(headGroup);

  // Articulated Arms + Detailed 3rd-Person Rifle
  const armGroup = new THREE.Group();
  armGroup.position.set(0, 1.24, 0);

  const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.44), pantMat);
  rArm.position.set(0.31, -0.08, -0.16);
  const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.48), pantMat);
  lArm.position.set(-0.22, -0.09, -0.22);
  lArm.rotation.y = -0.38;

  const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), bootMat);
  rHand.position.set(0.26, -0.09, -0.36);

  const rifleRec = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.48), gunMat);
  rifleRec.position.set(0.24, -0.06, -0.34);
  const rifleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.42, 8), gunMat);
  rifleBarrel.rotation.x = Math.PI / 2;
  rifleBarrel.position.set(0.24, -0.04, -0.72);
  const rifleMag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.18, 0.08), gunMat);
  rifleMag.position.set(0.24, -0.17, -0.38);
  rifleMag.rotation.x = 0.22;
  const rifleStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.1, 0.22), gunMat);
  rifleStock.position.set(0.24, -0.08, -0.04);

  armGroup.add(rArm, lArm, rHand, rifleRec, rifleBarrel, rifleMag, rifleStock);
  group.add(armGroup);

  // Spawn shield ring
  const shieldRing = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.68, 24),
    new THREE.MeshBasicMaterial({ color: 0x38bdf8, side: THREE.DoubleSide })
  );
  shieldRing.rotation.x = -Math.PI / 2;
  shieldRing.position.y = 0.05;
  shieldRing.visible = false;
  group.add(shieldRing);

  const badge = makeNameSprite();
  group.add(badge.sprite);

  scene.add(group);
  return {
    group,
    leftLeg,
    rightLeg,
    armGroup,
    chestBand,
    helmet,
    shieldRing,
    badgeCanvas: badge.canvas,
    badgeTex: badge.tex,
    lastBadgeKey: '',
    targetPos: new THREE.Vector3(),
    targetYaw: 0,
    targetPitch: 0,
    crouch: false,
    walkPhase: 0
  };
}

// --- BULLET TRACERS, THROWABLES & EXPLOSION EFFECTS ---
const activeEffects = [];
const activeThrowables = new Map();
const activeExplosions = [];

function spawnThrowableMesh(msg) {
  const group = new THREE.Group();
  const isFrag = msg.kind === 'GRENADE';
  if (isFrag) {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 14, 14),
      new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.4, metalness: 0.35 })
    );
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.185, 0.185, 0.08, 12),
      new THREE.MeshBasicMaterial({ color: 0xfacc15 })
    );
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff3300 })
    );
    beacon.position.y = 0.2;
    group.add(body, band, beacon);
  } else {
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.34, 14),
      new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.25, metalness: 0.75 })
    );
    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    const beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0x00ffff })
    );
    beacon.position.y = 0.2;
    group.add(body, band, beacon);
  }
  group.position.set(msg.x, msg.y, msg.z);
  scene.add(group);

  const trailPts = [new THREE.Vector3(msg.x, msg.y, msg.z), new THREE.Vector3(msg.x, msg.y, msg.z)];
  const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
  const trailMat = new THREE.LineBasicMaterial({
    color: isFrag ? 0xff6b00 : 0x38bdf8,
    transparent: true,
    opacity: 0.75
  });
  const trailLine = new THREE.Line(trailGeo, trailMat);
  scene.add(trailLine);

  activeThrowables.set(msg.id, {
    id: msg.id,
    kind: msg.kind,
    mesh: group,
    trailLine,
    trailPts: [new THREE.Vector3(msg.x, msg.y, msg.z)],
    x: msg.x,
    y: msg.y,
    z: msg.z,
    vx: msg.vx,
    vy: msg.vy,
    vz: msg.vz,
    born: performance.now(),
    fuseMs: msg.fuseMs || 1750
  });
}

function spawnExplosionEffect(kind, x, y, z) {
  const isFrag = kind === 'GRENADE';
  const group = new THREE.Group();
  group.position.set(x, y + 0.3, z);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 16, 16),
    new THREE.MeshBasicMaterial({
      color: isFrag ? 0xfffbeb : 0xffffff,
      transparent: true,
      opacity: 1.0
    })
  );
  const outer = new THREE.Mesh(
    new THREE.SphereGeometry(1.15, 18, 18),
    new THREE.MeshBasicMaterial({
      color: isFrag ? 0xff4500 : 0x7dd3fc,
      transparent: true,
      opacity: 0.88
    })
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.5, 1.25, 24),
    new THREE.MeshBasicMaterial({
      color: isFrag ? 0xfbbf24 : 0xffffff,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    })
  );
  ring.rotation.x = Math.PI / 2;
  group.add(core, outer, ring);
  scene.add(group);

  activeExplosions.push({
    mesh: group,
    core,
    outer,
    ring,
    maxScale: isFrag ? 6.8 : 8.5,
    born: performance.now(),
    ttl: isFrag ? 520 : 360
  });

  // Apply distance-based camera shake
  const dist = Math.hypot(x - myState.x, z - myState.z);
  if (dist < 22) {
    myState.shakeAmt = Math.max(myState.shakeAmt || 0, (1 - dist / 22) * (isFrag ? 0.32 : 0.14));
  }
}

function spawnBulletTracer(start, end, isEnemyHit) {
  const points = [
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(end.x, end.y, end.z)
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: isEnemyHit ? 0xff4444 : 0xfde047,
    transparent: true,
    opacity: 0.92
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  // Distance-scaled impact spark so hits are clearly visible at 100m+
  const dist = Math.hypot(end.x - myState.x, end.z - myState.z);
  const sz = Math.min(0.42, 0.14 + dist * 0.0028);
  const spark = new THREE.Mesh(
    new THREE.BoxGeometry(sz, sz, sz),
    new THREE.MeshBasicMaterial({ color: isEnemyHit ? 0xef4444 : 0xfacc15 })
  );
  spark.position.set(end.x, end.y, end.z);
  scene.add(spark);

  activeEffects.push({ line, spark, born: performance.now(), ttl: 210 });
}

// --- PLAYER & CLIENT STATE ---
const myState = {
  id: null,
  name: localStorage.getItem('webtdm_name') || `Player_${Math.floor(100 + Math.random() * 899)}`,
  team: 'BLUE',
  preferredTeam: 'AUTO',
  weapon: 'M416',
  ammo: 30,
  grenades: 2,
  flashes: 2,
  lastThrowAt: 0,
  flashAlpha: 0,
  flashDecay: 0.5,
  reloading: false,
  hp: 100,
  dead: false,
  invuln: false,
  x: 0,
  y: 0,
  z: -48,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: Math.PI,
  pitch: 0,
  grounded: true,
  crouch: false,
  ads: false,
  tpp: false,
  firing: false,
  lastClientShotAt: 0,
  fireBufferUntil: 0,
  recoilKick: 0,
  recoilAccum: 0,
  lookSens: Math.max(0.25, Math.min(2.5, Number(localStorage.getItem('webtdm_look_sens')) || 1.0)),
  fireSens: Math.max(0.25, Math.min(2.5, Number(localStorage.getItem('webtdm_fire_sens')) || 1.0))
};

// Local player's 3D character mesh for TPP (3rd-Person Perspective)
const localAvatar = createSoldierAvatar(0x3b82f6);
localAvatar.group.visible = false;
// Hide floating overhead name sprite on own character
const ownBadge = localAvatar.group.children[localAvatar.group.children.length - 1];
if (ownBadge) ownBadge.visible = false;

function cleanRoomCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^A-Z0-9\-]/g, '').slice(0, 12);
  return s || 'MAIN';
}

const urlParams = new URLSearchParams(window.location.search);
let currentRoom = cleanRoomCode(urlParams.get('room') || 'MAIN');
let baseLanOrigin = window.location.origin;
let currentMode = 'TEAM';
let targetScore = 40;
let latestPlayers = [];
let pointerLocked = false;

// --- DOM ELEMENTS ---
const lobbyOverlay = document.getElementById('lobby-overlay');
const nameInput = document.getElementById('name-input');
const roomInput = document.getElementById('room-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const newRoomBtn = document.getElementById('new-room-btn');
const roomListEl = document.getElementById('room-list');
const lanUrlText = document.getElementById('lan-url-text');
const copyLanBtn = document.getElementById('copy-lan-btn');
const deployBtn = document.getElementById('deploy-btn');
const addBotBtn = document.getElementById('add-bot-btn');
const remBotBtn = document.getElementById('rem-bot-btn');

const blueScoreEl = document.getElementById('blue-score');
const redScoreEl = document.getElementById('red-score');
const blueBarEl = document.getElementById('blue-bar');
const redBarEl = document.getElementById('red-bar');
const leftLabelEl = document.getElementById('left-label');
const rightLabelEl = document.getElementById('right-label');
const modeBadgeEl = document.getElementById('mode-badge');
const timerTextEl = document.getElementById('timer-text');
const targetTextEl = document.getElementById('target-text');

const hpValEl = document.getElementById('hp-val');
const hpBarFillEl = document.getElementById('hp-bar-fill');
const statusTagEl = document.getElementById('status-tag');
const wepNameEl = document.getElementById('wep-name');
const ammoCountEl = document.getElementById('ammo-count');
const sniperScopeEl = document.getElementById('sniper-scope');
const crosshairEl = document.getElementById('crosshair');
const hitmarkerEl = document.getElementById('hitmarker');
const dmgPopEl = document.getElementById('dmg-pop');
const damageVignetteEl = document.getElementById('damage-vignette');
const flashbangOverlayEl = document.getElementById('flashbang-overlay');
const nadeCountEl = document.getElementById('nade-count');
const flashCountEl = document.getElementById('flash-count');
const deathOverlayEl = document.getElementById('death-overlay');
const deathKillerInfoEl = document.getElementById('death-killer-info');
const deathTimerTextEl = document.getElementById('death-timer-text');
const deathBarFillEl = document.getElementById('death-bar-fill');
const centerBannerEl = document.getElementById('center-banner');
const killfeedEl = document.getElementById('killfeed');
const scoreboardEl = document.getElementById('scoreboard');
const sbBodyEl = document.getElementById('sb-body');
const victoryOverlayEl = document.getElementById('victory-overlay');
const victoryTitleEl = document.getElementById('victory-title');
const victoryMvpEl = document.getElementById('victory-mvp');
const victoryTeamScoresEl = document.getElementById('victory-team-scores');
const vicBlueScoreEl = document.getElementById('vic-blue-score');
const vicRedScoreEl = document.getElementById('vic-red-score');
const victoryTbodyEl = document.getElementById('victory-tbody');
const restartMatchBtn = document.getElementById('restart-match-btn');
const victoryLobbyBtn = document.getElementById('victory-lobby-btn');
let victoryActive = false;

nameInput.value = myState.name;
roomInput.value = currentRoom;

function updateRoomShareUrl() {
  const newUrl = `${window.location.pathname}?room=${encodeURIComponent(currentRoom)}`;
  window.history.replaceState(null, '', newUrl);
  const cleanOrigin = baseLanOrigin.replace(/\s*\(.*\)$/, '');
  lanUrlText.textContent = `${cleanOrigin}/?room=${currentRoom}`;
}

function renderRoomList(rooms) {
  if (!roomListEl || !Array.isArray(rooms)) return;
  roomListEl.innerHTML = rooms
    .map((r) => {
      const active = r.code === currentRoom;
      const border = active ? '#f2b722' : 'rgba(255,255,255,0.18)';
      const bg = active ? 'rgba(242,183,34,0.2)' : 'rgba(255,255,255,0.05)';
      const mapTag = r.map ? ` • ${getMap(r.map).name}` : '';
      return `<button type="button" class="btn-small room-pill" data-room="${r.code}" style="border-color:${border};background:${bg}">
        ${r.code} (${r.players} • ${r.mode}${mapTag})
      </button>`;
    })
    .join('');
  roomListEl.querySelectorAll('.room-pill').forEach((btn) => {
    btn.addEventListener('click', () => switchRoom(btn.getAttribute('data-room')));
  });
}

function switchRoom(rawCode) {
  const code = cleanRoomCode(rawCode);
  currentRoom = code;
  roomInput.value = code;
  updateRoomShareUrl();
  // Clear old remote avatars from previous room
  for (const [, av] of remoteAvatars.entries()) {
    scene.remove(av.group);
  }
  remoteAvatars.clear();
  sendWs({
    type: 'join_room',
    room: code,
    name: nameInput.value.trim() || myState.name,
    team: myState.preferredTeam,
    weapon: myState.weapon,
    mode: currentMode,
    map: currentMap
  });
  showCenterBanner(`JOINED ROOM: ${code}`, 1800);
}

joinRoomBtn.addEventListener('click', () => switchRoom(roomInput.value));
roomInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') switchRoom(roomInput.value);
});
newRoomBtn.addEventListener('click', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  switchRoom(code);
});

// Segmented button handlers in Lobby
function setupSegmented(containerId, attr, onSelect) {
  const container = document.getElementById(containerId);
  const btns = container.querySelectorAll('.seg-btn');
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      btns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onSelect(btn.getAttribute(attr));
    });
  });
}

setupSegmented('map-select', 'data-map', (mapId) => {
  if (MAPS[mapId]) {
    buildArenaMap(mapId);
    sendWs({ type: 'set_map', map: mapId });
    showCenterBanner(`MAP: ${MAPS[mapId].name.toUpperCase()}`, 1400);
  }
});

setupSegmented('mode-select', 'data-mode', (mode) => {
  currentMode = mode;
  document.getElementById('team-group').style.display = mode === 'FFA' ? 'none' : 'block';
  sendWs({ type: 'set_mode', mode });
});

setupSegmented('team-select', 'data-team', (team) => {
  myState.preferredTeam = team;
});

setupSegmented('wep-select', 'data-wep', (wep) => {
  selectWeapon(wep);
});

function setCameraPerspective(isTpp) {
  myState.tpp = Boolean(isTpp);
  document.querySelectorAll('#cam-select .seg-btn').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-cam') === (myState.tpp ? 'TPP' : 'FPP'));
  });
  showCenterBanner(myState.tpp ? 'CAMERA: TPP (3RD PERSON)' : 'CAMERA: FPP (1ST PERSON)', 1200);
}

setupSegmented('cam-select', 'data-cam', (cam) => {
  setCameraPerspective(cam === 'TPP');
});

const lookSensInput = document.getElementById('look-sens-input');
const lookSensVal = document.getElementById('look-sens-val');
const fireSensInput = document.getElementById('fire-sens-input');
const fireSensVal = document.getElementById('fire-sens-val');

function syncSensitivityUi() {
  const lookPct = Math.round(myState.lookSens * 100);
  const firePct = Math.round(myState.fireSens * 100);
  if (lookSensInput) lookSensInput.value = String(lookPct);
  if (lookSensVal) lookSensVal.textContent = `${lookPct}%`;
  if (fireSensInput) fireSensInput.value = String(firePct);
  if (fireSensVal) fireSensVal.textContent = `${firePct}%`;
}

if (lookSensInput) {
  lookSensInput.addEventListener('input', () => {
    myState.lookSens = Math.max(0.25, Math.min(2.5, Number(lookSensInput.value) / 100));
    localStorage.setItem('webtdm_look_sens', String(myState.lookSens));
    syncSensitivityUi();
  });
}

if (fireSensInput) {
  fireSensInput.addEventListener('input', () => {
    myState.fireSens = Math.max(0.25, Math.min(2.5, Number(fireSensInput.value) / 100));
    localStorage.setItem('webtdm_fire_sens', String(myState.fireSens));
    syncSensitivityUi();
  });
}

syncSensitivityUi();

addBotBtn.addEventListener('click', () => sendWs({ type: 'bot', action: 'add' }));
remBotBtn.addEventListener('click', () => sendWs({ type: 'bot', action: 'remove' }));

copyLanBtn.addEventListener('click', () => {
  navigator.clipboard?.writeText(lanUrlText.textContent || window.location.href);
  copyLanBtn.textContent = 'Copied!';
  setTimeout(() => (copyLanBtn.textContent = 'Copy Link'), 1500);
});

deployBtn.addEventListener('click', () => {
  sfx.init();
  const clean = nameInput.value.trim() || myState.name;
  myState.name = clean;
  localStorage.setItem('webtdm_name', clean);
  currentRoom = cleanRoomCode(roomInput.value || currentRoom);
  roomInput.value = currentRoom;
  updateRoomShareUrl();
  sendWs({
    type: 'join',
    room: currentRoom,
    name: clean,
    team: myState.preferredTeam,
    weapon: myState.weapon,
    mode: currentMode,
    map: currentMap
  });
  canvas.requestPointerLock();
});

function showVictoryScreen(msg) {
  victoryActive = true;
  if (deathOverlayEl) deathOverlayEl.style.display = 'none';
  lobbyOverlay.style.display = 'none';
  if (victoryOverlayEl) victoryOverlayEl.style.display = 'flex';
  if (document.pointerLockElement === canvas) {
    document.exitPointerLock();
  }

  if (victoryTitleEl) victoryTitleEl.textContent = msg.winnerText || 'MATCH COMPLETE!';

  const mode = msg.mode || currentMode;
  const scores = msg.scores || { BLUE: 0, RED: 0 };
  if (victoryTeamScoresEl) {
    victoryTeamScoresEl.style.display = mode === 'TEAM' ? 'flex' : 'none';
    if (vicBlueScoreEl) vicBlueScoreEl.textContent = String(scores.BLUE || 0);
    if (vicRedScoreEl) vicRedScoreEl.textContent = String(scores.RED || 0);
  }

  const list = [...(msg.players || latestPlayers)].sort(
    (a, b) => b.kills - a.kills || a.deaths - b.deaths
  );
  const mvp = list[0];
  if (victoryMvpEl) {
    victoryMvpEl.textContent = mvp
      ? `MVP: ${mvp.name} • ${mvp.kills} Kills (${mvp.weapon || 'M416'})`
      : 'MATCH FINISHED';
  }

  if (victoryTbodyEl) {
    victoryTbodyEl.innerHTML = list
      .map((p, idx) => {
        const kd = p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(2);
        const tCol = p.team === 'BLUE' ? '#58a6ff' : '#ff6b6b';
        const isMe = p.id === myState.id;
        return `<tr style="${isMe ? 'background:rgba(242,183,34,0.14)' : ''}">
          <td style="color:#f2b722;font-weight:900">#${idx + 1}</td>
          <td style="color:${isMe ? '#f2b722' : '#fff'}">${p.name}${isMe ? ' (YOU)' : ''}</td>
          <td style="color:${tCol}">${mode === 'FFA' ? 'SOLO' : p.team}</td>
          <td>${p.weapon || 'M416'}</td>
          <td style="color:#4ade80;font-weight:900">${p.kills}</td>
          <td>${p.deaths}</td>
          <td>${kd}</td>
          <td>${p.streak || 0}</td>
        </tr>`;
      })
      .join('');
  }
}

function hideVictoryScreen() {
  victoryActive = false;
  if (victoryOverlayEl) victoryOverlayEl.style.display = 'none';
}

if (restartMatchBtn) {
  restartMatchBtn.addEventListener('click', () => {
    sfx.init();
    hideVictoryScreen();
    sendWs({ type: 'restart_match' });
    canvas.requestPointerLock();
  });
}

if (victoryLobbyBtn) {
  victoryLobbyBtn.addEventListener('click', () => {
    hideVictoryScreen();
    lobbyOverlay.style.display = 'flex';
  });
}

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  if (!victoryActive) {
    lobbyOverlay.style.display = pointerLocked ? 'none' : 'flex';
  }
  if (!pointerLocked) {
    myState.firing = false;
    myState.ads = false;
    sniperScopeEl.style.display = 'none';
    crosshairEl.style.display = 'block';
  }
});

// --- INPUT HANDLING ---
const keys = {};
window.addEventListener('keydown', (e) => {
  if (document.activeElement === nameInput || document.activeElement === roomInput) return;
  keys[e.code] = true;

  if (e.code === 'Tab') {
    e.preventDefault();
    scoreboardEl.style.display = 'block';
    renderScoreboard();
  }
  if (!pointerLocked) return;

  if (e.code === 'KeyC') myState.crouch = !myState.crouch;
  if (e.code === 'KeyV') setCameraPerspective(!myState.tpp);
  if (e.code === 'KeyR') triggerReload();
  if (e.code === 'KeyG' || e.code === 'Digit4') tryThrow('GRENADE');
  if (e.code === 'KeyF' || e.code === 'Digit5') tryThrow('FLASH');
  if (e.code === 'Digit1') selectWeapon('M416');
  if (e.code === 'Digit2') selectWeapon('AKM');
  if (e.code === 'Digit3') selectWeapon('AWM');
  if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
    const delta = e.code === 'BracketRight' ? 0.1 : -0.1;
    myState.fireSens = Math.max(0.25, Math.min(2.5, +(myState.fireSens + delta).toFixed(2)));
    localStorage.setItem('webtdm_fire_sens', String(myState.fireSens));
    syncSensitivityUi();
    showCenterBanner(`GUN FIRE SENSITIVITY: ${Math.round(myState.fireSens * 100)}%`, 1100);
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab') {
    scoreboardEl.style.display = 'none';
  }
});

window.addEventListener('mousemove', (e) => {
  if (!pointerLocked || myState.dead) return;
  const wep = WEAPONS[myState.weapon];
  const baseSens = myState.ads ? (wep.sniper ? 0.00068 : 0.00125) : 0.0021;
  const isActivelyFiring = myState.firing || performance.now() - myState.lastClientShotAt < 140;
  const sens = baseSens * myState.lookSens * (isActivelyFiring ? myState.fireSens : 1.0);
  myState.yaw -= e.movementX * sens;
  const prevPitch = myState.pitch;
  myState.pitch = Math.max(-1.48, Math.min(1.48, myState.pitch - e.movementY * sens));
  if (e.movementY > 0 && myState.recoilAccum > 0) {
    myState.recoilAccum = Math.max(0, myState.recoilAccum - (prevPitch - myState.pitch));
  }
});

window.addEventListener('mousedown', (e) => {
  if (!pointerLocked || myState.dead) return;
  sfx.init();
  if (e.button === 0) {
    myState.firing = true;
    myState.fireBufferUntil = performance.now() + 95;
    tryShoot();
  } else if (e.button === 2) {
    myState.ads = true;
  }
});

window.addEventListener('mouseup', (e) => {
  if (e.button === 0) myState.firing = false;
  if (e.button === 2) myState.ads = false;
});

window.addEventListener('contextmenu', (e) => e.preventDefault());

function selectWeapon(wepId) {
  if (!WEAPONS[wepId]) return;
  myState.weapon = wepId;
  myState.ammo = WEAPONS[wepId].magSize;
  myState.reloading = false;
  rebuildFpGun(wepId);
  sendWs({ type: 'weapon', weapon: wepId });

  document.querySelectorAll('.wep-pill').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-wep') === wepId);
  });
  document.querySelectorAll('#wep-select .seg-btn').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-wep') === wepId);
  });
  wepNameEl.textContent = WEAPONS[wepId].name;
  ammoCountEl.textContent = String(myState.ammo);
}

function triggerReload() {
  const wep = WEAPONS[myState.weapon];
  if (myState.reloading || myState.ammo >= wep.magSize || myState.dead) return;
  myState.reloading = true;
  sfx.playReload();
  sendWs({ type: 'reload' });
}

function showCenterBanner(text, duration = 2400) {
  centerBannerEl.textContent = text;
  centerBannerEl.style.opacity = '1';
  clearTimeout(showCenterBanner._t);
  showCenterBanner._t = setTimeout(() => {
    centerBannerEl.style.opacity = '0';
  }, duration);
}

function addKillfeedItem(msg) {
  const div = document.createElement('div');
  div.className = 'kill-item';
  const kClass = msg.killerTeam === 'BLUE' ? 'kf-blue' : 'kf-red';
  const vClass = msg.victimTeam === 'BLUE' ? 'kf-blue' : 'kf-red';
  div.innerHTML = `
    <span class="${kClass}">${msg.killerName}</span>
    <span class="kf-wep">${msg.weapon}</span>
    ${msg.headshot ? '<span class="kf-hs">HEADSHOT</span>' : ''}
    <span class="${vClass}">${msg.victimName}</span>
  `;
  killfeedEl.appendChild(div);
  setTimeout(() => div.remove(), 4500);

  if (msg.killerId === myState.id) {
    if (msg.streak === 2) showCenterBanner('DOUBLE KILL!');
    else if (msg.streak === 3) showCenterBanner('TRIPLE KILL!');
    else if (msg.streak === 4) showCenterBanner('QUADRA KILL!');
    else if (msg.streak >= 5) showCenterBanner(`UNSTOPPABLE (${msg.streak} STREAK)!`);
    else if (msg.headshot) showCenterBanner('HEADSHOT ELIMINATION!', 1400);
  }
}

function tryShoot() {
  if (!pointerLocked || myState.dead || myState.reloading) return;
  const now = performance.now();
  const wep = WEAPONS[myState.weapon];
  if (now - myState.lastClientShotAt < wep.fireRateMs) return;
  if (myState.ammo <= 0) {
    triggerReload();
    return;
  }

  myState.lastClientShotAt = now;
  myState.ammo = Math.max(0, myState.ammo - 1);
  ammoCountEl.textContent = String(myState.ammo);

  // Camera & gun recoil
  const spread = myState.ads ? wep.adsSpread : wep.spread;
  const lookDir = new THREE.Vector3(
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
    -1
  )
    .normalize()
    .applyEuler(new THREE.Euler(myState.pitch, myState.yaw, 0, 'YXZ'));

  const eyeY = myState.y + (myState.crouch ? ARENA.crouchEye : ARENA.standEye);
  let shootOrigin = { x: myState.x, y: eyeY, z: myState.z };
  let shootDir = { x: lookDir.x, y: lookDir.y, z: lookDir.z };

  // In TPP mode, converge bullet ray from shoulder onto exact crosshair target point
  if (myState.tpp && !myState.ads) {
    const activeBoxes = getMap(currentMap).boxes;
    const camOrigin = { x: camera.position.x, y: camera.position.y, z: camera.position.z };
    const camHit = raycastMap(camOrigin, shootDir, wep.range, activeBoxes);
    let targetDist = camHit ? camHit.dist : wep.range;
    for (const p of latestPlayers) {
      if (p.id === myState.id || p.dead) continue;
      if (currentMode === 'TEAM' && p.team === myState.team) continue;
      const dB = rayBoxIntersect(
        camOrigin,
        shootDir,
        { x: p.x, y: p.y, z: p.z, w: 1.05, h: 1.88, d: 1.05 },
        targetDist
      );
      if (dB !== null && dB > 2.5 && dB < targetDist) targetDist = dB;
    }
    const aimPoint = {
      x: camOrigin.x + shootDir.x * targetDist,
      y: camOrigin.y + shootDir.y * targetDist,
      z: camOrigin.z + shootDir.z * targetDist
    };
    const sin = Math.sin(myState.yaw);
    const cos = Math.cos(myState.yaw);
    shootOrigin = {
      x: myState.x + cos * 0.32,
      y: eyeY + 0.14,
      z: myState.z - sin * 0.32
    };
    const dx = aimPoint.x - shootOrigin.x;
    const dy = aimPoint.y - shootOrigin.y;
    const dz = aimPoint.z - shootOrigin.z;
    const dLen = Math.hypot(dx, dy, dz) || 1;
    shootDir = { x: dx / dLen, y: dy / dLen, z: dz / dLen };
  }

  if (!localFallback && (!ws || ws.readyState !== WebSocket.OPEN)) {
    startLocalFallback();
  }

  sendWs({
    type: 'shoot',
    origin: shootOrigin,
    dir: shootDir
  });

  // Apply smooth, responsive recoil kick scaled by gun fire sensitivity
  const sensScale = 1 / Math.max(0.65, Math.min(1.45, Math.sqrt(myState.fireSens)));
  const mult = (myState.ads ? 0.42 : 0.78) * sensScale;
  const pitchKick = wep.recoilPitch * mult;
  myState.pitch = Math.min(1.48, myState.pitch + pitchKick);
  myState.recoilAccum = Math.min(0.18, (myState.recoilAccum || 0) + pitchKick * 0.65);
  myState.yaw += (Math.random() - 0.5) * wep.recoilYaw * 1.8 * mult;
  myState.recoilKick = myState.ads ? 0.011 : 0.024;
  myState.fireBufferUntil = 0;

  if (muzzleFlashMesh) {
    muzzleFlashMesh.material.opacity = 0.95;
    muzzleFlashMesh.rotation.z = Math.random() * Math.PI;
  }
}

function tryThrow(kind) {
  if (!pointerLocked || myState.dead) return;
  const now = performance.now();
  if (now - myState.lastThrowAt < 450) return;
  if (kind === 'GRENADE' && myState.grenades <= 0) {
    showCenterBanner('NO FRAG GRENADES LEFT', 900);
    return;
  }
  if (kind === 'FLASH' && myState.flashes <= 0) {
    showCenterBanner('NO FLASHBANGS LEFT', 900);
    return;
  }

  sfx.init();
  myState.lastThrowAt = now;
  myState.throwAnimUntil = now + 260;
  if (kind === 'GRENADE') myState.grenades = Math.max(0, myState.grenades - 1);
  else myState.flashes = Math.max(0, myState.flashes - 1);
  updateBottomHud();

  const pillEl = document.getElementById(kind === 'GRENADE' ? 'nade-pill' : 'flash-pill');
  if (pillEl) {
    pillEl.classList.add('active');
    setTimeout(() => pillEl.classList.remove('active'), 320);
  }

  const dir = new THREE.Vector3(0, 0, -1)
    .applyEuler(new THREE.Euler(myState.pitch, myState.yaw, 0, 'YXZ'))
    .normalize();
  const eyeY = myState.y + (myState.crouch ? ARENA.crouchEye : ARENA.standEye);

  // If WebSocket died mid-session, ensure local fallback takes over immediately
  if (!localFallback && (!ws || ws.readyState !== WebSocket.OPEN)) {
    startLocalFallback();
  }

  sendWs({
    type: 'throw',
    kind,
    origin: { x: myState.x, y: eyeY, z: myState.z },
    dir: { x: dir.x, y: dir.y, z: dir.z }
  });
}

// --- WEBSOCKET CONNECTION (+ CLOUDFLARE TUNNEL BRIDGE FOR NETLIFY) ---
const ACTIVE_TUNNEL_HOST = 'claims-stats-honor-encourages.trycloudflare.com';
const customServer = urlParams.get('server');
const isStaticNetlify = window.location.hostname.endsWith('.netlify.app');
const targetWsHost = customServer || (isStaticNetlify ? ACTIVE_TUNNEL_HOST : window.location.host);
const wsProto = targetWsHost === window.location.host && window.location.protocol === 'http:' ? 'ws:' : 'wss:';
let ws = null;
let localFallback = null;

try {
  ws = new WebSocket(`${wsProto}//${targetWsHost}/?room=${encodeURIComponent(currentRoom)}`);
} catch {
  ws = null;
}

function sendWs(obj) {
  if (localFallback) {
    localFallback.onClientMsg(obj);
    return;
  }
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

function triggerLocalDeath(killerName, weapon, headshot, killerId) {
  myState.dead = true;
  myState.hp = 0;
  myState.firing = false;
  myState.ads = false;
  myState.reloading = false;
  myState.diedAt = performance.now();
  myState.killerId = killerId || null;
  sniperScopeEl.style.display = 'none';
  crosshairEl.style.display = 'none';
  fpGunGroup.visible = false;

  if (deathKillerInfoEl) {
    const hsTag = headshot ? ' <span style="color:#ef4444;font-weight:900">• HEADSHOT</span>' : '';
    const byText = killerName ? `Killed by <b style="color:#f2b722">${killerName}</b> [${weapon || 'AR'}]` : 'Eliminated in combat';
    deathKillerInfoEl.innerHTML = `${byText}${hsTag}`;
  }
  if (deathOverlayEl) deathOverlayEl.style.display = 'flex';
  sfx.playDeath();
  updateBottomHud();
}

function handleServerMessage(msg) {
  if (msg.type === 'init') {
    myState.id = msg.id;
    myState.team = msg.team;
    myState.x = msg.x;
    myState.y = msg.y;
    myState.z = msg.z;
    myState.yaw = msg.yaw;
    if (msg.room) {
      currentRoom = cleanRoomCode(msg.room);
      roomInput.value = currentRoom;
    }
    if (msg.rooms) renderRoomList(msg.rooms);
    if (msg.map && msg.map !== currentMap) buildArenaMap(msg.map);
    currentMode = msg.mode;
    targetScore = msg.targetScore;
    const isLocalHost =
      window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalHost && msg.lanUrls && msg.lanUrls.length) {
      baseLanOrigin = msg.lanUrls[0];
    } else {
      baseLanOrigin = window.location.origin;
    }
    updateRoomShareUrl();
  } else if (msg.type === 'respawn') {
    if (msg.room) {
      currentRoom = cleanRoomCode(msg.room);
      roomInput.value = currentRoom;
      updateRoomShareUrl();
    }
    if (msg.map && msg.map !== currentMap) buildArenaMap(msg.map);
    myState.x = msg.x;
    myState.y = msg.y;
    myState.z = msg.z;
    myState.vx = 0;
    myState.vy = 0;
    myState.vz = 0;
    myState.yaw = msg.yaw;
    myState.pitch = 0;
    myState.crouch = false;
    myState.ads = false;
    myState.firing = false;
    myState.reloading = false;
    myState.hp = msg.hp || 100;
    myState.ammo = msg.ammo || WEAPONS[myState.weapon].magSize;
    myState.grenades = msg.grenades ?? 2;
    myState.flashes = msg.flashes ?? 2;
    myState.flashAlpha = 0;
    if (flashbangOverlayEl) flashbangOverlayEl.style.opacity = '0';
    myState.dead = false;
    myState.killerId = null;
    if (msg.team) myState.team = msg.team;

    camera.rotation.z = 0;
    camera.position.set(myState.x, myState.y + ARENA.standEye, myState.z);
    if (deathOverlayEl) deathOverlayEl.style.display = 'none';
    crosshairEl.style.display = 'block';
    sfx.playRespawn();
    damageVignetteEl.style.boxShadow = 'inset 0 0 95px rgba(56, 189, 248, 0.55)';
    clearTimeout(damageVignetteEl._t);
    damageVignetteEl._t = setTimeout(() => {
      damageVignetteEl.style.boxShadow = 'inset 0 0 110px rgba(220, 38, 38, 0)';
    }, 450);
    showCenterBanner('DEPLOYED • SPAWN SHIELD ACTIVE', 1600);
    updateBottomHud();
  } else if (msg.type === 'state') {
    if (msg.room) currentRoom = cleanRoomCode(msg.room);
    if (msg.rooms) renderRoomList(msg.rooms);
    if (msg.map && msg.map !== currentMap) buildArenaMap(msg.map);
    currentMode = msg.mode;
    targetScore = msg.targetScore;
    latestPlayers = msg.players;
    if (msg.ended && !victoryActive) {
      showVictoryScreen(msg);
    } else if (!msg.ended && victoryActive) {
      hideVictoryScreen();
    }

    // Update top HUD
    const mins = String(Math.floor(msg.remainingSec / 60)).padStart(2, '0');
    const secs = String(msg.remainingSec % 60).padStart(2, '0');
    timerTextEl.textContent = `${mins}:${secs}`;
    const mapLabel = getMap(currentMap).name.toUpperCase();
    modeBadgeEl.textContent = `${currentRoom} • ${mapLabel} • ${msg.mode === 'FFA' ? 'FFA' : 'TEAM'}`;
    targetTextEl.textContent = `FIRST TO ${msg.targetScore}`;

    if (msg.mode === 'TEAM') {
      leftLabelEl.textContent = 'BLUE';
      rightLabelEl.textContent = 'RED';
      blueScoreEl.textContent = String(msg.scores.BLUE || 0);
      redScoreEl.textContent = String(msg.scores.RED || 0);
      blueBarEl.style.width = `${Math.min(100, ((msg.scores.BLUE || 0) / msg.targetScore) * 100)}%`;
      redBarEl.style.width = `${Math.min(100, ((msg.scores.RED || 0) / msg.targetScore) * 100)}%`;
    } else {
      const sorted = [...msg.players].sort((a, b) => b.kills - a.kills);
      const leader = sorted[0];
      const me = msg.players.find((p) => p.id === myState.id);
      leftLabelEl.textContent = 'YOU';
      rightLabelEl.textContent = leader ? leader.name.slice(0, 8) : 'TOP';
      const myKills = me ? me.kills : 0;
      const topKills = leader ? leader.kills : 0;
      blueScoreEl.textContent = String(myKills);
      redScoreEl.textContent = String(topKills);
      blueBarEl.style.width = `${Math.min(100, (myKills / msg.targetScore) * 100)}%`;
      redBarEl.style.width = `${Math.min(100, (topKills / msg.targetScore) * 100)}%`;
    }

    // Sync players
    const seenIds = new Set();
    for (const p of msg.players) {
      seenIds.add(p.id);
      if (p.id === myState.id) {
        if (p.dead && !myState.dead) {
          triggerLocalDeath(null, null, false, null);
        }
        myState.hp = p.hp;
        myState.dead = p.dead;
        myState.team = p.team;
        myState.invuln = p.invuln;
        myState.reloading = p.reloading;
        if (!myState.firing && !myState.dead) myState.ammo = p.ammo;
        if (performance.now() - myState.lastThrowAt > 650) {
          if (typeof p.grenades === 'number') myState.grenades = p.grenades;
          if (typeof p.flashes === 'number') myState.flashes = p.flashes;
        }
        updateBottomHud();
        continue;
      }

      const isEnemy = msg.mode === 'FFA' || p.team !== myState.team;
      const teamColor = isEnemy ? 0xef4444 : 0x3b82f6;

      let av = remoteAvatars.get(p.id);
      if (!av) {
        av = createSoldierAvatar(teamColor);
        av.group.position.set(p.x, p.y, p.z);
        remoteAvatars.set(p.id, av);
      }
      av.chestBand.material.color.setHex(teamColor);
      av.helmet.material.color.setHex(teamColor);
      av.dead = Boolean(p.dead);
      av.group.visible = true;
      av.shieldRing.visible = Boolean(p.invuln) && !p.dead;
      av.targetPos.set(p.x, p.y, p.z);
      av.targetYaw = p.yaw;
      av.targetPitch = p.pitch;
      av.crouch = p.crouch;
      updateNameSprite(av, p.name, p.hp, isEnemy);
    }

    for (const [id, av] of remoteAvatars.entries()) {
      if (!seenIds.has(id)) {
        scene.remove(av.group);
        remoteAvatars.delete(id);
      }
    }

    if (scoreboardEl.style.display === 'block') renderScoreboard();
  } else if (msg.type === 'shot') {
    const dist = Math.hypot(msg.origin.x - myState.x, msg.origin.z - myState.z);
    sfx.playShot(msg.weapon, dist);
    const startOffset =
      msg.id === myState.id
        ? { x: msg.origin.x, y: msg.origin.y - 0.08, z: msg.origin.z }
        : msg.origin;
    for (const tr of msg.traces || []) {
      spawnBulletTracer(startOffset, tr, tr.hitPlayer);
    }
  } else if (msg.type === 'hitmarker') {
    sfx.playHit(msg.headshot);
    hitmarkerEl.className = msg.shield ? 'shield' : msg.headshot ? 'headshot' : '';
    hitmarkerEl.style.opacity = '1';
    clearTimeout(hitmarkerEl._t);
    hitmarkerEl._t = setTimeout(() => (hitmarkerEl.style.opacity = '0'), 140);

    if (msg.dmg) {
      dmgPopEl.textContent = msg.headshot ? `${msg.dmg} HS!` : `-${msg.dmg}`;
      dmgPopEl.style.color = msg.headshot ? '#ff4444' : '#f2b722';
      dmgPopEl.style.opacity = '1';
      dmgPopEl.style.transform = 'translateY(-8px)';
      clearTimeout(dmgPopEl._t);
      dmgPopEl._t = setTimeout(() => {
        dmgPopEl.style.opacity = '0';
        dmgPopEl.style.transform = 'translateY(0)';
      }, 280);
    }
  } else if (msg.type === 'damaged') {
    damageVignetteEl.style.boxShadow = 'inset 0 0 120px rgba(239, 68, 68, 0.78)';
    clearTimeout(damageVignetteEl._t);
    damageVignetteEl._t = setTimeout(() => {
      damageVignetteEl.style.boxShadow = 'inset 0 0 110px rgba(220, 38, 38, 0)';
    }, 320);
  } else if (msg.type === 'kill') {
    addKillfeedItem(msg);
    if (msg.victimId === myState.id) {
      triggerLocalDeath(msg.killerName, msg.weapon, msg.headshot, msg.killerId);
    }
  } else if (msg.type === 'match_end') {
    showVictoryScreen(msg);
  } else if (msg.type === 'match_reset') {
    if (msg.map && msg.map !== currentMap) buildArenaMap(msg.map);
    hideVictoryScreen();
    showCenterBanner(`NEW ${msg.mode} MATCH • ${getMap(currentMap).name.toUpperCase()}!`, 2500);
  } else if (msg.type === 'throw_spawn') {
    spawnThrowableMesh(msg);
    sfx.playThrow();
  } else if (msg.type === 'throw_explode') {
    const th = activeThrowables.get(msg.id);
    if (th) {
      scene.remove(th.mesh);
      if (th.trailLine) {
        scene.remove(th.trailLine);
        th.trailLine.geometry.dispose();
        th.trailLine.material.dispose();
      }
      activeThrowables.delete(msg.id);
    }
    spawnExplosionEffect(msg.kind, msg.x, msg.y, msg.z);
    const dist = Math.hypot(msg.x - myState.x, msg.z - myState.z);
    sfx.playExplosion(msg.kind, dist);
  } else if (msg.type === 'flashed') {
    const intensity = Math.min(1, Math.max(0.2, Number(msg.intensity) || 0.85));
    const durSec = Math.max(0.4, (Number(msg.durationMs) || 2200) / 1000);
    myState.flashAlpha = Math.max(myState.flashAlpha, intensity);
    myState.flashDecay = intensity / durSec;
    if (flashbangOverlayEl) flashbangOverlayEl.style.opacity = String(Math.min(1, myState.flashAlpha * 1.15));
    sfx.playFlashTinnitus(msg.durationMs || 2200);
  }
}

function startLocalFallback() {
  if (localFallback) return;
  const players = new Map();
  const peerConns = new Map();
  let hostConn = null;
  let activePeer = null;
  let isP2PClient = false;
  let botSeq = 1;
  const scores = { BLUE: 0, RED: 0 };
  let mode = 'TEAM';
  const startedAt = Date.now();

  const pickSpawn = (team) => {
    const spawns = getMap(currentMap).spawns;
    const pool = mode === 'FFA' ? spawns.FFA : team === 'BLUE' ? spawns.BLUE : spawns.RED;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const me = {
    id: 'local_p1', name: myState.name, team: 'BLUE', isBot: false,
    weapon: 'M416', ammo: 30, grenades: 2, flashes: 2, reloadUntil: 0, lastShotAt: 0,
    x: -5, y: 0, z: -51, vx: 0, vy: 0, vz: 0, yaw: Math.PI, pitch: 0,
    crouch: false, ads: false, hp: 100, dead: false, kills: 0, deaths: 0, streak: 0,
    invulnUntil: Date.now() + 2500, lastDamagedAt: Date.now()
  };
  players.set(me.id, me);
  const localThrowables = [];
  let localThrowSeq = 1;

  const sendToPlayer = (targetId, msg) => {
    if (targetId === me.id) handleServerMessage(msg);
    else peerConns.get(targetId)?.send(msg);
  };

  const broadcastRoom = (msg) => {
    handleServerMessage(msg);
    for (const c of peerConns.values()) {
      if (c.open) c.send(msg);
    }
  };

  const addBot = () => {
    const id = `bot_${botSeq++}`;
    const names = ['Bot_Viper', 'Bot_Ghost', 'Bot_Falcon', 'Bot_Reaper', 'Bot_Titan', 'Bot_Cobra'];
    const team = botSeq % 2 === 0 ? 'BLUE' : 'RED';
    const wep = ['M416', 'AKM', 'AWM'][botSeq % 3];
    const sp = pickSpawn(team);
    players.set(id, {
      id, name: names[(botSeq - 2) % names.length], team, isBot: true,
      weapon: wep, ammo: WEAPONS[wep].magSize, reloadUntil: 0, lastShotAt: 0,
      x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, yaw: sp.yaw, pitch: 0,
      crouch: false, ads: false, hp: 100, dead: false, kills: 0, deaths: 0, streak: 0,
      invulnUntil: 0, lastDamagedAt: Date.now(), aiGoalX: 0, aiGoalZ: 0, aiNext: 0
    });
  };
  for (let i = 0; i < 4; i++) addBot();

  const fireShot = (shooter, origin, dir) => {
    if (shooter.dead) return;
    const now = Date.now();
    const wep = WEAPONS[shooter.weapon] || WEAPONS.M416;
    if (shooter.reloadUntil > now || now - shooter.lastShotAt < wep.fireRateMs * 0.8) return;
    shooter.lastShotAt = now;
    shooter.ammo--;
    if (shooter.ammo <= 0) shooter.reloadUntil = now + wep.reloadMs;

    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const rayDir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };
    const mapHit = raycastMap(origin, rayDir, wep.range, getMap(currentMap).boxes);
    let closest = mapHit ? mapHit.dist : wep.range;
    let hitTarget = null;
    let hs = false;

    for (const t of players.values()) {
      if (t.id === shooter.id || t.dead || (mode === 'TEAM' && t.team === shooter.team)) continue;
      const bodyH = t.crouch ? 0.85 : 1.36;
      const dH = rayBoxIntersect(origin, rayDir, { x: t.x, y: t.y + bodyH, z: t.z, w: 0.64, h: 0.52, d: 0.64 }, closest);
      if (dH !== null && dH < closest) { closest = dH; hitTarget = t; hs = true; }
      const dB = rayBoxIntersect(origin, rayDir, { x: t.x, y: t.y, z: t.z, w: 1.05, h: bodyH, d: 1.05 }, closest);
      if (dB !== null && dB < closest) { closest = dB; hitTarget = t; hs = false; }
    }

    broadcastRoom({
      type: 'shot', id: shooter.id, weapon: shooter.weapon, origin,
      traces: [{
        x: +(origin.x + rayDir.x * closest).toFixed(2),
        y: +(origin.y + rayDir.y * closest).toFixed(2),
        z: +(origin.z + rayDir.z * closest).toFixed(2),
        hitPlayer: Boolean(hitTarget)
      }]
    });

    if (hitTarget) {
      const dmg = Math.round(wep.damage * (hs ? wep.headMult : 1));
      hitTarget.hp = Math.max(0, hitTarget.hp - dmg);
      hitTarget.lastDamagedAt = now;
      const killed = hitTarget.hp <= 0;
      sendToPlayer(shooter.id, { type: 'hitmarker', dmg, headshot: hs, killed });
      sendToPlayer(hitTarget.id, { type: 'damaged', dmg, hp: hitTarget.hp });
      if (killed) {
        hitTarget.dead = true; hitTarget.deaths++; hitTarget.streak = 0; hitTarget.respawnAt = now + 3000;
        shooter.kills++; shooter.streak++;
        if (mode === 'TEAM') scores[shooter.team] = (scores[shooter.team] || 0) + 1;
        broadcastRoom({
          type: 'kill', killerId: shooter.id, killerName: shooter.name, killerTeam: shooter.team,
          victimId: hitTarget.id, victimName: hitTarget.name, victimTeam: hitTarget.team,
          weapon: wep.name, headshot: hs, streak: shooter.streak, scores
        });
        const target = mode === 'FFA' ? 20 : 40;
        if ((mode === 'TEAM' && (scores.BLUE >= target || scores.RED >= target)) || (mode === 'FFA' && shooter.kills >= target)) {
          const winnerText = mode === 'TEAM'
            ? (scores.BLUE >= target ? 'BLUE TEAM VICTORY!' : 'RED TEAM VICTORY!')
            : `${shooter.name} WINS FREE-FOR-ALL!`;
          broadcastRoom({
            type: 'match_end', winnerText, mode, scores,
            players: [...players.values()]
          });
        }
      }
    }
  };

  const resetLocalMatch = (newMode = mode, newMap = currentMap) => {
    mode = newMode;
    if (newMap && MAPS[newMap]) buildArenaMap(newMap);
    scores.BLUE = 0;
    scores.RED = 0;
    for (const p of players.values()) {
      p.kills = 0; p.deaths = 0; p.streak = 0; p.hp = 100; p.dead = false;
      const sp = pickSpawn(p.team);
      p.x = sp.x; p.y = sp.y; p.z = sp.z; p.yaw = sp.yaw;
    }
    broadcastRoom({ type: 'match_reset', mode, map: currentMap, scores, targetScore: mode === 'FFA' ? 20 : 40 });
  };

  const applyPlayerAction = (actor, m) => {
    if (m.type === 'join' || m.type === 'join_room') {
      if (m.name) actor.name = String(m.name).slice(0, 16);
      if (m.weapon && WEAPONS[m.weapon]) { actor.weapon = m.weapon; actor.ammo = WEAPONS[m.weapon].magSize; }
      if (m.team === 'BLUE' || m.team === 'RED') actor.team = m.team;
      if (m.mode) mode = m.mode;
      if (m.map && MAPS[m.map] && m.map !== currentMap) buildArenaMap(m.map);
    } else if (m.type === 'move') {
      actor.x = m.x; actor.y = m.y; actor.z = m.z; actor.yaw = m.yaw; actor.pitch = m.pitch; actor.crouch = m.crouch;
    } else if (m.type === 'shoot') {
      fireShot(actor, m.origin, m.dir);
    } else if (m.type === 'throw') {
      const kind = m.kind === 'FLASH' ? 'FLASH' : 'GRENADE';
      const spec = THROWABLES[kind];
      if (!actor.dead && spec) {
        actor.grenades = actor.grenades ?? 2;
        actor.flashes = actor.flashes ?? 2;
        if ((kind === 'GRENADE' && actor.grenades > 0) || (kind === 'FLASH' && actor.flashes > 0)) {
          if (kind === 'GRENADE') actor.grenades--;
          else actor.flashes--;
          const d = m.dir || { x: 0, y: 0, z: -1 };
          const dl = Math.hypot(d.x, d.y, d.z) || 1;
          const ox = m.origin?.x ?? actor.x;
          const oy = m.origin?.y ?? actor.y + 1.5;
          const oz = m.origin?.z ?? actor.z;
          const th = {
            id: `lth_${localThrowSeq++}`, ownerId: actor.id, ownerTeam: actor.team, kind,
            x: ox + (d.x / dl) * 0.5, y: oy, z: oz + (d.z / dl) * 0.5,
            vx: (d.x / dl) * spec.speed, vy: (d.y / dl) * spec.speed + spec.upBoost, vz: (d.z / dl) * spec.speed,
            explodeAt: Date.now() + spec.fuseMs
          };
          localThrowables.push(th);
          broadcastRoom({ type: 'throw_spawn', id: th.id, kind, x: th.x, y: th.y, z: th.z, vx: th.vx, vy: th.vy, vz: th.vz, fuseMs: spec.fuseMs });
        }
      }
    } else if (m.type === 'reload') {
      actor.reloadUntil = Date.now() + (WEAPONS[actor.weapon]?.reloadMs || 1800);
    } else if (m.type === 'weapon' && WEAPONS[m.weapon]) {
      actor.weapon = m.weapon; actor.ammo = WEAPONS[m.weapon].magSize; actor.reloadUntil = 0;
    } else if (m.type === 'set_mode') {
      resetLocalMatch(m.mode, currentMap);
    } else if (m.type === 'set_map') {
      if (m.map && MAPS[m.map]) resetLocalMatch(mode, m.map);
    } else if (m.type === 'restart_match') {
      resetLocalMatch(mode);
    } else if (m.type === 'bot') {
      if (m.action === 'add') addBot();
      else {
        for (const [k, v] of players.entries()) { if (v.isBot) { players.delete(k); break; } }
      }
    }
  };

  // Connect P2P Room over WebRTC (PeerJS) so colleagues on Netlify can join the same Room Code!
  const setupP2PRoom = async (roomCode) => {
    try {
      if (activePeer) { activePeer.destroy(); activePeer = null; }
      peerConns.clear();
      hostConn = null;
      isP2PClient = false;

      const { Peer } = await import('https://esm.sh/peerjs@1.5.4');
      const roomPeerId = `webtdm-v1-room-${roomCode.toLowerCase()}`;
      const peer = new Peer(roomPeerId);
      activePeer = peer;

      peer.on('open', () => {
        isP2PClient = false;
        peer.on('connection', (conn) => {
          const pid = `peer_${conn.peer.slice(0, 6)}`;
          const team = players.size % 2 === 0 ? 'BLUE' : 'RED';
          const sp = pickSpawn(team);
          const remoteP = {
            id: pid, name: `Player_${pid.slice(-3)}`, team, isBot: false,
            weapon: 'M416', ammo: 30, reloadUntil: 0, lastShotAt: 0,
            x: sp.x, y: sp.y, z: sp.z, vx: 0, vy: 0, vz: 0, yaw: sp.yaw, pitch: 0,
            crouch: false, ads: false, hp: 100, dead: false, kills: 0, deaths: 0, streak: 0,
            invulnUntil: Date.now() + 2500, lastDamagedAt: Date.now()
          };
          players.set(pid, remoteP);
          peerConns.set(pid, conn);

          conn.on('open', () => {
            conn.send({
              type: 'init', id: pid, room: roomCode, team: remoteP.team, mode, scores, targetScore: 40,
              x: remoteP.x, y: remoteP.y, z: remoteP.z, yaw: remoteP.yaw,
              lanUrls: [window.location.origin]
            });
          });
          conn.on('data', (data) => applyPlayerAction(remoteP, data));
          conn.on('close', () => { players.delete(pid); peerConns.delete(pid); });
        });
      });

      peer.on('error', (err) => {
        if (err.type === 'unavailable-id') {
          // Room host already exists on Netlify — join as P2P Client!
          const clientPeer = new Peer();
          activePeer = clientPeer;
          clientPeer.on('open', () => {
            const conn = clientPeer.connect(roomPeerId, { reliable: true });
            hostConn = conn;
            isP2PClient = true;
            conn.on('open', () => {
              conn.send({
                type: 'join', room: roomCode, name: myState.name,
                team: myState.preferredTeam, weapon: myState.weapon, mode: currentMode
              });
            });
            conn.on('data', (msg) => handleServerMessage(msg));
            conn.on('close', () => { isP2PClient = false; hostConn = null; });
          });
        }
      });
    } catch {
      // Offline mode: local AI bot arena works without internet
    }
  };

  localFallback = {
    onClientMsg(m) {
      if (m.type === 'join_room' && m.room) {
        currentRoom = cleanRoomCode(m.room);
        setupP2PRoom(currentRoom);
      }
      if (isP2PClient && hostConn && hostConn.open) {
        hostConn.send(m);
        return;
      }
      applyPlayerAction(me, m);
    }
  };

  handleServerMessage({
    type: 'init', id: me.id, room: currentRoom, team: me.team, mode, scores, targetScore: 40,
    x: me.x, y: me.y, z: me.z, yaw: me.yaw,
    lanUrls: [window.location.origin]
  });

  setupP2PRoom(currentRoom);

  setInterval(() => {
    if (isP2PClient) return;
    const now = Date.now();
    const curBoxes = getMap(currentMap).boxes;
    for (let i = localThrowables.length - 1; i >= 0; i--) {
      const th = localThrowables[i];
      stepThrowablePhysics(th, 0.04, curBoxes);
      if (now >= th.explodeAt) {
        localThrowables.splice(i, 1);
        const spec = THROWABLES[th.kind] || THROWABLES.GRENADE;
        broadcastRoom({ type: 'throw_explode', id: th.id, kind: th.kind, x: +th.x.toFixed(2), y: +th.y.toFixed(2), z: +th.z.toFixed(2) });
        const owner = players.get(th.ownerId);
        for (const t of players.values()) {
          if (t.dead) continue;
          const dist = Math.hypot(t.x - th.x, t.y + 0.9 - th.y, t.z - th.z);
          if (dist > spec.radius) continue;
          if (th.kind === 'FLASH') {
            const intensity = Math.max(0.25, 1 - (dist / spec.radius) * 0.75);
            sendToPlayer(t.id, { type: 'flashed', durationMs: Math.round(spec.maxDurationMs * intensity), intensity: +intensity.toFixed(2) });
          } else {
            if (mode === 'TEAM' && t.team === th.ownerTeam && t.id !== th.ownerId) continue;
            const dmg = Math.max(10, Math.round(spec.maxDamage * (1 - dist / spec.radius)));
            t.hp = Math.max(0, t.hp - dmg);
            t.lastDamagedAt = now;
            const killed = t.hp <= 0;
            if (owner && owner.id !== t.id) sendToPlayer(owner.id, { type: 'hitmarker', dmg, headshot: false, killed });
            sendToPlayer(t.id, { type: 'damaged', dmg, hp: t.hp });
            if (killed) {
              t.dead = true; t.deaths++; t.streak = 0; t.respawnAt = now + 3000;
              if (owner && owner.id !== t.id) {
                owner.kills++; owner.streak++;
                if (mode === 'TEAM') scores[owner.team] = (scores[owner.team] || 0) + 1;
              }
              broadcastRoom({
                type: 'kill', killerId: owner ? owner.id : th.ownerId, killerName: owner ? owner.name : 'GRENADE',
                killerTeam: th.ownerTeam, victimId: t.id, victimName: t.name, victimTeam: t.team,
                weapon: 'FRAG GRENADE', headshot: false, streak: owner ? owner.streak : 1, scores
              });
            }
          }
        }
      }
    }
    for (const p of players.values()) {
      if (p.dead && now >= p.respawnAt) {
        const sp = pickSpawn(p.team);
        p.x = sp.x; p.y = sp.y; p.z = sp.z; p.yaw = sp.yaw; p.hp = 100; p.dead = false;
        p.ammo = WEAPONS[p.weapon].magSize; p.grenades = 2; p.flashes = 2;
        sendToPlayer(p.id, { type: 'respawn', room: currentRoom, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: 100, ammo: p.ammo, grenades: 2, flashes: 2 });
      }
      if (!p.dead && p.reloadUntil > 0 && now >= p.reloadUntil) {
        p.reloadUntil = 0; p.ammo = WEAPONS[p.weapon].magSize;
      }
      if (!p.dead && p.hp < 100 && now - p.lastDamagedAt >= 5000) p.hp = Math.min(100, p.hp + 0.5);
      if (p.isBot && !p.dead) {
        if (now > p.aiNext || Math.hypot(p.aiGoalX - p.x, p.aiGoalZ - p.z) < 2.5) {
          p.aiGoalX = (Math.random() - 0.5) * 60; p.aiGoalZ = (Math.random() - 0.5) * 74;
          p.aiNext = now + 3000;
        }
        const dx = p.aiGoalX - p.x, dz = p.aiGoalZ - p.z, l = Math.hypot(dx, dz) || 1;
        p.vx = (dx / l) * 6.5; p.vz = (dz / l) * 6.5;
        resolvePlayerPhysics(p, 0.04, curBoxes);
        p.yaw = Math.atan2(-p.vx, -p.vz);
        if (!me.dead && (mode === 'FFA' || me.team !== p.team)) {
          const ex = me.x - p.x, ey = me.y + 1.2 - (p.y + 1.5), ez = me.z - p.z;
          const ed = Math.hypot(ex, ey, ez);
          if (ed < 55) {
            const wall = raycastMap({ x: p.x, y: p.y + 1.5, z: p.z }, { x: ex / ed, y: ey / ed, z: ez / ed }, ed, curBoxes);
            if (!wall || wall.dist >= ed - 0.3) {
              p.yaw = Math.atan2(-ex, -ez);
              if (now - p.lastShotAt > 520) {
                fireShot(p, { x: p.x, y: p.y + 1.5, z: p.z }, {
                  x: ex + (Math.random() - 0.5) * 3.5,
                  y: ey + (Math.random() - 0.5) * 2.5,
                  z: ez + (Math.random() - 0.5) * 3.5
                });
              }
            }
          }
        }
      }
    }
    broadcastRoom({
      type: 'state', room: currentRoom,
      rooms: [{ code: currentRoom, mode, players: players.size }],
      mode, scores, targetScore: mode === 'FFA' ? 20 : 40,
      remainingSec: Math.max(0, 600 - Math.floor((now - startedAt) / 1000)),
      ended: false, winnerText: '',
      players: [...players.values()].map((p) => ({
        id: p.id, name: p.name, team: p.team, isBot: p.isBot,
        x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2),
        yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), crouch: p.crouch,
        weapon: p.weapon, ammo: p.ammo, grenades: p.grenades ?? 2, flashes: p.flashes ?? 2, reloading: p.reloadUntil > now,
        hp: Math.ceil(p.hp), dead: p.dead, invuln: false,
        kills: p.kills, deaths: p.deaths, streak: p.streak
      }))
    });
  }, 40);
}

if (ws) {
  ws.addEventListener('message', (ev) => handleServerMessage(JSON.parse(ev.data)));
  ws.addEventListener('error', () => startLocalFallback());
  ws.addEventListener('close', () => startLocalFallback());
} else {
  startLocalFallback();
}

function updateBottomHud() {
  hpValEl.textContent = `${myState.hp} HP`;
  hpBarFillEl.style.width = `${Math.max(0, myState.hp)}%`;
  if (myState.hp > 55) {
    hpBarFillEl.style.background = 'linear-gradient(90deg, #22c55e, #4ade80)';
  } else if (myState.hp > 25) {
    hpBarFillEl.style.background = 'linear-gradient(90deg, #eab308, #facc15)';
  } else {
    hpBarFillEl.style.background = 'linear-gradient(90deg, #dc2626, #f87171)';
  }

  if (myState.dead) {
    statusTagEl.textContent = 'RESPAWNING...';
    statusTagEl.style.color = '#ef4444';
  } else if (myState.invuln) {
    statusTagEl.textContent = 'SPAWN SHIELD';
    statusTagEl.style.color = '#38bdf8';
  } else if (myState.reloading) {
    statusTagEl.textContent = 'RELOADING...';
    statusTagEl.style.color = '#f2b722';
  } else {
    statusTagEl.textContent = myState.team;
    statusTagEl.style.color = myState.team === 'BLUE' ? '#58a6ff' : '#ff6b6b';
  }

  ammoCountEl.textContent = myState.reloading ? 'RLD' : String(myState.ammo);
  if (nadeCountEl) nadeCountEl.textContent = String(myState.grenades ?? 2);
  if (flashCountEl) flashCountEl.textContent = String(myState.flashes ?? 2);
}

function renderScoreboard() {
  const sorted = [...latestPlayers].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  sbBodyEl.innerHTML = sorted
    .map((p) => {
      const kd = p.deaths === 0 ? p.kills.toFixed(1) : (p.kills / p.deaths).toFixed(2);
      const tCol = p.team === 'BLUE' ? '#58a6ff' : '#ff6b6b';
      const meMark = p.id === myState.id ? ' (YOU)' : '';
      return `<tr>
        <td style="color:${p.id === myState.id ? '#f2b722' : '#fff'}">${p.name}${meMark}</td>
        <td style="color:${tCol}">${currentMode === 'FFA' ? 'SOLO' : p.team}</td>
        <td>${p.weapon}</td>
        <td>${p.kills}</td>
        <td>${p.deaths}</td>
        <td>${kd}</td>
        <td>${p.streak}</td>
      </tr>`;
    })
    .join('');
}

// --- MAIN GAME LOOP ---
let lastTime = performance.now();
let lastNetSend = 0;
let bobPhase = 0;

function animate(now) {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  const wep = WEAPONS[myState.weapon];

  // Auto-fire & buffered tap-fire handling
  if (pointerLocked && !myState.dead && ((myState.firing && wep.auto) || now < myState.fireBufferUntil)) {
    tryShoot();
  }

  // Smooth recoil recovery when not actively firing
  if (!myState.firing && myState.recoilAccum > 0 && now - myState.lastClientShotAt > wep.fireRateMs + 45) {
    const recStep = Math.min(myState.recoilAccum, dt * 0.22);
    myState.pitch = Math.max(-1.48, myState.pitch - recStep);
    myState.recoilAccum = Math.max(0, myState.recoilAccum - recStep);
  }

  const activeBoxes = getMap(currentMap).boxes;

  // Movement physics
  if (!myState.dead) {
    let forward = 0;
    let strafe = 0;
    if (pointerLocked) {
      if (keys['KeyW'] || keys['ArrowUp']) forward += 1;
      if (keys['KeyS'] || keys['ArrowDown']) forward -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) strafe += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) strafe -= 1;
      if (keys['Space'] && myState.grounded) {
        myState.vy = ARENA.jumpSpeed;
        myState.grounded = false;
        myState.crouch = false;
      }
    }

    const len = Math.hypot(forward, strafe);
    if (len > 0) {
      forward /= len;
      strafe /= len;
    }

    let speed = ARENA.moveSpeed;
    if (myState.crouch) speed *= ARENA.crouchMult;
    else if (myState.ads) speed *= 0.72;
    else if (keys['ShiftLeft'] && forward > 0) speed *= ARENA.sprintMult;

    const sin = Math.sin(myState.yaw);
    const cos = Math.cos(myState.yaw);
    myState.vx = (-sin * forward + cos * strafe) * speed;
    myState.vz = (-cos * forward - sin * strafe) * speed;

    resolvePlayerPhysics(myState, dt, activeBoxes);

    // Smooth camera height + subtle head bob (FPP vs TPP)
    const targetEye = myState.crouch ? ARENA.crouchEye : ARENA.standEye;
    const isMoving = len > 0 && myState.grounded;
    if (isMoving) bobPhase += dt * (keys['ShiftLeft'] ? 11 : 7.5);
    const bobOffset = isMoving ? Math.sin(bobPhase) * (myState.ads ? 0.002 : 0.014) : 0;

    camera.rotation.order = 'YXZ';
    camera.rotation.y = myState.yaw;
    camera.rotation.x = myState.pitch;

    const showTpp = myState.tpp && !myState.ads;
    localAvatar.group.visible = showTpp && !myState.dead;

    if (showTpp) {
      // Update own 3rd-person soldier model
      const myCol = myState.team === 'BLUE' ? 0x3b82f6 : 0xef4444;
      localAvatar.chestBand.material.color.setHex(myCol);
      localAvatar.helmet.material.color.setHex(myCol);
      localAvatar.shieldRing.visible = Boolean(myState.invuln);
      localAvatar.group.position.set(myState.x, myState.y, myState.z);
      localAvatar.group.rotation.y = myState.yaw;
      localAvatar.armGroup.rotation.x = myState.pitch;
      localAvatar.group.scale.y = THREE.MathUtils.lerp(
        localAvatar.group.scale.y,
        myState.crouch ? 0.68 : 1.0,
        dt * 14
      );
      if (len > 0) {
        localAvatar.walkPhase += dt * (keys['ShiftLeft'] ? 16 : 12);
        localAvatar.leftLeg.rotation.x = Math.sin(localAvatar.walkPhase) * 0.55;
        localAvatar.rightLeg.rotation.x = -Math.sin(localAvatar.walkPhase) * 0.55;
      } else {
        localAvatar.leftLeg.rotation.x = THREE.MathUtils.lerp(localAvatar.leftLeg.rotation.x, 0, dt * 10);
        localAvatar.rightLeg.rotation.x = THREE.MathUtils.lerp(localAvatar.rightLeg.rotation.x, 0, dt * 10);
      }

      // Over-the-right-shoulder TPP camera with wall collision check
      const pivot = {
        x: myState.x + cos * 0.48,
        y: myState.y + targetEye + 0.22,
        z: myState.z - sin * 0.48
      };
      const camBack = {
        x: sin * Math.cos(myState.pitch),
        y: -Math.sin(myState.pitch),
        z: cos * Math.cos(myState.pitch)
      };
      const maxTppDist = 3.1;
      const wallHit = raycastMap(pivot, camBack, maxTppDist, activeBoxes);
      const safeDist = wallHit ? Math.max(0.45, wallHit.dist - 0.25) : maxTppDist;

      camera.position.set(
        pivot.x + camBack.x * safeDist,
        pivot.y + camBack.y * safeDist,
        pivot.z + camBack.z * safeDist
      );
    } else {
      camera.position.x = myState.x;
      camera.position.z = myState.z;
      camera.position.y = THREE.MathUtils.lerp(
        camera.position.y,
        myState.y + targetEye + bobOffset,
        dt * 16
      );
    }

    // FOV & Red Dot Sight ADS handling
    const targetFov = myState.ads ? wep.adsFov : 75;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 16);
    camera.updateProjectionMatrix();

    if (myState.ads && pointerLocked && !myState.reloading) {
      sniperScopeEl.classList.toggle('sniper-mode', Boolean(wep.sniper));
      sniperScopeEl.style.display = 'block';
      crosshairEl.style.display = 'none';
    } else {
      sniperScopeEl.style.display = 'none';
      crosshairEl.style.display = 'block';
    }
    fpGunGroup.visible = !showTpp && !(myState.ads && wep.sniper && !myState.reloading);

    // Dynamic crosshair spread feedback based on movement & firing recoil
    const chGap = Math.round((isMoving ? 3.5 : 0) + myState.recoilKick * 340);
    const chT = document.getElementById('ch-t');
    const chB = document.getElementById('ch-b');
    const chL = document.getElementById('ch-l');
    const chR = document.getElementById('ch-r');
    if (chT) chT.style.transform = `translateY(${-chGap}px)`;
    if (chB) chB.style.transform = `translateY(${chGap}px)`;
    if (chL) chL.style.transform = `translateX(${-chGap}px)`;
    if (chR) chR.style.transform = `translateX(${chGap}px)`;

    // First-person gun ADS + steady Recoil + Reload + Throw animation
    myState.recoilKick = THREE.MathUtils.lerp(myState.recoilKick, 0, dt * 28);
    const throwing = now < (myState.throwAnimUntil || 0);
    const gunBobX = isMoving && !myState.ads ? Math.cos(bobPhase * 0.5) * 0.006 : 0;
    const gunBobY = isMoving && !myState.ads ? Math.abs(Math.sin(bobPhase)) * -0.006 : 0;
    const targetGunX = (myState.ads ? 0.0 : 0.22) + gunBobX;
    const targetGunY = (throwing ? -0.38 : myState.reloading ? -0.34 : myState.ads ? -0.091 : -0.2) + gunBobY;
    const targetGunZ = (myState.ads ? -0.32 : -0.4) + myState.recoilKick;

    if (myState.shakeAmt > 0.002) {
      camera.rotation.z = (Math.random() - 0.5) * myState.shakeAmt * 0.14;
      camera.position.y += (Math.random() - 0.5) * myState.shakeAmt * 0.22;
      myState.shakeAmt = Math.max(0, myState.shakeAmt - dt * 1.4);
    } else {
      camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, 0, dt * 12);
    }
    localAvatar.group.rotation.x = 0;

    fpGunGroup.position.x = THREE.MathUtils.lerp(fpGunGroup.position.x, targetGunX, dt * 20);
    fpGunGroup.position.y = THREE.MathUtils.lerp(fpGunGroup.position.y, targetGunY, dt * 18);
    fpGunGroup.position.z = THREE.MathUtils.lerp(fpGunGroup.position.z, targetGunZ, dt * 26);
    fpGunGroup.rotation.x = throwing ? -0.35 : myState.reloading ? 0.42 : myState.ads ? 0 : myState.recoilKick * 0.25;
  } else {
    // Death-cam & 3s respawn countdown feedback
    fpGunGroup.visible = false;
    sniperScopeEl.style.display = 'none';
    crosshairEl.style.display = 'none';

    const elapsedMs = Math.max(0, now - (myState.diedAt || now));
    const remSec = Math.max(0, (3000 - elapsedMs) / 1000);
    if (deathTimerTextEl) deathTimerTextEl.textContent = `RESPAWNING IN ${remSec.toFixed(1)}s`;
    if (deathBarFillEl) deathBarFillEl.style.width = `${Math.min(100, (elapsedMs / 3000) * 100)}%`;

    // Pan death-cam toward killer & tilt to ground
    const killerAv = myState.killerId ? remoteAvatars.get(myState.killerId) : null;
    if (killerAv) {
      const dx = killerAv.group.position.x - myState.x;
      const dz = killerAv.group.position.z - myState.z;
      const targetYaw = Math.atan2(-dx, -dz);
      camera.rotation.y = THREE.MathUtils.lerp(camera.rotation.y, targetYaw, dt * 4);
    }
    camera.position.y = THREE.MathUtils.lerp(camera.position.y, myState.y + 0.35, dt * 6);
    camera.rotation.x = THREE.MathUtils.lerp(camera.rotation.x, 0.12, dt * 5);
    camera.rotation.z = THREE.MathUtils.lerp(camera.rotation.z, 0.42, dt * 6);

    if (myState.tpp) {
      localAvatar.group.visible = true;
      localAvatar.group.rotation.x = THREE.MathUtils.lerp(
        localAvatar.group.rotation.x,
        -Math.PI / 2,
        dt * 10
      );
    } else {
      localAvatar.group.visible = false;
    }
  }

  if (muzzleFlashMesh && muzzleFlashMesh.material.opacity > 0) {
    muzzleFlashMesh.material.opacity = Math.max(0, muzzleFlashMesh.material.opacity - dt * 18);
  }

  // Send position update to server (30 Hz)
  if (now - lastNetSend > 33 && !myState.dead) {
    lastNetSend = now;
    sendWs({
      type: 'move',
      x: +myState.x.toFixed(2),
      y: +myState.y.toFixed(2),
      z: +myState.z.toFixed(2),
      yaw: +myState.yaw.toFixed(3),
      pitch: +myState.pitch.toFixed(3),
      crouch: myState.crouch,
      ads: myState.ads
    });
  }

  // Interpolate remote player avatars (+ ragdoll collapse on death)
  for (const av of remoteAvatars.values()) {
    const distMove = Math.hypot(
      av.targetPos.x - av.group.position.x,
      av.targetPos.z - av.group.position.z
    );
    av.group.position.lerp(av.targetPos, Math.min(1, dt * 15));
    av.group.rotation.y = av.targetYaw;
    av.armGroup.rotation.x = av.targetPitch;
    av.group.scale.y = THREE.MathUtils.lerp(av.group.scale.y, av.crouch ? 0.68 : 1.0, dt * 14);
    av.group.rotation.x = THREE.MathUtils.lerp(
      av.group.rotation.x,
      av.dead ? -Math.PI / 2 : 0,
      dt * 12
    );

    if (distMove > 0.015) {
      av.walkPhase += dt * 14;
      av.leftLeg.rotation.x = Math.sin(av.walkPhase) * 0.55;
      av.rightLeg.rotation.x = -Math.sin(av.walkPhase) * 0.55;
    } else {
      av.leftLeg.rotation.x = THREE.MathUtils.lerp(av.leftLeg.rotation.x, 0, dt * 10);
      av.rightLeg.rotation.x = THREE.MathUtils.lerp(av.rightLeg.rotation.x, 0, dt * 10);
    }
  }

  // Update active bullet tracers
  for (let i = activeEffects.length - 1; i >= 0; i--) {
    const fx = activeEffects[i];
    const age = now - fx.born;
    if (age >= fx.ttl) {
      scene.remove(fx.line);
      scene.remove(fx.spark);
      fx.line.geometry.dispose();
      fx.line.material.dispose();
      activeEffects.splice(i, 1);
    } else {
      fx.line.material.opacity = 1 - age / fx.ttl;
    }
  }

  // Step active grenades & flashbangs in 3D space
  for (const [id, th] of activeThrowables.entries()) {
    if (now - th.born > th.fuseMs + 600) {
      scene.remove(th.mesh);
      if (th.trailLine) {
        scene.remove(th.trailLine);
        th.trailLine.geometry.dispose();
        th.trailLine.material.dispose();
      }
      activeThrowables.delete(id);
      continue;
    }
    stepThrowablePhysics(th, dt, activeBoxes);
    th.mesh.position.set(th.x, th.y, th.z);
    th.mesh.rotation.x += dt * 11;
    th.mesh.rotation.z += dt * 7;
    if (th.trailLine && th.trailPts) {
      th.trailPts.push(new THREE.Vector3(th.x, th.y, th.z));
      if (th.trailPts.length > 16) th.trailPts.shift();
      th.trailLine.geometry.setFromPoints(th.trailPts);
    }
  }

  // Update explosion spheres & shockwave rings
  for (let i = activeExplosions.length - 1; i >= 0; i--) {
    const ex = activeExplosions[i];
    const age = now - ex.born;
    if (age >= ex.ttl) {
      scene.remove(ex.mesh);
      activeExplosions.splice(i, 1);
    } else {
      const t = age / ex.ttl;
      const sc = 0.5 + t * ex.maxScale;
      ex.mesh.scale.set(sc, sc, sc);
      if (ex.core) ex.core.material.opacity = Math.max(0, 1 - t * 1.4);
      if (ex.outer) ex.outer.material.opacity = 0.9 * (1 - t);
      if (ex.ring) ex.ring.material.opacity = 0.95 * (1 - t);
    }
  }

  // Decay flashbang screen blind overlay
  if (myState.flashAlpha > 0) {
    myState.flashAlpha = Math.max(0, myState.flashAlpha - myState.flashDecay * dt);
    if (flashbangOverlayEl) {
      flashbangOverlayEl.style.opacity = String(Math.min(1, myState.flashAlpha * 1.15));
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(animate);
