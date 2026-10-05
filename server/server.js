// Snake.io authoritative server (Node.js + Socket.IO)
const http = require('http'), fs = require('fs'), path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

// Tiny static file server so you can test from a browser at http://localhost:3000
const httpServer = http.createServer((req, res) => {
  let u = req.url.split('?')[0];
  if (u === '/health') { res.writeHead(200); return res.end('ok'); }
  if (u === '/') u = '/index.html';
  const file = path.join(CLIENT_DIR, path.normalize(u));
  if (!file.startsWith(CLIENT_DIR)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

const io = new Server(httpServer, { cors: { origin: '*' } });

// ---- Game constants ----
const W = 3000, H = 3000, TICK = 50, SEG = 10;
const SPEED = 170, BOOST_SPEED = 300, TURN = 5.5, START_LEN = 10;
const MAX_HUMANS = 10, BOT_TOTAL = 8, FOOD_TARGET = 300;
const BOT_NAMES = ['Slinky', 'Noodle', 'Viper', 'Mamba', 'Cobra', 'Python', 'Ziggy', 'Rattler', 'Coily', 'Nagini', 'Basil', 'Sidewinder'];

const rooms = new Map();
let nextRoomId = 1001, botCounter = 0;

const rnd = (a, b) => a + Math.random() * (b - a);
const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const hr = s => 8 + Math.min(8, Math.sqrt(s.score) / 2.5); // head radius from score

function mkFood(x, y, v) {
  return { x: x === undefined ? rnd(50, W - 50) : Math.max(5, Math.min(W - 5, x)), y: y === undefined ? rnd(50, H - 50) : Math.max(5, Math.min(H - 5, y)), c: Math.floor(Math.random() * 6), v: v || 1 + Math.floor(Math.random() * 3) };
}
function newRoom() {
  const r = { id: nextRoomId++, snakes: new Map(), food: [], humans: 0, tick: 0 };
  for (let i = 0; i < FOOD_TARGET; i++) r.food.push(mkFood());
  rooms.set(r.id, r);
  return r;
}
function findRoom() {
  for (const r of rooms.values()) if (r.humans < MAX_HUMANS) return r;
  return newRoom();
}
function mkSnake(r, id, name, skin, bot) {
  let x, y, tries = 0;
  do { x = rnd(500, W - 500); y = rnd(500, H - 500); tries++; }
  while (tries < 10 && [...r.snakes.values()].some(o => o.alive && o.segs.some(g => Math.hypot(g.x - x, g.y - y) < 250)));
  const a = rnd(0, Math.PI * 2);
  const s = { id, name, skin, bot, x, y, a, ta: a, boost: false, boosting: false, score: 0, alive: true, segs: [], boostAcc: 0, lastIn: 0, cx: x, cy: y, think: 0 };
  for (let i = 0; i < START_LEN; i++) s.segs.push({ x: x - Math.cos(a) * i * SEG, y: y - Math.sin(a) * i * SEG });
  r.snakes.set(id, s);
  return s;
}
function balanceBots(r) {
  const bots = [...r.snakes.values()].filter(s => s.bot);
  const want = Math.max(0, BOT_TOTAL - r.humans);
  for (let i = bots.length; i < want; i++) {
    const id = 'b' + (++botCounter);
    mkSnake(r, id, '[BOT] ' + BOT_NAMES[botCounter % BOT_NAMES.length], botCounter % 8, true);
  }
  for (let i = bots.length - 1; i >= want; i--) r.snakes.delete(bots[i].id);
}
function die(r, s, killer) {
  if (!s.alive) return;
  s.alive = false;
  if (r.food.length < FOOD_TARGET + 500)
    for (let i = 0; i < s.segs.length; i += 2) r.food.push(mkFood(s.segs[i].x + rnd(-8, 8), s.segs[i].y + rnd(-8, 8), 2));
  if (s.bot) {
    r.snakes.delete(s.id);
    setTimeout(() => { if (rooms.has(r.id)) balanceBots(r); }, 3000);
  } else {
    const sock = io.sockets.sockets.get(s.id);
    if (sock) sock.emit('died', { score: s.score, by: killer ? killer.name : 'the wall' });
  }
}
function botAI(r, s) {
  if (--s.think <= 0) {
    s.think = 5 + Math.floor(Math.random() * 5);
    let best = null, bd = 350 * 350;
    for (const f of r.food) { const dx = f.x - s.x, dy = f.y - s.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = f; } }
    if (best) s.ta = Math.atan2(best.y - s.y, best.x - s.x);
    else if (Math.random() < 0.3) s.ta = wrap(s.a + rnd(-1, 1));
  }
  const m = 250;
  if (s.x < m || s.x > W - m || s.y < m || s.y > H - m) s.ta = Math.atan2(H / 2 - s.y, W / 2 - s.x);
  const lx = s.x + Math.cos(s.a) * 70, ly = s.y + Math.sin(s.a) * 70;
  for (const o of r.snakes.values()) {
    if (o === s || !o.alive) continue;
    for (let i = 0; i < o.segs.length; i += 2) {
      const dx = o.segs[i].x - lx, dy = o.segs[i].y - ly;
      if (dx * dx + dy * dy < 900) { s.ta = wrap(s.a + 1.5); return; }
    }
  }
}
function stepRoom(r, dt) {
  const list = [...r.snakes.values()].filter(s => s.alive);
  for (const s of list) {
    if (s.bot) botAI(r, s);
    s.a = wrap(s.a + Math.max(-TURN * dt, Math.min(TURN * dt, wrap(s.ta - s.a))));
    s.boosting = s.boost && s.score >= 5;
    if (s.boosting) {
      s.boostAcc += dt;
      if (s.boostAcc > 0.25) { s.boostAcc = 0; s.score--; const t = s.segs[s.segs.length - 1]; r.food.push(mkFood(t.x, t.y, 1)); }
    }
    const sp = s.boosting ? BOOST_SPEED : SPEED;
    s.x += Math.cos(s.a) * sp * dt; s.y += Math.sin(s.a) * sp * dt;
    let px = s.x, py = s.y;
    s.segs[0].x = px; s.segs[0].y = py;
    for (let i = 1; i < s.segs.length; i++) {
      const g = s.segs[i], dx = px - g.x, dy = py - g.y, d = Math.hypot(dx, dy);
      if (d > SEG) { const k = (d - SEG) / d; g.x += dx * k; g.y += dy * k; }
      px = g.x; py = g.y;
    }
    const target = START_LEN + Math.floor(s.score / 2);
    while (s.segs.length < target) { const t = s.segs[s.segs.length - 1]; s.segs.push({ x: t.x, y: t.y }); }
    while (s.segs.length > target && s.segs.length > START_LEN) s.segs.pop();
    const er = hr(s) + 14;
    for (let i = r.food.length - 1; i >= 0; i--) {
      const f = r.food[i], dx = f.x - s.x, dy = f.y - s.y;
      if (dx * dx + dy * dy < er * er) {
        s.score += f.v;
        r.food[i] = r.food[r.food.length - 1]; r.food.pop();
        if (r.food.length < FOOD_TARGET) r.food.push(mkFood());
      }
    }
  }
  for (const s of list) {
    if (!s.alive) continue;
    if (s.x < 0 || s.y < 0 || s.x > W || s.y > H) { die(r, s, null); continue; }
    for (const o of list) {
      if (o === s || !o.alive) continue;
      if (Math.abs(o.x - s.x) > o.segs.length * SEG + 60 || Math.abs(o.y - s.y) > o.segs.length * SEG + 60) continue;
      const rr = hr(s) + hr(o) * 0.8;
      let hit = false;
      for (const g of o.segs) { const dx = g.x - s.x, dy = g.y - s.y; if (dx * dx + dy * dy < rr * rr) { hit = true; break; } }
      if (hit) { die(r, s, o); break; }
    }
  }
  if (r.food.length > FOOD_TARGET + 300) r.food.splice(0, 5);
}
function broadcast(r) {
  const sendLb = r.tick % 10 === 0;
  const lb = sendLb ? [...r.snakes.values()].filter(s => s.alive).sort((a, b) => b.score - a.score).slice(0, 5).map(s => [s.id, s.name, s.score]) : undefined;
  let online = 0; for (const rm of rooms.values()) online += rm.humans;
  for (const s of r.snakes.values()) {
    if (s.bot) continue;
    const sock = io.sockets.sockets.get(s.id); if (!sock) continue;
    if (s.alive) { s.cx = s.x; s.cy = s.y; }
    const p = [];
    for (const o of r.snakes.values()) {
      if (!o.alive || Math.abs(o.x - s.cx) > 1300 || Math.abs(o.y - s.cy) > 900) continue;
      const pts = new Array(o.segs.length * 2);
      for (let i = 0; i < o.segs.length; i++) { pts[2 * i] = Math.round(o.segs[i].x); pts[2 * i + 1] = Math.round(o.segs[i].y); }
      p.push({ i: o.id, n: o.name, k: o.skin, a: +o.a.toFixed(2), s: o.score, b: o.boosting ? 1 : 0, p: pts });
    }
    const f = [];
    for (const fd of r.food) if (Math.abs(fd.x - s.cx) < 1100 && Math.abs(fd.y - s.cy) < 700) f.push(Math.round(fd.x), Math.round(fd.y), fd.c, fd.v);
    sock.emit('state', { me: { x: Math.round(s.cx), y: Math.round(s.cy), sc: s.score, al: s.alive ? 1 : 0 }, p, f, lb, room: r.id, hum: r.humans, on: online });
  }
}
setInterval(() => {
  for (const r of rooms.values()) { r.tick++; stepRoom(r, TICK / 1000); broadcast(r); }
}, TICK);

function leaveRoom(socket) {
  const r = rooms.get(socket.data.room);
  socket.data.room = null;
  if (!r) return;
  const s = r.snakes.get(socket.id);
  if (s) { if (s.alive) { s.bot = true; die(r, s, null); } r.snakes.delete(socket.id); }
  r.humans = Math.max(0, r.humans - 1);
  if (r.humans === 0) rooms.delete(r.id); else balanceBots(r);
}

io.on('connection', socket => {
  socket.on('join', d => {
    leaveRoom(socket);
    const name = String((d && d.name) || 'Player').replace(/[^\w \-.]/g, '').trim().slice(0, 14) || 'Player';
    const skin = Math.abs(parseInt(d && d.skin, 10) || 0) % 8;
    const r = findRoom();
    r.humans++;
    socket.data.room = r.id;
    mkSnake(r, socket.id, name, skin, false);
    balanceBots(r);
    socket.emit('joined', { id: socket.id, room: r.id, w: W, h: H });
  });
  socket.on('input', d => {
    const r = rooms.get(socket.data.room); if (!r) return;
    const s = r.snakes.get(socket.id); if (!s || !s.alive) return;
    const now = Date.now(); if (now - s.lastIn < 20) return; s.lastIn = now;
    if (d && Number.isFinite(d.a) && Math.abs(d.a) < 10) s.ta = wrap(d.a);
    s.boost = !!(d && d.b);
  });
  socket.on('disconnect', () => leaveRoom(socket));
});

httpServer.listen(PORT, () => console.log('Snake.io server running on port ' + PORT));
