import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from './server.js';
import { rayBoxIntersect, resolvePlayerPhysics, stepThrowablePhysics, THROWABLES, WEAPONS } from './public/shared.js';

// 1. Ray-Box intersection check
const box = { x: 0, y: 0, z: -10, w: 2, h: 2, d: 2 };
const hitDist = rayBoxIntersect({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box, 100);
assert.equal(hitDist, 9, 'Ray should hit front face of box at z=-9');
const missDist = rayBoxIntersect({ x: 5, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, box, 100);
assert.equal(missDist, null, 'Ray offset on X should miss box');

// 2. Player physics collision & ground check
const dummy = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, crouch: false, grounded: false };
resolvePlayerPhysics(dummy, 0.05, []);
assert.equal(dummy.y, 0);
assert.equal(dummy.grounded, true);

// 3. Server HTTP + WebSocket multiplayer + TEAM, FFA & ROOMS verification
const { server, rooms, players, match, addBot, removeBot } = createGameServer();

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

// Verify index.html and offline Three.js vendor bundle serve cleanly
const resHtml = await fetch(`${baseUrl}/`);
assert.equal(resHtml.status, 200);
const resThree = await fetch(`${baseUrl}/vendor/three.module.js`);
assert.equal(resThree.status, 200);

// Connect 2 players over WebSocket
function connectClient() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    const msgs = [];
    ws.on('message', (data) => {
      const parsed = JSON.parse(String(data));
      msgs.push(parsed);
      if (parsed.type === 'init') resolve({ ws, init: parsed, msgs });
    });
    ws.on('error', reject);
  });
}

const c1 = await connectClient();
const c2 = await connectClient();
assert.equal(players.size, 2);

// Join as BLUE and RED in TEAM mode with AWM sniper (55 body / 110 head)
c1.ws.send(JSON.stringify({ type: 'join', name: 'Rishi', team: 'BLUE', weapon: 'AWM', mode: 'TEAM' }));
c2.ws.send(JSON.stringify({ type: 'join', name: 'Colleague', team: 'RED', weapon: 'M416' }));

await new Promise((r) => setTimeout(r, 60));

const p1 = players.get(c1.init.id);
const p2 = players.get(c2.init.id);
assert.equal(p1.team, 'BLUE');
assert.equal(p2.team, 'RED');

// Position p1 and p2 in clear line of sight on West flank (x = -37) and clear spawn invulnerability
p1.x = -37; p1.y = 0; p1.z = -5; p1.invulnUntil = 0;
p2.x = -37; p2.y = 0; p2.z = 5;  p2.invulnUntil = 0;

// 1) AWM body shot (y = 0.8) should deal 55 dmg -> target survives at 45 HP
c1.ws.send(
  JSON.stringify({
    type: 'shoot',
    origin: { x: -37, y: 0.8, z: -5 },
    dir: { x: 0, y: 0, z: 1 }
  })
);
await new Promise((r) => setTimeout(r, 60));
assert.equal(p2.hp, 45, '1st AWM body shot should leave target at 45 HP');
assert.equal(p2.dead, false, 'Target should survive 1st AWM body shot');

// Reset cooldown and fire 2nd AWM body shot -> eliminates target
p1.lastShotAt = 0;
c1.ws.send(
  JSON.stringify({
    type: 'shoot',
    origin: { x: -37, y: 0.8, z: -5 },
    dir: { x: 0, y: 0, z: 1 }
  })
);
await new Promise((r) => setTimeout(r, 60));
assert.equal(p2.dead, true, '2nd AWM body shot should eliminate target');
assert.equal(p1.kills, 1, 'Shooter should have 1 kill after 2 body shots');

// 2) Respawn target at full 100 HP and verify 1 AWM headshot (y = 1.5 -> 110 dmg) is an instant 1-shot kill
p2.dead = false; p2.hp = 100; p2.invulnUntil = 0;
p1.lastShotAt = 0;
c1.ws.send(
  JSON.stringify({
    type: 'shoot',
    origin: { x: -37, y: 1.5, z: -5 },
    dir: { x: 0, y: 0, z: 1 }
  })
);

await new Promise((r) => setTimeout(r, 60));
assert.equal(p1.kills, 2, 'Shooter should be credited with 2nd kill after headshot');
assert.equal(match.scores.BLUE, 2, 'Blue team score should be 2');
assert.equal(p2.dead, true, 'Target should be eliminated in 1 headshot');

// Test restart_match resets kills and scores
c1.ws.send(JSON.stringify({ type: 'restart_match' }));
await new Promise((r) => setTimeout(r, 50));
assert.equal(p1.kills, 0, 'restart_match should reset player kills');
assert.equal(match.scores.BLUE, 0, 'restart_match should reset team score');

// Test Grenade (G) and Flashbang (F) throw + physics + thin-wall bounce
assert.equal(p1.grenades, 2, 'Player should start with 2 grenades');
assert.equal(p1.flashes, 2, 'Player should start with 2 flashbangs');
const testProj = { x: 0, y: 1.0, z: -2.0, vx: 0, vy: 0, vz: 20 };
const thinBarrier = [{ x: 0, y: 0, z: 0, w: 6, h: 2.0, d: 1.2 }];
stepThrowablePhysics(testProj, 0.08, thinBarrier);
assert.ok(testProj.z < -0.6, 'Grenade should bounce off front face of thin barrier instead of tunneling through');
assert.ok(testProj.vz < 0, 'Grenade velocity Z should reverse on bounce');

c1.ws.send(JSON.stringify({ type: 'throw', kind: 'GRENADE', origin: { x: -37, y: 1.5, z: -5 }, dir: { x: 0, y: 0, z: 1 } }));
await new Promise((r) => setTimeout(r, 50));
assert.equal(p1.grenades, 1, 'Throwing GRENADE should decrement grenade count to 1');
assert.ok(c1.msgs.some((m) => m.type === 'throw_spawn' && m.kind === 'GRENADE'), 'Clients should receive throw_spawn for GRENADE');

p1.lastThrowAt = 0;
c1.ws.send(JSON.stringify({ type: 'throw', kind: 'FLASH', origin: { x: -37, y: 1.5, z: -5 }, dir: { x: 0, y: 0, z: 1 } }));
await new Promise((r) => setTimeout(r, 50));
assert.equal(p1.flashes, 1, 'Throwing FLASH should decrement flashbang count to 1');
assert.ok(c1.msgs.some((m) => m.type === 'throw_spawn' && m.kind === 'FLASH'), 'Clients should receive throw_spawn for FLASH');

// Switch to FFA mode and test bots
c1.ws.send(JSON.stringify({ type: 'set_mode', mode: 'FFA' }));
await new Promise((r) => setTimeout(r, 50));
assert.equal(match.mode, 'FFA');

const bot = addBot();
assert.ok(bot && bot.isBot);
assert.equal(removeBot(), true);

// Test creating and switching to a custom Room Code
c2.ws.send(JSON.stringify({ type: 'join_room', room: 'OFFICE1', name: 'Colleague' }));
await new Promise((r) => setTimeout(r, 50));
assert.equal(rooms.has('OFFICE1'), true, 'Custom room OFFICE1 should be created');
assert.equal(rooms.get('OFFICE1').players.has(c2.init.id), true, 'Player 2 should be in OFFICE1');

c1.ws.close();
c2.ws.close();
server.close();
console.log('ALL SELF-CHECKS PASSED');
process.exit(0);
