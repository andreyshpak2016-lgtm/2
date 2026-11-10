'use strict';

// Voxel Frontier — кооперативный сервер.
// Отдаёт статику игры и синхронизирует игроков, правки блоков и корабль.
// Запуск: node server/server.js  (по умолчанию http://localhost:8138)

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WebSocketServer } = require('ws');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8138);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_FILE = process.env.VF_DATA || path.join(__dirname, 'world.json');
const MAX_PLAYERS = 8;
const VALID_TYPES = new Set([
  'grass', 'dirt', 'stone', 'metal', 'gold', 'glass', 'crystal',
  'wood', 'leaves', 'pad', 'hull', 'engine', 'accent',
]);

const state = {
  edits: new Map(), // "x,y,z" -> тип | null (удалён)
  ship: { x: 0, y: 5, z: 12, yaw: 0, pitch: 0, pilot: null },
};
const players = new Map();
let nextPlayerId = 1;
let dirty = false;

// ------------------------------------------------------------
//  Сохранение мира
// ------------------------------------------------------------
function loadWorld() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return;
    for (const entry of data.edits || []) {
      if (!Array.isArray(entry) || entry.length !== 2) continue;
      const k = String(entry[0]);
      const type = entry[1];
      if (!/^-?\d+,-?\d+,-?\d+$/.test(k)) continue;
      if (type !== null && !VALID_TYPES.has(type)) continue;
      state.edits.set(k, type);
    }
    if (data.ship && typeof data.ship === 'object') {
      state.ship.x = Number(data.ship.x) || 0;
      state.ship.y = Number(data.ship.y) || 5;
      state.ship.z = Number(data.ship.z) || 12;
      state.ship.yaw = Number(data.ship.yaw) || 0;
      state.ship.pitch = Number(data.ship.pitch) || 0;
    }
    console.log(`[world] загружено правок: ${state.edits.size}`);
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[world] не удалось загрузить:', err.message);
  }
}

function saveWorld() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      v: 1,
      edits: Array.from(state.edits.entries()),
      ship: {
        x: state.ship.x, y: state.ship.y, z: state.ship.z,
        yaw: state.ship.yaw, pitch: state.ship.pitch,
      },
    }));
  } catch (err) {
    console.warn('[world] не удалось сохранить:', err.message);
  }
}

// ------------------------------------------------------------
//  Статика
// ------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
};

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('ok');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405).end('Method not allowed');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  if (pathname.startsWith('/server/')) {
    res.writeHead(404).end('Not found');
    return;
  }

  const file = path.resolve(ROOT, '.' + pathname);
  if (!file.startsWith(ROOT + path.sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  });
});

// ------------------------------------------------------------
//  WebSocket
// ------------------------------------------------------------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 64 * 1024 });

function send(ws, obj) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function broadcast(obj, except) {
  const raw = JSON.stringify(obj);
  for (const p of players.values()) {
    if (p.ws !== except && p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
  }
}

function snapshotPlayers() {
  return Array.from(players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    x: p.x,
    y: p.y,
    z: p.z,
    yaw: p.yaw,
    pitch: p.pitch,
    mode: p.mode,
  }));
}

function publicShip() {
  return {
    x: state.ship.x,
    y: state.ship.y,
    z: state.ship.z,
    yaw: state.ship.yaw,
    pitch: state.ship.pitch,
    pilot: state.ship.pilot,
  };
}

function numberIn(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function sanitizeName(value) {
  const name = String(value || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 24);
  return name || 'Пилот';
}

function validKey(key) {
  if (typeof key !== 'string' || key.length > 40) return null;
  if (!/^-?\d+,-?\d+,-?\d+$/.test(key)) return null;
  const [x, y, z] = key.split(',').map(Number);
  if (Math.abs(x) > 60 || Math.abs(z) > 60 || y < -8 || y > 44) return null;
  return [x, y, z];
}

function join(ws, msg) {
  if (ws.player) return;
  if (players.size >= MAX_PLAYERS) {
    ws.close(1013, 'server full');
    return;
  }
  const player = {
    id: 'p' + (nextPlayerId++),
    name: sanitizeName(msg.name),
    x: 0.5, y: 5, z: -3,
    yaw: Math.PI, pitch: -0.05,
    mode: 'walk',
    ws,
    lastSeen: Date.now(),
    editTimes: [],
  };
  ws.player = player;
  players.set(player.id, player);
  console.log(`[join] ${player.name} (${player.id}), игроков: ${players.size}`);
  send(ws, {
    t: 'welcome',
    id: player.id,
    players: snapshotPlayers(),
    edits: Array.from(state.edits.entries()),
    ship: publicShip(),
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.player = null;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (raw.length > 8192) return;
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (err) { return; }
    if (!msg || typeof msg.t !== 'string') return;

    if (!ws.player) {
      if (msg.t === 'hello') join(ws, msg);
      return;
    }

    const player = ws.player;
    player.lastSeen = Date.now();

    if (msg.t === 'state') {
      player.x = numberIn(msg.x, -200, 200, player.x);
      player.y = numberIn(msg.y, -20, 120, player.y);
      player.z = numberIn(msg.z, -200, 200, player.z);
      player.yaw = numberIn(msg.yaw, -Math.PI * 4, Math.PI * 4, player.yaw);
      player.pitch = numberIn(msg.pitch, -1.5, 1.5, player.pitch);
      player.mode = msg.mode === 'ship' ? 'ship' : 'walk';

      if (player.mode === 'ship' && msg.ship) {
        state.ship.x = numberIn(msg.ship.x, -200, 200, state.ship.x);
        state.ship.y = numberIn(msg.ship.y, -20, 120, state.ship.y);
        state.ship.z = numberIn(msg.ship.z, -200, 200, state.ship.z);
        state.ship.yaw = numberIn(msg.ship.yaw, -Math.PI * 4, Math.PI * 4, state.ship.yaw);
        state.ship.pitch = numberIn(msg.ship.pitch, -1.5, 1.5, state.ship.pitch);
        state.ship.pilot = player.id;
      } else if (player.mode === 'walk' && state.ship.pilot === player.id) {
        state.ship.pilot = null;
      }
      return;
    }

    if (msg.t === 'edit') {
      const coords = validKey(msg.k);
      if (!coords) return;
      const type = msg.type === null ? null : String(msg.type);
      if (type !== null && !VALID_TYPES.has(type)) return;

      const now = Date.now();
      player.editTimes = player.editTimes.filter((t) => now - t < 1000);
      if (player.editTimes.length >= 30) return;
      player.editTimes.push(now);

      state.edits.set(msg.k, type);
      dirty = true;
      broadcast({ t: 'edit', k: msg.k, type }, ws);
    }
  });

  ws.on('close', () => {
    const player = ws.player;
    if (!player) return;
    players.delete(player.id);
    if (state.ship.pilot === player.id) state.ship.pilot = null;
    console.log(`[leave] ${player.name} (${player.id}), игроков: ${players.size}`);
  });

  ws.on('error', () => {});
});

// Снапшоты 10 раз в секунду
setInterval(() => {
  if (!players.size) return;
  const raw = JSON.stringify({ t: 'states', players: snapshotPlayers(), ship: publicShip() });
  for (const p of players.values()) {
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(raw);
  }
}, 100);

// Heartbeat
setInterval(() => {
  for (const p of players.values()) {
    if (!p.ws.isAlive) {
      p.ws.terminate();
      continue;
    }
    p.ws.isAlive = false;
    try { p.ws.ping(); } catch (err) { /* ignore */ }
  }
}, 30000);

setInterval(saveWorld, 5000);
process.on('SIGINT', () => { saveWorld(); process.exit(0); });
process.on('SIGTERM', () => { saveWorld(); process.exit(0); });

loadWorld();
server.listen(PORT, HOST, () => {
  console.log('Voxel Frontier co-op server');
  console.log(`  http://localhost:${PORT}/`);
  for (const list of Object.values(os.networkInterfaces())) {
    for (const iface of list || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        console.log(`  http://${iface.address}:${PORT}/  (для друзей в локальной сети)`);
      }
    }
  }
});
