import * as THREE from 'three';
import {
  ARENA,
  WEAPONS,
  MAP_BOXES,
  SPAWN_POINTS,
  rayBoxIntersect,
  raycastMap,
  resolvePlayerPhysics
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
}

const sfx = new SoundFX();

// --- PROCEDURAL TEXTURES ---
function makeFloorTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#252a32';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#2f3640';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(255,255,255,0.03)';
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

// --- THREE.JS SCENE SETUP ---
const canvas = document.getElementById('game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x18222f);
scene.fog = new THREE.FogExp2(0x18222f, 0.0065);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 320);
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

// Build Arena Obstacles from shared MAP_BOXES
const texCache = new Map();
for (const b of MAP_BOXES) {
  const geo = new THREE.BoxGeometry(b.w, b.h, b.d);
  let mat;
  if (b.tag === 'container' || b.tag === 'crate') {
    if (!texCache.has(b.color)) {
      texCache.set(b.color, makeContainerTexture(b.color));
    }
    mat = new THREE.MeshStandardMaterial({
      map: texCache.get(b.color),
      roughness: 0.65,
      metalness: 0.25
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
  scene.add(mesh);
}

// Warehouse Overhead Roof Beams for atmosphere
const beamGeo = new THREE.BoxGeometry(44, 0.45, 0.8);
const beamMat = new THREE.MeshStandardMaterial({ color: 0x333942, metalness: 0.6, roughness: 0.4 });
for (let z = -22; z <= 22; z += 7.3) {
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.set(0, 7.6, z);
  beam.castShadow = true;
  scene.add(beam);
}

// --- FIRST-PERSON VIEWMODEL GUN ---
const fpGunGroup = new THREE.Group();
camera.add(fpGunGroup);

let muzzleFlashMesh = null;
function rebuildFpGun(weaponId) {
  while (fpGunGroup.children.length) fpGunGroup.remove(fpGunGroup.children[0]);
  const wep = WEAPONS[weaponId] || WEAPONS.M416;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: wep.color,
    roughness: 0.45,
    metalness: 0.65
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x16191d,
    roughness: 0.5,
    metalness: 0.8
  });

  // Receiver
  const rec = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.42), bodyMat);
  fpGunGroup.add(rec);

  // Barrel
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.016, wep.barrelLen, 10),
    darkMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -wep.barrelLen / 2 - 0.12);
  fpGunGroup.add(barrel);

  // Magazine
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.18, 0.08), darkMat);
  mag.position.set(0, -0.12, -0.06);
  mag.rotation.x = 0.22;
  fpGunGroup.add(mag);

  // Sight / Scope (8x Sniper Scope for AWM, 3D Red Dot Sight for M416 & AKM)
  if (wep.sniper) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.28, 12), darkMat);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.095, -0.04);
    fpGunGroup.add(scope);
  } else {
    const rdsBase = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.016, 0.09), darkMat);
    rdsBase.position.set(0, 0.062, -0.02);
    fpGunGroup.add(rdsBase);

    const rdsLeft = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.042, 0.04), darkMat);
    rdsLeft.position.set(-0.024, 0.09, -0.02);
    const rdsRight = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.042, 0.04), darkMat);
    rdsRight.position.set(0.024, 0.09, -0.02);
    const rdsTop = new THREE.Mesh(new THREE.BoxGeometry(0.054, 0.006, 0.04), darkMat);
    rdsTop.position.set(0, 0.112, -0.02);
    fpGunGroup.add(rdsLeft, rdsRight, rdsTop);

    const rdsDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.0032, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xff1e1e })
    );
    rdsDot.position.set(0, 0.091, -0.02);
    fpGunGroup.add(rdsDot);
  }

  // Muzzle flash
  const flashGeo = new THREE.ConeGeometry(0.08, 0.22, 6);
  const flashMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    transparent: true,
    opacity: 0
  });
  muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
  muzzleFlashMesh.rotation.x = -Math.PI / 2;
  muzzleFlashMesh.position.set(0, 0.02, -wep.barrelLen - 0.22);
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

  const teamMat = new THREE.MeshStandardMaterial({ color: teamColorHex, roughness: 0.5 });
  const vestMat = new THREE.MeshStandardMaterial({ color: 0x272c35, roughness: 0.7 });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0xe2b897, roughness: 0.6 });
  const pantMat = new THREE.MeshStandardMaterial({ color: 0x333c4a, roughness: 0.8 });
  const gunMat = new THREE.MeshStandardMaterial({ color: 0x18181b, metalness: 0.7 });

  // Legs
  const legGeo = new THREE.BoxGeometry(0.22, 0.72, 0.24);
  const leftLeg = new THREE.Mesh(legGeo, pantMat);
  leftLeg.position.set(-0.14, 0.36, 0);
  leftLeg.castShadow = true;
  const rightLeg = new THREE.Mesh(legGeo, pantMat);
  rightLeg.position.set(0.14, 0.36, 0);
  rightLeg.castShadow = true;
  group.add(leftLeg, rightLeg);

  // Torso + Team Vest
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.66, 0.32), vestMat);
  body.position.set(0, 1.05, 0);
  body.castShadow = true;
  group.add(body);

  const chestBand = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.34), teamMat);
  chestBand.position.set(0, 1.15, 0);
  group.add(chestBand);

  // Head + Level 3 Helmet
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 1.56, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.36), skinMat);
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.24, 0.4), teamMat);
  helmet.position.set(0, 0.09, 0);
  headGroup.add(head, helmet);
  group.add(headGroup);

  // Arms + Rifle
  const armGroup = new THREE.Group();
  armGroup.position.set(0.28, 1.18, 0);
  const rifle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.68), gunMat);
  rifle.position.set(0, -0.04, -0.26);
  armGroup.add(rifle);
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

// --- BULLET TRACERS & IMPACT SPARKS ---
const activeEffects = [];

function spawnBulletTracer(start, end, isEnemyHit) {
  const points = [
    new THREE.Vector3(start.x, start.y, start.z),
    new THREE.Vector3(end.x, end.y, end.z)
  ];
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const mat = new THREE.LineBasicMaterial({
    color: isEnemyHit ? 0xff4444 : 0xfde047,
    transparent: true,
    opacity: 0.85
  });
  const line = new THREE.Line(geo, mat);
  scene.add(line);

  // Impact spark box
  const spark = new THREE.Mesh(
    new THREE.BoxGeometry(0.12, 0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: isEnemyHit ? 0xef4444 : 0xfacc15 })
  );
  spark.position.set(end.x, end.y, end.z);
  scene.add(spark);

  activeEffects.push({ line, spark, born: performance.now(), ttl: 120 });
}

// --- PLAYER & CLIENT STATE ---
const myState = {
  id: null,
  name: localStorage.getItem('webtdm_name') || `Player_${Math.floor(100 + Math.random() * 899)}`,
  team: 'BLUE',
  preferredTeam: 'AUTO',
  weapon: 'M416',
  ammo: 30,
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
  recoilKick: 0
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
const centerBannerEl = document.getElementById('center-banner');
const killfeedEl = document.getElementById('killfeed');
const scoreboardEl = document.getElementById('scoreboard');
const sbBodyEl = document.getElementById('sb-body');

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
      return `<button type="button" class="btn-small room-pill" data-room="${r.code}" style="border-color:${border};background:${bg}">
        ${r.code} (${r.players} • ${r.mode})
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
    mode: currentMode
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
    mode: currentMode
  });
  canvas.requestPointerLock();
});

document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === canvas;
  lobbyOverlay.style.display = pointerLocked ? 'none' : 'flex';
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
  if (e.code === 'Digit1') selectWeapon('M416');
  if (e.code === 'Digit2') selectWeapon('AKM');
  if (e.code === 'Digit3') selectWeapon('AWM');
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
  const sens = myState.ads ? (wep.sniper ? 0.00065 : 0.0012) : 0.0021;
  myState.yaw -= e.movementX * sens;
  myState.pitch = Math.max(-1.48, Math.min(1.48, myState.pitch - e.movementY * sens));
});

window.addEventListener('mousedown', (e) => {
  if (!pointerLocked || myState.dead) return;
  sfx.init();
  if (e.button === 0) {
    myState.firing = true;
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
  const dir = new THREE.Vector3(
    (Math.random() - 0.5) * spread,
    (Math.random() - 0.5) * spread,
    -1
  )
    .normalize()
    .applyEuler(new THREE.Euler(myState.pitch, myState.yaw, 0, 'YXZ'));

  const eyeY = myState.y + (myState.crouch ? ARENA.crouchEye : ARENA.standEye);
  sendWs({
    type: 'shoot',
    origin: { x: myState.x, y: eyeY, z: myState.z },
    dir: { x: dir.x, y: dir.y, z: dir.z }
  });

  // Apply smooth, minimal recoil kick
  const mult = myState.ads ? 0.45 : 0.85;
  myState.pitch = Math.min(1.48, myState.pitch + wep.recoilPitch * mult);
  myState.yaw += (Math.random() - 0.5) * wep.recoilYaw * 2 * mult;
  myState.recoilKick = myState.ads ? 0.01 : 0.022;

  if (muzzleFlashMesh) {
    muzzleFlashMesh.material.opacity = 0.95;
    muzzleFlashMesh.rotation.z = Math.random() * Math.PI;
  }
}

// --- WEBSOCKET CONNECTION (+ CLOUDFLARE TUNNEL BRIDGE FOR NETLIFY) ---
const ACTIVE_TUNNEL_HOST = 'executives-firms-subsidiary-performs.trycloudflare.com';
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
    myState.x = msg.x;
    myState.y = msg.y;
    myState.z = msg.z;
    myState.vx = 0;
    myState.vy = 0;
    myState.vz = 0;
    myState.yaw = msg.yaw;
    myState.pitch = 0;
    myState.hp = msg.hp;
    myState.ammo = msg.ammo;
    myState.dead = false;
    if (msg.team) myState.team = msg.team;
  } else if (msg.type === 'state') {
    if (msg.room) currentRoom = cleanRoomCode(msg.room);
    if (msg.rooms) renderRoomList(msg.rooms);
    currentMode = msg.mode;
    targetScore = msg.targetScore;
    latestPlayers = msg.players;

    // Update top HUD
    const mins = String(Math.floor(msg.remainingSec / 60)).padStart(2, '0');
    const secs = String(msg.remainingSec % 60).padStart(2, '0');
    timerTextEl.textContent = `${mins}:${secs}`;
    modeBadgeEl.textContent = `ROOM: ${currentRoom} • ${msg.mode === 'FFA' ? 'FFA' : 'TEAM'}`;
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
        myState.hp = p.hp;
        myState.dead = p.dead;
        myState.team = p.team;
        myState.invuln = p.invuln;
        myState.reloading = p.reloading;
        if (!myState.firing) myState.ammo = p.ammo;
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
      av.group.visible = !p.dead;
      av.shieldRing.visible = Boolean(p.invuln);
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
  } else if (msg.type === 'match_end') {
    showCenterBanner(msg.winnerText, 5500);
  } else if (msg.type === 'match_reset') {
    showCenterBanner(`NEW ${msg.mode} MATCH STARTED!`, 2500);
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
    const pool = mode === 'FFA' ? SPAWN_POINTS.FFA : team === 'BLUE' ? SPAWN_POINTS.BLUE : SPAWN_POINTS.RED;
    return pool[Math.floor(Math.random() * pool.length)];
  };

  const me = {
    id: 'local_p1', name: myState.name, team: 'BLUE', isBot: false,
    weapon: 'M416', ammo: 30, reloadUntil: 0, lastShotAt: 0,
    x: -5, y: 0, z: -51, vx: 0, vy: 0, vz: 0, yaw: Math.PI, pitch: 0,
    crouch: false, ads: false, hp: 100, dead: false, kills: 0, deaths: 0, streak: 0,
    invulnUntil: Date.now() + 2500, lastDamagedAt: Date.now()
  };
  players.set(me.id, me);

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
    const mapHit = raycastMap(origin, rayDir, wep.range, MAP_BOXES);
    let closest = mapHit ? mapHit.dist : wep.range;
    let hitTarget = null;
    let hs = false;

    for (const t of players.values()) {
      if (t.id === shooter.id || t.dead || (mode === 'TEAM' && t.team === shooter.team)) continue;
      const bodyH = t.crouch ? 0.82 : 1.32;
      const dH = rayBoxIntersect(origin, rayDir, { x: t.x, y: t.y + bodyH, z: t.z, w: 0.52, h: 0.44, d: 0.52 }, closest);
      if (dH !== null && dH < closest) { closest = dH; hitTarget = t; hs = true; }
      const dB = rayBoxIntersect(origin, rayDir, { x: t.x, y: t.y, z: t.z, w: 0.92, h: bodyH, d: 0.92 }, closest);
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
      }
    }
  };

  const applyPlayerAction = (actor, m) => {
    if (m.type === 'join' || m.type === 'join_room') {
      if (m.name) actor.name = String(m.name).slice(0, 16);
      if (m.weapon && WEAPONS[m.weapon]) { actor.weapon = m.weapon; actor.ammo = WEAPONS[m.weapon].magSize; }
      if (m.team === 'BLUE' || m.team === 'RED') actor.team = m.team;
      if (m.mode) mode = m.mode;
    } else if (m.type === 'move') {
      actor.x = m.x; actor.y = m.y; actor.z = m.z; actor.yaw = m.yaw; actor.pitch = m.pitch; actor.crouch = m.crouch;
    } else if (m.type === 'shoot') {
      fireShot(actor, m.origin, m.dir);
    } else if (m.type === 'reload') {
      actor.reloadUntil = Date.now() + (WEAPONS[actor.weapon]?.reloadMs || 1800);
    } else if (m.type === 'weapon' && WEAPONS[m.weapon]) {
      actor.weapon = m.weapon; actor.ammo = WEAPONS[m.weapon].magSize; actor.reloadUntil = 0;
    } else if (m.type === 'set_mode') {
      mode = m.mode; scores.BLUE = 0; scores.RED = 0;
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
    for (const p of players.values()) {
      if (p.dead && now >= p.respawnAt) {
        const sp = pickSpawn(p.team);
        p.x = sp.x; p.y = sp.y; p.z = sp.z; p.yaw = sp.yaw; p.hp = 100; p.dead = false;
        p.ammo = WEAPONS[p.weapon].magSize;
        sendToPlayer(p.id, { type: 'respawn', room: currentRoom, x: p.x, y: p.y, z: p.z, yaw: p.yaw, hp: 100, ammo: p.ammo });
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
        resolvePlayerPhysics(p, 0.04, MAP_BOXES);
        p.yaw = Math.atan2(-p.vx, -p.vz);
        if (!me.dead && (mode === 'FFA' || me.team !== p.team)) {
          const ex = me.x - p.x, ey = me.y + 1.2 - (p.y + 1.5), ez = me.z - p.z;
          const ed = Math.hypot(ex, ey, ez);
          if (ed < 55) {
            const wall = raycastMap({ x: p.x, y: p.y + 1.5, z: p.z }, { x: ex / ed, y: ey / ed, z: ez / ed }, ed);
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
        weapon: p.weapon, ammo: p.ammo, reloading: p.reloadUntil > now,
        hp: Math.ceil(p.hp), dead: p.dead, invuln: false,
        kills: p.kills, deaths: p.deaths, streak: p.streak
      }))
    });
  }, 40);
}

if (ws) {
  ws.addEventListener('message', (ev) => handleServerMessage(JSON.parse(ev.data)));
  ws.addEventListener('error', () => startLocalFallback());
  ws.addEventListener('close', () => { if (!myState.id) startLocalFallback(); });
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

  // Auto-fire handling
  if (pointerLocked && myState.firing && wep.auto && !myState.dead) {
    tryShoot();
  }

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

    resolvePlayerPhysics(myState, dt, MAP_BOXES);

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
      const wallHit = raycastMap(pivot, camBack, maxTppDist, MAP_BOXES);
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

    // First-person gun ADS + steady Recoil + Reload animation
    myState.recoilKick = THREE.MathUtils.lerp(myState.recoilKick, 0, dt * 28);
    const gunBobX = isMoving && !myState.ads ? Math.cos(bobPhase * 0.5) * 0.006 : 0;
    const gunBobY = isMoving && !myState.ads ? Math.abs(Math.sin(bobPhase)) * -0.006 : 0;
    const targetGunX = (myState.ads ? 0.0 : 0.22) + gunBobX;
    const targetGunY = (myState.reloading ? -0.34 : myState.ads ? -0.091 : -0.2) + gunBobY;
    const targetGunZ = (myState.ads ? -0.32 : -0.4) + myState.recoilKick;

    fpGunGroup.position.x = THREE.MathUtils.lerp(fpGunGroup.position.x, targetGunX, dt * 20);
    fpGunGroup.position.y = THREE.MathUtils.lerp(fpGunGroup.position.y, targetGunY, dt * 18);
    fpGunGroup.position.z = THREE.MathUtils.lerp(fpGunGroup.position.z, targetGunZ, dt * 26);
    fpGunGroup.rotation.x = myState.reloading ? 0.42 : myState.ads ? 0 : myState.recoilKick * 0.25;
  } else {
    localAvatar.group.visible = false;
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

  // Interpolate remote player avatars
  for (const av of remoteAvatars.values()) {
    const distMove = Math.hypot(
      av.targetPos.x - av.group.position.x,
      av.targetPos.z - av.group.position.z
    );
    av.group.position.lerp(av.targetPos, Math.min(1, dt * 15));
    av.group.rotation.y = av.targetYaw;
    av.armGroup.rotation.x = av.targetPitch;
    av.group.scale.y = THREE.MathUtils.lerp(av.group.scale.y, av.crouch ? 0.68 : 1.0, dt * 14);

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

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

requestAnimationFrame(animate);
