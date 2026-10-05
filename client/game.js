(() => {
'use strict';
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');
const SKINS = [['#ff5252', '#ff8a80'], ['#40c4ff', '#80d8ff'], ['#69f0ae', '#b9f6ca'], ['#ffd740', '#ffe57f'], ['#e040fb', '#ea80fc'], ['#ff6e40', '#ffab91'], ['#18ffff', '#a7ffeb'], ['#f48fb1', '#fce4ec']];
const FOODC = ['#ff5252', '#ffd740', '#69f0ae', '#40c4ff', '#e040fb', '#ff6e40'];
const TICK_MS = 50;

let W = 0, H = 0, dpr = 1, zoom = 1;
let myId = null, world = { w: 3000, h: 3000 };
let prev = null, cur = null, playing = false, wasJoined = false, lastScore = 0;
let skin = 0, isTouch = false;
const cam = { x: 1500, y: 1500 };
const input = { a: 0, b: 0 }; let lastSent = { a: 99, b: 0 }, lastSentAt = 0;

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = W * dpr; cv.height = H * dpr;
  zoom = Math.min(W, H) / 600;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  $('rotate').classList.toggle('hidden', !(isTouch && H > W));
}
addEventListener('resize', resize);

// ---------- Sound (generated with WebAudio, no files needed) ----------
let ac = null, lastEat = 0;
function beep(f, d, type, vol, slide) {
  try {
    if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), ac.currentTime + d);
    g.gain.value = vol || 0.1; g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + d);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
  } catch (e) {}
}
const sfx = { click: () => beep(600, .08, 'square', .05), eat: () => { const n = performance.now(); if (n - lastEat > 70) { lastEat = n; beep(800 + Math.random() * 300, .06, 'sine', .06); } }, die: () => beep(400, .6, 'sawtooth', .12, -350), join: () => beep(440, .25, 'triangle', .1, 440) };

// ---------- Menu ----------
const skinsEl = $('skins');
SKINS.forEach((c, i) => {
  const d = document.createElement('div'); d.className = 'skin' + (i === 0 ? ' sel' : '');
  d.style.background = 'linear-gradient(135deg,' + c[0] + ',' + c[1] + ')';
  d.onclick = () => { skin = i; [...skinsEl.children].forEach(x => x.classList.remove('sel')); d.classList.add('sel'); sfx.click(); };
  skinsEl.appendChild(d);
});
try { $('nameInput').value = localStorage.getItem('snakeName') || ''; } catch (e) {}
let prog = 0; const li = setInterval(() => { prog += 25; $('barFill').style.width = prog + '%'; if (prog >= 100) { clearInterval(li); $('loading').classList.add('hidden'); $('menu').classList.remove('hidden'); } }, 150);

function join() {
  const name = $('nameInput').value.trim() || 'Player';
  try { localStorage.setItem('snakeName', name); } catch (e) {}
  socket.emit(EVT.JOIN, { name, skin });
  wasJoined = true; sfx.join();
  try { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch (e) {}
}
$('playBtn').onclick = join;
$('againBtn').onclick = () => { $('dead').classList.add('hidden'); join(); };
$('menuBtn').onclick = () => { $('dead').classList.add('hidden'); $('menu').classList.remove('hidden'); wasJoined = false; };

// ---------- Network ----------
socket.on('connect', () => {
  $('status').textContent = 'Connected!'; $('playBtn').disabled = false; $('playBtn').textContent = 'PLAY';
  if (wasJoined && $('menu').classList.contains('hidden') && $('dead').classList.contains('hidden')) join(); // auto re-join after a dropped connection
});
socket.on('disconnect', () => { $('status').textContent = 'Connection lost... reconnecting'; });
socket.on('connect_error', () => { $('status').textContent = 'Cannot reach server. Check SERVER_URL (free servers may need ~1 min to wake up).'; $('playBtn').disabled = true; $('playBtn').textContent = 'Connecting...'; });
socket.on(EVT.JOINED, d => {
  myId = d.id; world = { w: d.w, h: d.h }; playing = true; prev = cur = null;
  $('menu').classList.add('hidden'); $('dead').classList.add('hidden'); $('hud').classList.remove('hidden');
});
socket.on(EVT.STATE, d => {
  prev = cur;
  const p = {}; for (const s of d.p) p[s.i] = s;
  cur = { t: performance.now(), me: d.me, p, f: d.f };
  $('roomTxt').textContent = 'Room ' + d.room + ' (' + d.hum + ' players)';
  $('onlineTxt').textContent = 'Online: ' + d.on;
  if (d.me.sc !== lastScore) { lastScore = d.me.sc; const el = $('score'); el.textContent = d.me.sc; el.classList.add('pop'); setTimeout(() => el.classList.remove('pop'), 150); sfx.eat(); }
  if (d.lb) $('lb').innerHTML = '<b>Leaderboard</b>' + d.lb.map((e, i) => '<div class="' + (e[0] === myId ? 'me' : '') + '"><span>' + (i + 1) + '. ' + esc(e[1]) + '</span><span>' + e[2] + '</span></div>').join('');
});
socket.on(EVT.DIED, d => {
  playing = false; sfx.die();
  $('deadScore').textContent = 'Score: ' + d.score; $('deadBy').textContent = 'Killed by ' + d.by;
  setTimeout(() => { if (!playing) { $('hud').classList.add('hidden'); $('dead').classList.remove('hidden'); lastScore = -1; $('score').textContent = 0; } }, 900);
});
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

setInterval(() => {
  if (!playing) return;
  const now = performance.now();
  if (input.a !== lastSent.a || input.b !== lastSent.b || now - lastSentAt > 250) {
    socket.emit(EVT.INPUT, { a: +input.a.toFixed(2), b: input.b }); lastSent = { a: input.a, b: input.b }; lastSentAt = now;
  }
}, 50);

// ---------- Controls ----------
const joyBase = $('joyBase'), joyKnob = $('joyKnob'), boostBtn = $('boostBtn');
let joyId = null, joyC = { x: 0, y: 0 };
const gameEl = $('game');
gameEl.addEventListener('touchstart', e => {
  isTouch = true; e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.target === boostBtn) { input.b = 1; boostBtn.classList.add('on'); continue; }
    if (joyId === null && t.clientX < W * 0.65) { joyId = t.identifier; joyC = { x: t.clientX, y: t.clientY }; joyBase.style.left = t.clientX + 'px'; joyBase.style.top = t.clientY + 'px'; joyBase.style.display = 'block'; joyKnob.style.left = '35px'; joyKnob.style.top = '35px'; }
  }
}, { passive: false });
gameEl.addEventListener('touchmove', e => {
  e.preventDefault();
  for (const t of e.changedTouches) if (t.identifier === joyId) {
    const dx = t.clientX - joyC.x, dy = t.clientY - joyC.y, d = Math.hypot(dx, dy);
    if (d > 8) input.a = Math.atan2(dy, dx);
    const k = Math.min(d, 45) / (d || 1);
    joyKnob.style.left = 35 + dx * k + 'px'; joyKnob.style.top = 35 + dy * k + 'px';
  }
}, { passive: false });
function tEnd(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === joyId) { joyId = null; joyBase.style.display = 'none'; }
  }
  // boost released if no remaining touch is on the button
  let onBtn = false; for (const t of e.touches) if (t.target === boostBtn) onBtn = true;
  if (!onBtn) { input.b = 0; boostBtn.classList.remove('on'); }
}
gameEl.addEventListener('touchend', tEnd, { passive: false });
gameEl.addEventListener('touchcancel', tEnd, { passive: false });
document.addEventListener('touchmove', e => { if (playing) e.preventDefault(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());

// PC testing: mouse aims, click/Space boosts, WASD/arrows steer
cv.addEventListener('mousemove', e => { if (!isTouch && playing) input.a = Math.atan2(e.clientY - H / 2, e.clientX - W / 2); });
cv.addEventListener('mousedown', () => { if (!isTouch) input.b = 1; });
addEventListener('mouseup', () => { if (!isTouch) input.b = 0; });
const keys = {};
function keyVec() {
  const x = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0), y = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  if (x || y) input.a = Math.atan2(y, x);
}
addEventListener('keydown', e => { if (e.target.tagName === 'INPUT') return; const k = e.key.toLowerCase(); if (k === ' ') { input.b = 1; e.preventDefault(); } keys[k] = true; keyVec(); });
addEventListener('keyup', e => { const k = e.key.toLowerCase(); if (k === ' ') input.b = 0; keys[k] = false; keyVec(); });

// ---------- Rendering ----------
function sx(x) { return (x - cam.x) * zoom + W / 2; }
function sy(y) { return (y - cam.y) * zoom + H / 2; }

function drawBackground() {
  ctx.fillStyle = '#10183a'; ctx.fillRect(0, 0, W, H);
  const g = 80, x0 = Math.floor((cam.x - W / 2 / zoom) / g) * g, x1 = cam.x + W / 2 / zoom;
  const y0 = Math.floor((cam.y - H / 2 / zoom) / g) * g, y1 = cam.y + H / 2 / zoom;
  ctx.fillStyle = '#1d2a5c';
  for (let x = x0; x <= x1; x += g) for (let y = y0; y <= y1; y += g) {
    if (x < 0 || y < 0 || x > world.w || y > world.h) continue;
    ctx.beginPath(); ctx.arc(sx(x), sy(y), 3 * zoom, 0, 6.3); ctx.fill();
  }
  // out-of-bounds danger zone
  ctx.fillStyle = 'rgba(255,40,40,.25)';
  const L = sx(0), T = sy(0), R = sx(world.w), B = sy(world.h);
  if (L > 0) ctx.fillRect(0, 0, L, H);
  if (R < W) ctx.fillRect(R, 0, W - R, H);
  if (T > 0) ctx.fillRect(0, 0, W, T);
  if (B < H) ctx.fillRect(0, B, W, H - B);
  ctx.strokeStyle = '#ff5252'; ctx.lineWidth = 4; ctx.strokeRect(L, T, R - L, B - T);
}

function drawFood(f, t) {
  for (let i = 0; i < f.length; i += 4) {
    const x = sx(f[i]), y = sy(f[i + 1]);
    if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
    const r = (3.5 + f[i + 3] * 1.4) * zoom * (1 + 0.15 * Math.sin(t / 220 + f[i]));
    const c = FOODC[f[i + 2] % 6];
    ctx.globalAlpha = .3; ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#fff8'; ctx.beginPath(); ctx.arc(x - r * .3, y - r * .3, r * .35, 0, 6.3); ctx.fill();
  }
}

function drawSnake(s, ps, al) {
  const c = SKINS[s.k % 8], n = s.p.length / 2, r = (8 + Math.min(8, Math.sqrt(s.s) / 2.5)) * zoom;
  const xs = new Array(n), ys = new Array(n);
  for (let i = 0; i < n; i++) {
    let x = s.p[2 * i], y = s.p[2 * i + 1];
    if (ps && 2 * i + 1 < ps.p.length) { x = ps.p[2 * i] + (x - ps.p[2 * i]) * al; y = ps.p[2 * i + 1] + (y - ps.p[2 * i + 1]) * al; }
    xs[i] = sx(x); ys[i] = sy(y);
  }
  const vis = i => xs[i] > -r && ys[i] > -r && xs[i] < W + r && ys[i] < H + r;
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath();
  for (let i = n - 1; i >= 0; i--) if (vis(i)) { ctx.moveTo(xs[i] + 3 + r, ys[i] + 5); ctx.arc(xs[i] + 3, ys[i] + 5, r, 0, 6.3); }
  ctx.fill();
  for (let i = n - 1; i >= 0; i--) {
    if (!vis(i)) continue;
    ctx.fillStyle = (Math.floor(i / 3) % 2) ? c[0] : c[1];
    ctx.beginPath(); ctx.arc(xs[i], ys[i], r * (i === 0 ? 1.05 : 1), 0, 6.3); ctx.fill();
  }
  const hx = xs[0], hy = ys[0], ca = Math.cos(s.a), sa = Math.sin(s.a);
  if (s.b) { ctx.globalAlpha = .35; ctx.fillStyle = c[1]; ctx.beginPath(); ctx.arc(hx, hy, r * 1.6, 0, 6.3); ctx.fill(); ctx.globalAlpha = 1; }
  for (const sd of [-1, 1]) {
    const ex = hx + ca * r * .45 - sa * sd * r * .5, ey = hy + sa * r * .45 + ca * sd * r * .5;
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, r * .38, 0, 6.3); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + ca * r * .14, ey + sa * r * .14, r * .2, 0, 6.3); ctx.fill();
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold ' + Math.max(11, 12 * zoom) + 'px Arial'; ctx.textAlign = 'center';
  ctx.fillText(s.n, hx, hy - r - 8);
}

function frame(now) {
  requestAnimationFrame(frame);
  drawBackground();
  if (!cur) return;
  const al = Math.min(1, (now - cur.t) / TICK_MS);
  let tx = cur.me.x, ty = cur.me.y;
  const mine = cur.p[myId], pm = prev && prev.p[myId];
  if (mine) { tx = mine.p[0]; ty = mine.p[1]; if (pm) { tx = pm.p[0] + (tx - pm.p[0]) * al; ty = pm.p[1] + (ty - pm.p[1]) * al; } }
  cam.x += (tx - cam.x) * 0.2; cam.y += (ty - cam.y) * 0.2;
  drawFood(cur.f, now);
  const list = Object.values(cur.p).sort((a, b) => a.s - b.s);
  for (const s of list) drawSnake(s, prev && prev.p[s.i], al);
}
resize();
requestAnimationFrame(frame);
})();
