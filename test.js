import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { createGameServer } from './server.js';
import { rayBoxIntersect, resolvePlayerPhysics, WEAPONS } from './public/shared.js';

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

// 3. Server HTTP + WebSocket multiplayer + TEAM & FFA mode verification
const { server, players, match, addBot, removeBot } = createGameServer();

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

// Join as BLUE and RED in TEAM mode with AWM sniper
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

// c1 shoots c2 in the head with AWM (105 * 2.5 = 263 dmg -> instant kill)
c1.ws.send(
  JSON.stringify({
    type: 'shoot',
    origin: { x: -37, y: 1.5, z: -5 },
    dir: { x: 0, y: 0, z: 1 }
  })
);

await new Promise((r) => setTimeout(r, 60));
assert.equal(p1.kills, 1, 'Shooter should be credited with 1 kill');
assert.equal(match.scores.BLUE, 1, 'Blue team score should increment');
assert.equal(p2.dead, true, 'Target should be eliminated');

// Switch to FFA mode and test bots
c1.ws.send(JSON.stringify({ type: 'set_mode', mode: 'FFA' }));
await new Promise((r) => setTimeout(r, 50));
assert.equal(match.mode, 'FFA');

const bot = addBot();
assert.ok(bot && bot.isBot);
assert.equal(removeBot(), true);

c1.ws.close();
c2.ws.close();
server.close();
console.log('ALL SELF-CHECKS PASSED');
process.exit(0);
