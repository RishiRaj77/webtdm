import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
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
} from './public/shared.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const THREE_BUILD_DIR = path.join(__dirname, 'node_modules', 'three', 'build');
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function getLanAddresses(port) {
  const nets = os.networkInterfaces();
  const urls = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.push(`http://${net.address}:${port}`);
      }
    }
  }
  return urls.length ? urls : [`http://localhost:${port}`];
}

export function sanitizeRoomCode(raw) {
  const cleaned = String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9\-]/g, '')
    .slice(0, 12);
  return cleaned || 'MAIN';
}

export function createGameServer() {
  const rooms = new Map();
  let nextId = 1;

  function getRoomSummaries() {
    const list = [];
    for (const r of rooms.values()) {
      const humans = [...r.players.values()].filter((p) => !p.isBot).length;
      const total = r.players.size;
      if (total > 0 || r.code === 'MAIN') {
        list.push({
          code: r.code,
          mode: r.match.mode,
          map: r.match.map,
          players: total,
          humans
        });
      }
    }
    return list;
  }

  function createRoom(rawCode) {
    const code = sanitizeRoomCode(rawCode);
    if (rooms.has(code)) return rooms.get(code);

    const players = new Map();
    const match = {
      mode: 'TEAM', // 'TEAM' | 'FFA'
      map: 'WAREHOUSE', // 'WAREHOUSE' | 'RUINS' | 'SHIPYARD'
      scores: { BLUE: 0, RED: 0 },
      targetScore: { TEAM: 40, FFA: 20 },
      matchDurationSec: 600,
      startedAt: Date.now(),
      ended: false,
      winnerText: '',
      resetAt: 0
    };

    function pickTeam(preferred) {
      if (preferred === 'BLUE' || preferred === 'RED') return preferred;
      let blue = 0;
      let red = 0;
      for (const p of players.values()) {
        if (p.team === 'BLUE') blue++;
        else if (p.team === 'RED') red++;
      }
      return blue <= red ? 'BLUE' : 'RED';
    }

    function pickSpawn(player) {
      const spawns = getMap(match.map).spawns;
      const pool =
        match.mode === 'FFA'
          ? spawns.FFA
          : player.team === 'BLUE'
            ? spawns.BLUE
            : spawns.RED;

      let best = pool[Math.floor(Math.random() * pool.length)];
      let bestScore = -1;

      for (const sp of pool) {
        let minDistSq = Infinity;
        for (const other of players.values()) {
          if (other.id === player.id || other.dead) continue;
          if (match.mode === 'TEAM' && other.team === player.team) continue;
          const dx = other.x - sp.x;
          const dz = other.z - sp.z;
          const d2 = dx * dx + dz * dz;
          if (d2 < minDistSq) minDistSq = d2;
        }
        const jitter = Math.random() * 6;
        const score = (minDistSq === Infinity ? 1000 : minDistSq) + jitter;
        if (score > bestScore) {
          bestScore = score;
          best = sp;
        }
      }

      return {
        x: best.x + (Math.random() - 0.5) * 1.8,
        y: best.y,
        z: best.z + (Math.random() - 0.5) * 1.8,
        yaw: best.yaw
      };
    }

    function respawnPlayer(p) {
      const sp = pickSpawn(p);
      p.x = sp.x;
      p.y = sp.y;
      p.z = sp.z;
      p.vx = 0;
      p.vy = 0;
      p.vz = 0;
      p.yaw = sp.yaw;
      p.pitch = 0;
      p.crouch = false;
      p.hp = 100;
      p.dead = false;
      p.respawnAt = 0;
      p.invulnUntil = Date.now() + 2800;
      p.lastDamagedAt = Date.now();
      const wep = WEAPONS[p.weapon] || WEAPONS.M416;
      p.ammo = wep.magSize;
      p.grenades = THROWABLES.GRENADE.maxCount;
      p.flashes = THROWABLES.FLASH.maxCount;
      p.reloadUntil = 0;
    }

    function broadcast(msg) {
      const raw = JSON.stringify(msg);
      for (const p of players.values()) {
        if (p.ws && p.ws.readyState === 1) {
          p.ws.send(raw);
        }
      }
    }

    function resetMatch(newMode = match.mode, newMap = match.map) {
      match.mode = newMode === 'FFA' ? 'FFA' : 'TEAM';
      if (newMap && MAPS[newMap]) match.map = newMap;
      match.scores = { BLUE: 0, RED: 0 };
      match.startedAt = Date.now();
      match.ended = false;
      match.winnerText = '';
      match.resetAt = 0;

      let toggle = 0;
      for (const p of players.values()) {
        p.kills = 0;
        p.deaths = 0;
        p.streak = 0;
        if (match.mode === 'TEAM' && p.team !== 'BLUE' && p.team !== 'RED') {
          p.team = toggle++ % 2 === 0 ? 'BLUE' : 'RED';
        }
        respawnPlayer(p);
      }

      broadcast({
        type: 'match_reset',
        room: code,
        mode: match.mode,
        map: match.map,
        scores: match.scores,
        targetScore: match.targetScore[match.mode]
      });
    }

    function getStandings() {
      return [...players.values()]
        .map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team,
          weapon: p.weapon,
          kills: p.kills,
          deaths: p.deaths,
          streak: p.streak
        }))
        .sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    }

    function checkMatchWin() {
      if (match.ended) return;
      const target = match.targetScore[match.mode];
      if (match.mode === 'TEAM') {
        if (match.scores.BLUE >= target || match.scores.RED >= target) {
          match.ended = true;
          match.winnerText =
            match.scores.BLUE >= target ? 'BLUE TEAM VICTORY!' : 'RED TEAM VICTORY!';
          match.resetAt = Date.now() + 18000;
          broadcast({
            type: 'match_end',
            winnerText: match.winnerText,
            mode: match.mode,
            scores: match.scores,
            players: getStandings()
          });
        }
      } else {
        for (const p of players.values()) {
          if (p.kills >= target) {
            match.ended = true;
            match.winnerText = `${p.name} WINS FREE-FOR-ALL!`;
            match.resetAt = Date.now() + 18000;
            broadcast({
              type: 'match_end',
              winnerText: match.winnerText,
              mode: match.mode,
              scores: match.scores,
              players: getStandings()
            });
            break;
          }
        }
      }
    }

    function handleShot(shooter, origin, dir) {
      if (shooter.dead || match.ended) return;
      const now = Date.now();
      const wep = WEAPONS[shooter.weapon] || WEAPONS.M416;

      if (shooter.reloadUntil > now) return;
      if (shooter.ammo <= 0) {
        shooter.reloadUntil = now + wep.reloadMs;
        return;
      }
      if (now - shooter.lastShotAt < wep.fireRateMs * 0.78) return;

      shooter.lastShotAt = now;
      shooter.ammo--;
      shooter.invulnUntil = 0;

      if (shooter.ammo <= 0) {
        shooter.reloadUntil = now + wep.reloadMs;
      }

      const eyeY = shooter.y + (shooter.crouch ? ARENA.crouchEye : ARENA.standEye);
      const ox = Math.abs(origin.x - shooter.x) < 2.2 ? origin.x : shooter.x;
      const oy = Math.abs(origin.y - eyeY) < 2.2 ? origin.y : eyeY;
      const oz = Math.abs(origin.z - shooter.z) < 2.2 ? origin.z : shooter.z;
      const safeOrigin = { x: ox, y: oy, z: oz };

      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const baseDir = { x: dir.x / len, y: dir.y / len, z: dir.z / len };

      const pellets = wep.pellets || 1;
      const spread = shooter.ads ? wep.adsSpread : wep.spread;
      const traceEnds = [];
      const hitAgg = new Map();
      const mapBoxes = getMap(match.map).boxes;

      for (let i = 0; i < pellets; i++) {
        const sx = pellets > 1 ? (Math.random() - 0.5) * spread * 2 : 0;
        const sy = pellets > 1 ? (Math.random() - 0.5) * spread * 2 : 0;
        const sz = pellets > 1 ? (Math.random() - 0.5) * spread * 2 : 0;
        const rx = baseDir.x + sx;
        const ry = baseDir.y + sy;
        const rz = baseDir.z + sz;
        const rLen = Math.hypot(rx, ry, rz) || 1;
        const rayDir = { x: rx / rLen, y: ry / rLen, z: rz / rLen };

        const mapHit = raycastMap(safeOrigin, rayDir, wep.range, mapBoxes);
        let closestDist = mapHit ? mapHit.dist : wep.range;
        let hitTarget = null;
        let isHeadshot = false;

        for (const target of players.values()) {
          if (target.id === shooter.id || target.dead) continue;
          if (match.mode === 'TEAM' && target.team === shooter.team) continue;

          const bodyH = target.crouch ? 0.85 : 1.36;
          const headY = target.y + bodyH;
          const headH = 0.52;

          const headBox = { x: target.x, y: headY, z: target.z, w: 0.64, h: headH, d: 0.64 };
          const bodyBox = { x: target.x, y: target.y, z: target.z, w: 1.05, h: bodyH, d: 1.05 };

          const dHead = rayBoxIntersect(safeOrigin, rayDir, headBox, closestDist);
          if (dHead !== null && dHead < closestDist) {
            closestDist = dHead;
            hitTarget = target;
            isHeadshot = true;
          }

          const dBody = rayBoxIntersect(safeOrigin, rayDir, bodyBox, closestDist);
          if (dBody !== null && dBody < closestDist) {
            closestDist = dBody;
            hitTarget = target;
            isHeadshot = false;
          }
        }

        traceEnds.push({
          x: +(safeOrigin.x + rayDir.x * closestDist).toFixed(2),
          y: +(safeOrigin.y + rayDir.y * closestDist).toFixed(2),
          z: +(safeOrigin.z + rayDir.z * closestDist).toFixed(2),
          hitPlayer: Boolean(hitTarget)
        });

        if (hitTarget) {
          if (hitTarget.invulnUntil > now) {
            if (shooter.ws && shooter.ws.readyState === 1) {
              shooter.ws.send(JSON.stringify({ type: 'hitmarker', shield: true }));
            }
            continue;
          }
          const dmg = Math.round(wep.damage * (isHeadshot ? wep.headMult : 1));
          const prev = hitAgg.get(hitTarget) || { dmg: 0, headshot: false };
          prev.dmg += dmg;
          prev.headshot = prev.headshot || isHeadshot;
          hitAgg.set(hitTarget, prev);
        }
      }

      for (const [target, info] of hitAgg.entries()) {
        if (target.dead) continue;
        target.hp = Math.max(0, target.hp - info.dmg);
        target.lastDamagedAt = now;
        const killed = target.hp <= 0;

        if (shooter.ws && shooter.ws.readyState === 1) {
          shooter.ws.send(
            JSON.stringify({
              type: 'hitmarker',
              dmg: info.dmg,
              headshot: info.headshot,
              killed
            })
          );
        }

        if (target.ws && target.ws.readyState === 1) {
          target.ws.send(
            JSON.stringify({
              type: 'damaged',
              fromX: shooter.x,
              fromZ: shooter.z,
              dmg: info.dmg,
              hp: target.hp
            })
          );
        }

        if (killed) {
          target.dead = true;
          target.deaths++;
          target.streak = 0;
          target.respawnAt = now + 3000;

          shooter.kills++;
          shooter.streak++;
          if (match.mode === 'TEAM') {
            match.scores[shooter.team] = (match.scores[shooter.team] || 0) + 1;
          }

          broadcast({
            type: 'kill',
            killerId: shooter.id,
            killerName: shooter.name,
            killerTeam: shooter.team,
            victimId: target.id,
            victimName: target.name,
            victimTeam: target.team,
            weapon: wep.name,
            headshot: info.headshot,
            streak: shooter.streak,
            scores: match.scores
          });

          checkMatchWin();
        }
      }

      broadcast({
        type: 'shot',
        id: shooter.id,
        weapon: shooter.weapon,
        origin: {
          x: +safeOrigin.x.toFixed(2),
          y: +safeOrigin.y.toFixed(2),
          z: +safeOrigin.z.toFixed(2)
        },
        traces: traceEnds
      });
    }

    const throwables = [];

    function handleThrow(thrower, kind, origin, dir) {
      if (thrower.dead || match.ended) return;
      const cfg = THROWABLES[kind];
      if (!cfg) return;
      const now = Date.now();
      if (now - (thrower.lastThrowAt || 0) < 500) return;

      if (kind === 'GRENADE') {
        if ((thrower.grenades || 0) <= 0) return;
        thrower.grenades--;
      } else if (kind === 'FLASH') {
        if ((thrower.flashes || 0) <= 0) return;
        thrower.flashes--;
      }

      thrower.lastThrowAt = now;
      thrower.invulnUntil = 0;

      const eyeY = thrower.y + (thrower.crouch ? ARENA.crouchEye : ARENA.standEye);
      const ox = Math.abs(origin.x - thrower.x) < 2.2 ? origin.x : thrower.x;
      const oy = Math.abs(origin.y - eyeY) < 2.2 ? origin.y : eyeY;
      const oz = Math.abs(origin.z - thrower.z) < 2.2 ? origin.z : thrower.z;

      const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
      const nx = dir.x / len;
      const ny = dir.y / len;
      const nz = dir.z / len;

      const mapBoxes = getMap(match.map).boxes;
      const nearWall = raycastMap({ x: ox, y: oy, z: oz }, { x: nx, y: ny, z: nz }, 0.65, mapBoxes);
      const spawnDist = nearWall ? Math.max(0.05, nearWall.dist - 0.18) : 0.45;

      const proj = {
        id: `th_${nextId++}`,
        kind,
        ownerId: thrower.id,
        ownerName: thrower.name,
        ownerTeam: thrower.team,
        x: ox + nx * spawnDist,
        y: Math.max(0.22, oy - 0.08 + ny * spawnDist),
        z: oz + nz * spawnDist,
        vx: nx * cfg.speed,
        vy: ny * cfg.speed + cfg.upBoost,
        vz: nz * cfg.speed,
        detonateAt: now + cfg.fuseMs
      };
      throwables.push(proj);

      broadcast({
        type: 'throw_spawn',
        id: proj.id,
        kind: proj.kind,
        ownerId: proj.ownerId,
        x: +proj.x.toFixed(2),
        y: +proj.y.toFixed(2),
        z: +proj.z.toFixed(2),
        vx: +proj.vx.toFixed(2),
        vy: +proj.vy.toFixed(2),
        vz: +proj.vz.toFixed(2),
        fuseMs: cfg.fuseMs
      });
    }

    function detonateThrowable(proj, now) {
      const cfg = THROWABLES[proj.kind];
      broadcast({
        type: 'throw_explode',
        id: proj.id,
        kind: proj.kind,
        x: +proj.x.toFixed(2),
        y: +proj.y.toFixed(2),
        z: +proj.z.toFixed(2)
      });

      const blastOrigin = { x: proj.x, y: proj.y + 0.45, z: proj.z };
      const owner = players.get(proj.ownerId);
      const mapBoxes = getMap(match.map).boxes;

      if (proj.kind === 'GRENADE') {
        for (const target of players.values()) {
          if (target.dead) continue;
          if (
            match.mode === 'TEAM' &&
            target.team === proj.ownerTeam &&
            target.id !== proj.ownerId
          ) {
            continue;
          }
          if (target.invulnUntil > now) continue;

          const tx = target.x - blastOrigin.x;
          const ty = target.y + 0.9 - blastOrigin.y;
          const tz = target.z - blastOrigin.z;
          const dist = Math.hypot(tx, ty, tz);
          if (dist > cfg.radius) continue;

          const dirChest = { x: tx / (dist || 1), y: ty / (dist || 1), z: tz / (dist || 1) };
          const wallChest = raycastMap(blastOrigin, dirChest, dist, mapBoxes);
          const headY = target.y + 1.48 - blastOrigin.y;
          const distHead = Math.hypot(tx, headY, tz) || 1;
          const dirHead = { x: tx / distHead, y: headY / distHead, z: tz / distHead };
          const wallHead = raycastMap(blastOrigin, dirHead, distHead, mapBoxes);

          const clearLos =
            (!wallChest || wallChest.dist >= dist - 0.35) ||
            (!wallHead || wallHead.dist >= distHead - 0.35);
          const wallFactor = clearLos ? 1.0 : 0.35;

          const falloff = dist <= 3.5 ? 1.0 : Math.max(0.15, 1 - (dist - 3.5) / (cfg.radius - 3.5));
          const dmg = Math.round(cfg.maxDamage * falloff * wallFactor);
          if (dmg <= 0) continue;

          target.hp = Math.max(0, target.hp - dmg);
          target.lastDamagedAt = now;
          const killed = target.hp <= 0;

          if (owner && owner.ws && owner.ws.readyState === 1 && target.id !== owner.id) {
            owner.ws.send(JSON.stringify({ type: 'hitmarker', dmg, headshot: false, killed }));
          }
          if (target.ws && target.ws.readyState === 1) {
            target.ws.send(
              JSON.stringify({
                type: 'damaged',
                fromX: proj.x,
                fromZ: proj.z,
                dmg,
                hp: target.hp
              })
            );
          }

          if (killed) {
            target.dead = true;
            target.deaths++;
            target.streak = 0;
            target.respawnAt = now + 3000;

            if (owner && target.id !== owner.id) {
              owner.kills++;
              owner.streak++;
              if (match.mode === 'TEAM') {
                match.scores[proj.ownerTeam] = (match.scores[proj.ownerTeam] || 0) + 1;
              }
            }

            broadcast({
              type: 'kill',
              killerId: proj.ownerId,
              killerName: proj.ownerName,
              killerTeam: proj.ownerTeam,
              victimId: target.id,
              victimName: target.name,
              victimTeam: target.team,
              weapon: 'Frag Grenade',
              headshot: false,
              streak: owner ? owner.streak : 1,
              scores: match.scores
            });
            checkMatchWin();
          }
        }
      } else if (proj.kind === 'FLASH') {
        for (const target of players.values()) {
          if (target.dead) continue;
          const tx = target.x - blastOrigin.x;
          const ty = target.y + 1.4 - blastOrigin.y;
          const tz = target.z - blastOrigin.z;
          const dist = Math.hypot(tx, ty, tz);
          if (dist > cfg.radius) continue;

          const dir = { x: tx / (dist || 1), y: ty / (dist || 1), z: tz / (dist || 1) };
          const wall = raycastMap(blastOrigin, dir, dist, mapBoxes);
          if (wall && wall.dist < dist - 0.35) continue;

          const intensity = Math.max(0.28, 1 - dist / cfg.radius);
          const durationMs = Math.round(cfg.maxDurationMs * intensity);

          if (target.isBot) {
            target.blindedUntil = now + durationMs;
          } else if (target.ws && target.ws.readyState === 1) {
            target.ws.send(
              JSON.stringify({
                type: 'flashed',
                intensity: +intensity.toFixed(2),
                durationMs
              })
            );
          }
          if (owner && owner.ws && owner.ws.readyState === 1 && target.id !== owner.id) {
            owner.ws.send(JSON.stringify({ type: 'hitmarker', shield: true }));
          }
        }
      }
    }

    function addBot() {
      const botCount = [...players.values()].filter((p) => p.isBot).length;
      if (botCount >= 10) return null;
      const id = `bot_${nextId++}`;
      const botNames = [
        'Bot_Viper',
        'Bot_Ghost',
        'Bot_Falcon',
        'Bot_Reaper',
        'Bot_Titan',
        'Bot_Blaze',
        'Bot_Shadow',
        'Bot_Cobra'
      ];
      const team = pickTeam();
      const wepKeys = ['M416', 'AKM', 'AWM'];
      const weapon = wepKeys[botCount % wepKeys.length];
      const bot = {
        id,
        name: botNames[botCount % botNames.length] + (botCount >= 8 ? `_${botCount}` : ''),
        team,
        isBot: true,
        room: code,
        weapon,
        ammo: WEAPONS[weapon].magSize,
        reloadUntil: 0,
        lastShotAt: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        pitch: 0,
        crouch: false,
        ads: false,
        hp: 100,
        dead: false,
        kills: 0,
        deaths: 0,
        streak: 0,
        invulnUntil: 0,
        lastDamagedAt: Date.now(),
        aiGoalX: 0,
        aiGoalZ: 0,
        aiNextGoalAt: 0
      };
      respawnPlayer(bot);
      players.set(id, bot);
      return bot;
    }

    function removeBot() {
      for (const [id, p] of players.entries()) {
        if (p.isBot) {
          players.delete(id);
          return true;
        }
      }
      return false;
    }

    function updateBots(now, dt) {
      const mapBoxes = getMap(match.map).boxes;
      for (const bot of players.values()) {
        if (!bot.isBot || bot.dead || match.ended) continue;

        if (now > bot.aiNextGoalAt || Math.hypot(bot.aiGoalX - bot.x, bot.aiGoalZ - bot.z) < 2.5) {
          bot.aiGoalX = (Math.random() - 0.5) * 62;
          bot.aiGoalZ = (Math.random() - 0.5) * 76;
          bot.aiNextGoalAt = now + 2800 + Math.random() * 2500;
        }

        let bestEnemy = null;
        let bestDist = 75;
        const eyeOrigin = { x: bot.x, y: bot.y + ARENA.standEye, z: bot.z };

        for (const other of players.values()) {
          if (other.id === bot.id || other.dead) continue;
          if (match.mode === 'TEAM' && other.team === bot.team) continue;
          const dx = other.x - bot.x;
          const dy = other.y + 1.1 - eyeOrigin.y;
          const dz = other.z - bot.z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist < bestDist) {
            const dir = { x: dx / dist, y: dy / dist, z: dz / dist };
            const wall = raycastMap(eyeOrigin, dir, dist, mapBoxes);
            if (!wall || wall.dist >= dist - 0.3) {
              bestDist = dist;
              bestEnemy = other;
            }
          }
        }

        const moveDx = bot.aiGoalX - bot.x;
        const moveDz = bot.aiGoalZ - bot.z;
        const moveLen = Math.hypot(moveDx, moveDz) || 1;
        const spd = ARENA.moveSpeed * 0.78;
        bot.vx = (moveDx / moveLen) * spd;
        bot.vz = (moveDz / moveLen) * spd;

        const prevX = bot.x;
        const prevZ = bot.z;
        resolvePlayerPhysics(bot, dt, mapBoxes);
        if (Math.hypot(bot.x - prevX, bot.z - prevZ) < 0.02) {
          bot.aiNextGoalAt = 0;
        }

        if (bestEnemy && (!bot.blindedUntil || now >= bot.blindedUntil)) {
          const dx = bestEnemy.x - bot.x;
          const dy = bestEnemy.y + (bestEnemy.crouch ? 0.75 : 1.2) - eyeOrigin.y;
          const dz = bestEnemy.z - bot.z;
          bot.yaw = Math.atan2(-dx, -dz);
          bot.pitch = Math.atan2(dy, Math.hypot(dx, dz));

          const wep = WEAPONS[bot.weapon];
          if (now - bot.lastShotAt >= Math.max(wep.fireRateMs * 2.2, 340)) {
            const aimNoise = 0.055;
            const dir = {
              x: dx + (Math.random() - 0.5) * aimNoise * bestDist,
              y: dy + (Math.random() - 0.5) * aimNoise * bestDist,
              z: dz + (Math.random() - 0.5) * aimNoise * bestDist
            };
            handleShot(bot, eyeOrigin, dir);
          }
        } else {
          bot.yaw = Math.atan2(-bot.vx, -bot.vz);
          bot.pitch = 0;
        }
      }
    }

    function tick(now, dt, roomList) {
      if (match.ended && now >= match.resetAt) {
        resetMatch(match.mode);
        return;
      }

      const elapsedSec = Math.floor((now - match.startedAt) / 1000);
      const remainingSec = Math.max(0, match.matchDurationSec - elapsedSec);
      if (!match.ended && remainingSec <= 0) {
        match.ended = true;
        if (match.mode === 'TEAM') {
          match.winnerText =
            match.scores.BLUE > match.scores.RED
              ? 'BLUE TEAM WINS ON TIME!'
              : match.scores.RED > match.scores.BLUE
                ? 'RED TEAM WINS ON TIME!'
                : 'DRAW MATCH!';
        } else {
          const top = [...players.values()].sort((a, b) => b.kills - a.kills)[0];
          match.winnerText = top ? `${top.name} WINS ON TIME!` : 'MATCH OVER!';
        }
        match.resetAt = now + 18000;
        broadcast({
          type: 'match_end',
          winnerText: match.winnerText,
          mode: match.mode,
          scores: match.scores,
          players: getStandings()
        });
      }

      updateBots(now, dt);

      // Update active grenades & flashbangs
      const mapBoxes = getMap(match.map).boxes;
      for (let i = throwables.length - 1; i >= 0; i--) {
        const proj = throwables[i];
        stepThrowablePhysics(proj, dt, mapBoxes);
        if (now >= proj.detonateAt) {
          throwables.splice(i, 1);
          detonateThrowable(proj, now);
        }
      }

      for (const p of players.values()) {
        if (p.dead && now >= p.respawnAt) {
          respawnPlayer(p);
          if (p.ws && p.ws.readyState === 1) {
            p.ws.send(
              JSON.stringify({
                type: 'respawn',
                x: p.x,
                y: p.y,
                z: p.z,
                yaw: p.yaw,
                hp: p.hp,
                ammo: p.ammo,
                grenades: p.grenades,
                flashes: p.flashes
              })
            );
          }
        }

        if (!p.dead && p.reloadUntil > 0 && now >= p.reloadUntil) {
          p.reloadUntil = 0;
          p.ammo = (WEAPONS[p.weapon] || WEAPONS.M416).magSize;
        }

        if (!p.dead && p.hp < 100 && now - p.lastDamagedAt >= 5000) {
          p.hp = Math.min(100, p.hp + 0.5);
        }
      }

      const snapshot = [];
      for (const p of players.values()) {
        snapshot.push({
          id: p.id,
          name: p.name,
          team: p.team,
          isBot: Boolean(p.isBot),
          x: +p.x.toFixed(2),
          y: +p.y.toFixed(2),
          z: +p.z.toFixed(2),
          yaw: +p.yaw.toFixed(3),
          pitch: +p.pitch.toFixed(3),
          crouch: Boolean(p.crouch),
          weapon: p.weapon,
          ammo: p.ammo,
          grenades: p.grenades ?? 2,
          flashes: p.flashes ?? 2,
          reloading: p.reloadUntil > now,
          hp: Math.ceil(p.hp),
          dead: p.dead,
          invuln: p.invulnUntil > now,
          kills: p.kills,
          deaths: p.deaths,
          streak: p.streak
        });
      }

      broadcast({
        type: 'state',
        room: code,
        rooms: roomList,
        mode: match.mode,
        map: match.map,
        scores: match.scores,
        targetScore: match.targetScore[match.mode],
        remainingSec,
        ended: match.ended,
        winnerText: match.winnerText,
        players: snapshot
      });
    }

    const roomObj = {
      code,
      players,
      match,
      pickTeam,
      respawnPlayer,
      resetMatch,
      handleShot,
      handleThrow,
      addBot,
      removeBot,
      tick
    };
    rooms.set(code, roomObj);
    return roomObj;
  }

  const mainRoom = createRoom('MAIN');

  function movePlayerToRoom(player, rawCode, preferredTeam) {
    const targetCode = sanitizeRoomCode(rawCode);
    const oldRoom = rooms.get(player.room);
    if (oldRoom) {
      oldRoom.players.delete(player.id);
      // Clean up empty non-MAIN rooms if no human players remain
      const hasHumans = [...oldRoom.players.values()].some((p) => !p.isBot);
      if (!hasHumans && oldRoom.code !== 'MAIN') {
        rooms.delete(oldRoom.code);
      }
    }

    const newRoom = createRoom(targetCode);
    player.room = newRoom.code;
    player.team = newRoom.pickTeam(preferredTeam);
    player.kills = 0;
    player.deaths = 0;
    player.streak = 0;
    newRoom.respawnPlayer(player);
    newRoom.players.set(player.id, player);
    return newRoom;
  }

  const tickInterval = setInterval(() => {
    const now = Date.now();
    const dt = 0.04;
    const roomList = getRoomSummaries();
    for (const room of rooms.values()) {
      room.tick(now, dt, roomList);
    }
  }, 40);

  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath.startsWith('/vendor/')) {
      const fileName = path.basename(urlPath);
      const targetPath = path.join(THREE_BUILD_DIR, fileName);
      if (!targetPath.startsWith(THREE_BUILD_DIR) || !fs.existsSync(targetPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      fs.createReadStream(targetPath).pipe(res);
      return;
    }

    const relPath = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const safePath = path.normalize(path.join(PUBLIC_DIR, relPath));
    if (
      !safePath.startsWith(PUBLIC_DIR) ||
      !fs.existsSync(safePath) ||
      fs.statSync(safePath).isDirectory()
    ) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store, no-cache, must-revalidate'
    });
    fs.createReadStream(safePath).pipe(res);
  });

  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/', 'http://localhost');
    const initialRoomCode = sanitizeRoomCode(reqUrl.searchParams.get('room') || 'MAIN');
    const room = createRoom(initialRoomCode);

    const id = `p_${nextId++}`;
    const team = room.pickTeam();
    const player = {
      id,
      ws,
      room: room.code,
      name: `Soldier_${nextId - 1}`,
      team,
      isBot: false,
      weapon: 'M416',
      ammo: WEAPONS.M416.magSize,
      reloadUntil: 0,
      lastShotAt: 0,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: 0,
      pitch: 0,
      crouch: false,
      ads: false,
      hp: 100,
      dead: false,
      kills: 0,
      deaths: 0,
      streak: 0,
      invulnUntil: 0,
      lastDamagedAt: Date.now()
    };

    room.respawnPlayer(player);
    room.players.set(id, player);

    ws.send(
      JSON.stringify({
        type: 'init',
        id,
        room: room.code,
        rooms: getRoomSummaries(),
        team: player.team,
        mode: room.match.mode,
        map: room.match.map,
        scores: room.match.scores,
        targetScore: room.match.targetScore[room.match.mode],
        x: player.x,
        y: player.y,
        z: player.z,
        yaw: player.yaw,
        lanUrls: getLanAddresses(PORT)
      })
    );

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (!msg || typeof msg !== 'object') return;

      let curRoom = rooms.get(player.room) || mainRoom;

      if (msg.type === 'join' || msg.type === 'join_room') {
        const cleanName = String(msg.name || '')
          .trim()
          .replace(/[^\w\s\-]/g, '')
          .slice(0, 16);
        if (cleanName) player.name = cleanName;
        if (msg.weapon && WEAPONS[msg.weapon]) {
          player.weapon = msg.weapon;
          player.ammo = WEAPONS[msg.weapon].magSize;
        }

        const desiredRoomCode = msg.room ? sanitizeRoomCode(msg.room) : curRoom.code;
        if (desiredRoomCode !== curRoom.code) {
          curRoom = movePlayerToRoom(
            player,
            desiredRoomCode,
            msg.team === 'BLUE' || msg.team === 'RED' ? msg.team : undefined
          );
        } else if (msg.team === 'BLUE' || msg.team === 'RED' || msg.team === 'AUTO') {
          const desired = msg.team === 'AUTO' ? curRoom.pickTeam() : msg.team;
          if (desired !== player.team) {
            player.team = desired;
            curRoom.respawnPlayer(player);
          }
        }

        const desiredMode =
          msg.mode === 'TEAM' || msg.mode === 'FFA' ? msg.mode : curRoom.match.mode;
        const desiredMap = msg.map && MAPS[msg.map] ? msg.map : curRoom.match.map;
        if (desiredMode !== curRoom.match.mode || desiredMap !== curRoom.match.map) {
          curRoom.resetMatch(desiredMode, desiredMap);
        }

        ws.send(
          JSON.stringify({
            type: 'respawn',
            room: curRoom.code,
            map: curRoom.match.map,
            x: player.x,
            y: player.y,
            z: player.z,
            yaw: player.yaw,
            hp: player.hp,
            ammo: player.ammo,
            grenades: player.grenades,
            flashes: player.flashes,
            team: player.team
          })
        );
      } else if (msg.type === 'move') {
        if (player.dead) return;
        const limX = ARENA.width / 2 - 0.8;
        const limZ = ARENA.depth / 2 - 0.8;
        if (Number.isFinite(msg.x)) player.x = Math.max(-limX, Math.min(limX, msg.x));
        if (Number.isFinite(msg.y)) player.y = Math.max(0, Math.min(12, msg.y));
        if (Number.isFinite(msg.z)) player.z = Math.max(-limZ, Math.min(limZ, msg.z));
        if (Number.isFinite(msg.yaw)) player.yaw = msg.yaw;
        if (Number.isFinite(msg.pitch)) player.pitch = Math.max(-1.55, Math.min(1.55, msg.pitch));
        player.crouch = Boolean(msg.crouch);
        player.ads = Boolean(msg.ads);
      } else if (msg.type === 'shoot') {
        if (
          msg.origin &&
          msg.dir &&
          Number.isFinite(msg.origin.x) &&
          Number.isFinite(msg.origin.y) &&
          Number.isFinite(msg.origin.z) &&
          Number.isFinite(msg.dir.x) &&
          Number.isFinite(msg.dir.y) &&
          Number.isFinite(msg.dir.z)
        ) {
          curRoom.handleShot(player, msg.origin, msg.dir);
        }
      } else if (msg.type === 'throw') {
        if (
          (msg.kind === 'GRENADE' || msg.kind === 'FLASH') &&
          msg.origin &&
          msg.dir &&
          Number.isFinite(msg.origin.x) &&
          Number.isFinite(msg.origin.y) &&
          Number.isFinite(msg.origin.z) &&
          Number.isFinite(msg.dir.x) &&
          Number.isFinite(msg.dir.y) &&
          Number.isFinite(msg.dir.z)
        ) {
          curRoom.handleThrow(player, msg.kind, msg.origin, msg.dir);
        }
      } else if (msg.type === 'reload') {
        const wep = WEAPONS[player.weapon] || WEAPONS.M416;
        if (!player.dead && player.reloadUntil <= Date.now() && player.ammo < wep.magSize) {
          player.reloadUntil = Date.now() + wep.reloadMs;
        }
      } else if (msg.type === 'weapon') {
        if (msg.weapon && WEAPONS[msg.weapon] && msg.weapon !== player.weapon) {
          player.weapon = msg.weapon;
          player.ammo = WEAPONS[msg.weapon].magSize;
          player.reloadUntil = 0;
        }
      } else if (msg.type === 'set_mode') {
        if (msg.mode === 'TEAM' || msg.mode === 'FFA') {
          curRoom.resetMatch(msg.mode, curRoom.match.map);
        }
      } else if (msg.type === 'set_map') {
        if (msg.map && MAPS[msg.map] && msg.map !== curRoom.match.map) {
          curRoom.resetMatch(curRoom.match.mode, msg.map);
        }
      } else if (msg.type === 'restart_match') {
        curRoom.resetMatch(curRoom.match.mode);
      } else if (msg.type === 'bot') {
        if (msg.action === 'add') curRoom.addBot();
        else if (msg.action === 'remove') curRoom.removeBot();
      }
    });

    ws.on('close', () => {
      const r = rooms.get(player.room);
      if (r) {
        r.players.delete(id);
        const hasHumans = [...r.players.values()].some((p) => !p.isBot);
        if (!hasHumans && r.code !== 'MAIN') {
          rooms.delete(r.code);
        }
      }
    });
  });

  server.on('close', () => clearInterval(tickInterval));

  return {
    server,
    wss,
    rooms,
    createRoom,
    players: mainRoom.players,
    match: mainRoom.match,
    resetMatch: mainRoom.resetMatch,
    addBot: mainRoom.addBot,
    removeBot: mainRoom.removeBot
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  const { server } = createGameServer();
  server.listen(PORT, '0.0.0.0', () => {
    const urls = getLanAddresses(PORT);
    console.log('\n====================================================');
    console.log('  PUBG WebTDM Local Network Server Running!');
    console.log('====================================================');
    console.log(`  Local:   http://localhost:${PORT}`);
    for (const u of urls) {
      console.log(`  LAN URL: ${u}  <-- Share with colleagues!`);
    }
    console.log('====================================================\n');
  });
}
