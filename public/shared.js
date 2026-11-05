export const ARENA = {
  width: 84,
  depth: 116,
  wallHeight: 9,
  gravity: 26,
  jumpSpeed: 9.8,
  moveSpeed: 8.6,
  sprintMult: 1.32,
  crouchMult: 0.58,
  playerRadius: 0.55,
  standHeight: 1.75,
  crouchHeight: 1.15,
  standEye: 1.58,
  crouchEye: 1.0
};

export const WEAPONS = {
  M416: {
    id: 'M416',
    slot: 1,
    name: 'M416',
    desc: '5.56mm Auto Rifle',
    damage: 25,
    headMult: 2.0,
    fireRateMs: 92,
    magSize: 30,
    reloadMs: 1750,
    spread: 0.014,
    adsSpread: 0.0025,
    recoilPitch: 0.014,
    recoilYaw: 0.006,
    adsFov: 48,
    range: 170,
    pellets: 1,
    auto: true,
    color: 0x383e46,
    barrelLen: 0.62
  },
  AKM: {
    id: 'AKM',
    slot: 2,
    name: 'AKM',
    desc: '7.62mm Heavy AR',
    damage: 35,
    headMult: 2.1,
    fireRateMs: 122,
    magSize: 30,
    reloadMs: 1950,
    spread: 0.021,
    adsSpread: 0.005,
    recoilPitch: 0.022,
    recoilYaw: 0.01,
    adsFov: 52,
    range: 155,
    pellets: 1,
    auto: true,
    color: 0x724729,
    barrelLen: 0.65
  },
  AWM: {
    id: 'AWM',
    slot: 3,
    name: 'AWM',
    desc: '.300 Magnum Sniper',
    damage: 105,
    headMult: 2.5,
    fireRateMs: 1100,
    magSize: 5,
    reloadMs: 2500,
    spread: 0.048,
    adsSpread: 0.0003,
    recoilPitch: 0.055,
    recoilYaw: 0.008,
    adsFov: 18,
    range: 240,
    pellets: 1,
    auto: false,
    sniper: true,
    color: 0x3b5338,
    barrelLen: 0.88
  },
  S12K: {
    id: 'S12K',
    slot: 4,
    name: 'S12K',
    desc: '12G Semi-Auto Shotgun',
    damage: 18,
    headMult: 1.5,
    fireRateMs: 310,
    magSize: 8,
    reloadMs: 2000,
    spread: 0.072,
    adsSpread: 0.045,
    recoilPitch: 0.038,
    recoilYaw: 0.016,
    adsFov: 58,
    range: 55,
    pellets: 8,
    auto: false,
    color: 0x26292e,
    barrelLen: 0.56
  }
};

// PUBG Warehouse style symmetrical TDM arena boxes (center x, bottom y, center z, width w, height h, depth d)
export const MAP_BOXES = [
  // Perimeter walls
  { x: 0, y: 0, z: -58, w: 84, h: 9, d: 1.5, color: 0x4a5058, tag: 'wall' },
  { x: 0, y: 0, z: 58, w: 84, h: 9, d: 1.5, color: 0x4a5058, tag: 'wall' },
  { x: -42, y: 0, z: 0, w: 1.5, h: 9, d: 116, color: 0x4a5058, tag: 'wall' },
  { x: 42, y: 0, z: 0, w: 1.5, h: 9, d: 116, color: 0x4a5058, tag: 'wall' },

  // Spawn Shield Walls (Blue North z=-45, Red South z=+45)
  { x: 0, y: 0, z: -43, w: 22, h: 4.2, d: 1.4, color: 0x2b4c7e, tag: 'cover' },
  { x: -22, y: 0, z: -46, w: 10, h: 3.6, d: 1.4, color: 0x2b4c7e, tag: 'cover' },
  { x: 22, y: 0, z: -46, w: 10, h: 3.6, d: 1.4, color: 0x2b4c7e, tag: 'cover' },

  { x: 0, y: 0, z: 43, w: 22, h: 4.2, d: 1.4, color: 0x7e2b2b, tag: 'cover' },
  { x: -22, y: 0, z: 46, w: 10, h: 3.6, d: 1.4, color: 0x7e2b2b, tag: 'cover' },
  { x: 22, y: 0, z: 46, w: 10, h: 3.6, d: 1.4, color: 0x7e2b2b, tag: 'cover' },

  // Elevated Sniper Decks in Spawn Bases + Step Crates
  { x: -32, y: 0, z: -51, w: 12, h: 2.2, d: 8, color: 0x5c6470, tag: 'deck' },
  { x: -24, y: 0, z: -51, w: 4, h: 1.1, d: 4, color: 0x8b6b4a, tag: 'crate' },
  { x: 32, y: 0, z: -51, w: 12, h: 2.2, d: 8, color: 0x5c6470, tag: 'deck' },
  { x: 24, y: 0, z: -51, w: 4, h: 1.1, d: 4, color: 0x8b6b4a, tag: 'crate' },

  { x: -32, y: 0, z: 51, w: 12, h: 2.2, d: 8, color: 0x5c6470, tag: 'deck' },
  { x: -24, y: 0, z: 51, w: 4, h: 1.1, d: 4, color: 0x8b6b4a, tag: 'crate' },
  { x: 32, y: 0, z: 51, w: 12, h: 2.2, d: 8, color: 0x5c6470, tag: 'deck' },
  { x: 24, y: 0, z: 51, w: 4, h: 1.1, d: 4, color: 0x8b6b4a, tag: 'crate' },

  // Central Warehouse Walls (creating indoor combat zone + side lanes)
  { x: -22, y: 0, z: -14, w: 1.2, h: 7.5, d: 20, color: 0x626973, tag: 'warehouse' },
  { x: -22, y: 0, z: 14, w: 1.2, h: 7.5, d: 20, color: 0x626973, tag: 'warehouse' },
  { x: 22, y: 0, z: -14, w: 1.2, h: 7.5, d: 20, color: 0x626973, tag: 'warehouse' },
  { x: 22, y: 0, z: 14, w: 1.2, h: 7.5, d: 20, color: 0x626973, tag: 'warehouse' },

  // Central Warehouse Shipping Containers
  { x: -9, y: 0, z: -16, w: 4.2, h: 3.4, d: 11, color: 0xb8372d, tag: 'container' },
  { x: 9, y: 0, z: -16, w: 4.2, h: 3.4, d: 11, color: 0x285999, tag: 'container' },
  { x: -9, y: 0, z: 16, w: 4.2, h: 3.4, d: 11, color: 0x285999, tag: 'container' },
  { x: 9, y: 0, z: 16, w: 4.2, h: 3.4, d: 11, color: 0xb8372d, tag: 'container' },

  // Center Bridge / Crossroads Cover
  { x: 0, y: 0, z: 0, w: 5.2, h: 3.2, d: 5.2, color: 0xc9972c, tag: 'container' },
  { x: -13, y: 0, z: 0, w: 6, h: 1.35, d: 1.4, color: 0x7a8088, tag: 'barrier' },
  { x: 13, y: 0, z: 0, w: 6, h: 1.35, d: 1.4, color: 0x7a8088, tag: 'barrier' },
  { x: 0, y: 0, z: -8.5, w: 6, h: 1.35, d: 1.4, color: 0x7a8088, tag: 'barrier' },
  { x: 0, y: 0, z: 8.5, w: 6, h: 1.35, d: 1.4, color: 0x7a8088, tag: 'barrier' },

  // Mid-Map Wooden Crates (climbable)
  { x: -16, y: 0, z: -27, w: 3.2, h: 2.2, d: 3.2, color: 0x9b7649, tag: 'crate' },
  { x: -16, y: 0, z: -24.2, w: 2.4, h: 1.1, d: 2.2, color: 0xab8556, tag: 'crate' },
  { x: 16, y: 0, z: -27, w: 3.2, h: 2.2, d: 3.2, color: 0x9b7649, tag: 'crate' },
  { x: 16, y: 0, z: -24.2, w: 2.4, h: 1.1, d: 2.2, color: 0xab8556, tag: 'crate' },

  { x: -16, y: 0, z: 27, w: 3.2, h: 2.2, d: 3.2, color: 0x9b7649, tag: 'crate' },
  { x: -16, y: 0, z: 24.2, w: 2.4, h: 1.1, d: 2.2, color: 0xab8556, tag: 'crate' },
  { x: 16, y: 0, z: 27, w: 3.2, h: 2.2, d: 3.2, color: 0x9b7649, tag: 'crate' },
  { x: 16, y: 0, z: 24.2, w: 2.4, h: 1.1, d: 2.2, color: 0xab8556, tag: 'crate' },

  // crouch-peek concrete barriers near approaches
  { x: -5, y: 0, z: -31, w: 5.5, h: 1.35, d: 1.2, color: 0x7a8088, tag: 'barrier' },
  { x: 5, y: 0, z: -31, w: 5.5, h: 1.35, d: 1.2, color: 0x7a8088, tag: 'barrier' },
  { x: -5, y: 0, z: 31, w: 5.5, h: 1.35, d: 1.2, color: 0x7a8088, tag: 'barrier' },
  { x: 5, y: 0, z: 31, w: 5.5, h: 1.35, d: 1.2, color: 0x7a8088, tag: 'barrier' },

  // Outer Side Lane Containers & Cover (West & East flanks)
  { x: -32, y: 0, z: -22, w: 4.2, h: 3.4, d: 10, color: 0x2f6f4e, tag: 'container' },
  { x: -32, y: 0, z: 22, w: 4.2, h: 3.4, d: 10, color: 0xc9972c, tag: 'container' },
  { x: -33, y: 0, z: 0, w: 5.5, h: 1.4, d: 1.5, color: 0x7a8088, tag: 'barrier' },

  { x: 32, y: 0, z: -22, w: 4.2, h: 3.4, d: 10, color: 0xc9972c, tag: 'container' },
  { x: 32, y: 0, z: 22, w: 4.2, h: 3.4, d: 10, color: 0x2f6f4e, tag: 'container' },
  { x: 33, y: 0, z: 0, w: 5.5, h: 1.4, d: 1.5, color: 0x7a8088, tag: 'barrier' }
];

export const SPAWN_POINTS = {
  BLUE: [
    { x: -14, y: 0, z: -51, yaw: Math.PI },
    { x: -5, y: 0, z: -51, yaw: Math.PI },
    { x: 5, y: 0, z: -51, yaw: Math.PI },
    { x: 14, y: 0, z: -51, yaw: Math.PI },
    { x: -28, y: 2.2, z: -51, yaw: Math.PI },
    { x: 28, y: 2.2, z: -51, yaw: Math.PI }
  ],
  RED: [
    { x: -14, y: 0, z: 51, yaw: 0 },
    { x: -5, y: 0, z: 51, yaw: 0 },
    { x: 5, y: 0, z: 51, yaw: 0 },
    { x: 14, y: 0, z: 51, yaw: 0 },
    { x: -28, y: 2.2, z: 51, yaw: 0 },
    { x: 28, y: 2.2, z: 51, yaw: 0 }
  ],
  FFA: [
    { x: -15, y: 0, z: -51, yaw: Math.PI },
    { x: 15, y: 0, z: -51, yaw: Math.PI },
    { x: -15, y: 0, z: 51, yaw: 0 },
    { x: 15, y: 0, z: 51, yaw: 0 },
    { x: -35, y: 0, z: -34, yaw: -Math.PI / 2 },
    { x: 35, y: 0, z: -34, yaw: Math.PI / 2 },
    { x: -35, y: 0, z: 34, yaw: -Math.PI / 2 },
    { x: 35, y: 0, z: 34, yaw: Math.PI / 2 },
    { x: -36, y: 0, z: 0, yaw: -Math.PI / 2 },
    { x: 36, y: 0, z: 0, yaw: Math.PI / 2 },
    { x: 0, y: 0, z: -36, yaw: Math.PI },
    { x: 0, y: 0, z: 36, yaw: 0 }
  ]
};

export function rayBoxIntersect(origin, dir, box, maxDist = Infinity) {
  const minX = box.x - box.w / 2;
  const maxX = box.x + box.w / 2;
  const minY = box.y;
  const maxY = box.y + box.h;
  const minZ = box.z - box.d / 2;
  const maxZ = box.z + box.d / 2;

  let tmin = -Infinity;
  let tmax = Infinity;

  const axes = [
    [origin.x, dir.x, minX, maxX],
    [origin.y, dir.y, minY, maxY],
    [origin.z, dir.z, minZ, maxZ]
  ];

  for (let i = 0; i < 3; i++) {
    const [o, d, mn, mx] = axes[i];
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
    } else {
      let t1 = (mn - o) / d;
      let t2 = (mx - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }

  if (tmax < 0) return null;
  const hitDist = tmin >= 0 ? tmin : tmax;
  return hitDist <= maxDist ? hitDist : null;
}

export function raycastMap(origin, dir, maxDist = Infinity, boxes = MAP_BOXES) {
  let closest = maxDist;
  let hitBox = null;
  // Also check ground plane y=0
  if (dir.y < -1e-6 && origin.y > 0) {
    const tg = -origin.y / dir.y;
    if (tg >= 0 && tg < closest) {
      closest = tg;
      hitBox = { tag: 'ground' };
    }
  }
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const d = rayBoxIntersect(origin, dir, b, closest);
    if (d !== null && d < closest) {
      closest = d;
      hitBox = b;
    }
  }
  return hitBox ? { dist: closest, box: hitBox } : null;
}

export function resolvePlayerPhysics(state, dt, boxes = MAP_BOXES) {
  const r = ARENA.playerRadius;
  const h = state.crouch ? ARENA.crouchHeight : ARENA.standHeight;

  // Horizontal movement + collision
  state.x += state.vx * dt;
  state.z += state.vz * dt;

  // Clamp inside arena bounds
  const limX = ARENA.width / 2 - 0.8 - r;
  const limZ = ARENA.depth / 2 - 0.8 - r;
  if (state.x < -limX) state.x = -limX;
  if (state.x > limX) state.x = limX;
  if (state.z < -limZ) state.z = -limZ;
  if (state.z > limZ) state.z = limZ;

  // Resolve horizontal cylinder vs AABB
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    if (state.y + h <= b.y + 0.05 || state.y >= b.y + b.h - 0.08) continue;

    const minX = b.x - b.w / 2;
    const maxX = b.x + b.w / 2;
    const minZ = b.z - b.d / 2;
    const maxZ = b.z + b.d / 2;

    const cx = Math.max(minX, Math.min(state.x, maxX));
    const cz = Math.max(minZ, Math.min(state.z, maxZ));
    const dx = state.x - cx;
    const dz = state.z - cz;
    const distSq = dx * dx + dz * dz;

    if (distSq < r * r) {
      // Allow small step-up if box top is <= 0.45m above feet
      if (b.y + b.h - state.y <= 0.45 && state.vy <= 0) {
        state.y = b.y + b.h;
        continue;
      }
      if (distSq > 1e-8) {
        const dist = Math.sqrt(distSq);
        const overlap = r - dist;
        state.x += (dx / dist) * overlap;
        state.z += (dz / dist) * overlap;
      } else {
        // Inside box center fallback push out along shortest axis
        const penLeft = state.x - minX;
        const penRight = maxX - state.x;
        const penFront = state.z - minZ;
        const penBack = maxZ - state.z;
        const m = Math.min(penLeft, penRight, penFront, penBack);
        if (m === penLeft) state.x = minX - r;
        else if (m === penRight) state.x = maxX + r;
        else if (m === penFront) state.z = minZ - r;
        else state.z = maxZ + r;
      }
    }
  }

  // Vertical movement & floor/crate support
  state.vy -= ARENA.gravity * dt;
  const prevY = state.y;
  state.y += state.vy * dt;

  let supportY = 0;
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i];
    const minX = b.x - b.w / 2 - r * 0.75;
    const maxX = b.x + b.w / 2 + r * 0.75;
    const minZ = b.z - b.d / 2 - r * 0.75;
    const maxZ = b.z + b.d / 2 + r * 0.75;
    if (state.x >= minX && state.x <= maxX && state.z >= minZ && state.z <= maxZ) {
      const top = b.y + b.h;
      if (prevY >= top - 0.15 && state.y <= top && top > supportY) {
        supportY = top;
      }
    }
  }

  if (state.y <= supportY) {
    state.y = supportY;
    state.vy = 0;
    state.grounded = true;
  } else {
    state.grounded = false;
  }
}
