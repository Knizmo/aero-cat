/* AERO.CAT — a doodle-powered space flight. All sprites are hand-drawn ballpoint doodles. */
(function () {
'use strict';

// ---------------------------------------------------------------- helpers
const $ = id => document.getElementById(id);
const R = (a, b) => a + Math.random() * (b - a);
const RI = (a, b) => Math.floor(R(a, b + 1));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const INK = '#222880', RED = '#d8333a', PAPER = '#fbfaf3', GOLD = '#c98b00', PURPLE = '#6a37c4';
const FONT = '"Patrick Hand", "Comic Sans MS", cursive';
const W = 400;
let H = 720;

// sprite metadata (pixel coords inside each sprite image)
const SP = {
  rocket: { w: 163, h: 367, fx: 42.6, fy: 349.8 },
  flame: { w: 75, h: 85 },
  comet: { w: 175, h: 497, hx: 75, hy: 430 },
  galaxy: { w: 367, h: 384, cx: 192, cy: 196 },
  catplanet: { w: 630, h: 599, cx: 336, cy: 316 },
  tree: { w: 554, h: 669, bx: 292 },
  pot: { w: 391, h: 214 },
  flower: { w: 188, h: 375, ox: 89.1, oy: -373.5 },
  sprout: { w: 167, h: 177, ox: 99.9, oy: -175.5 },
};
const ROCKET_H = 106, RS = ROCKET_H / SP.rocket.h;
const COMET_LEN = 140, CS = COMET_LEN / SP.comet.h, COMET_R = 11;
const GAL_D = 130, GS = GAL_D / SP.galaxy.h;
const PLAN_W = 135, PS = PLAN_W / SP.catplanet.w;
const PAD_H = 8;
const STAR_KINDS = {
  tiny: { img: 'star_tiny', h: 26, val: 1, fuel: 3.6, r: 15 },
  small: { img: 'star_small', h: 27, val: 1, fuel: 3.6, r: 15 },
  line: { img: 'star_line', h: 46, val: 3, fuel: 9, r: 20 },
  big: { img: 'star_big', h: 42, val: 5, fuel: 15, r: 22 },
};
const STAGES = [
  { at: 0, name: 'Empty pot', perk: 'A sapling and an empty pot' },
  { at: 40, name: 'Sprout', perk: 'Fuel tank +25%' },
  { at: 120, name: 'Daisy bloom', perk: 'Start every flight with a cat shield' },
  { at: 250, name: 'Young tree', perk: 'Star magnet' },
  { at: 450, name: 'Tall tree', perk: 'Warp lasts 1.5 s longer' },
  { at: 750, name: 'Star-fruit tree', perk: 'Stars give 50% more fuel' },
  { at: 1200, name: 'Starlit garden', perk: 'Big stars are worth double' },
];
const stageOf = t => { let s = 0; for (let i = 0; i < STAGES.length; i++) if (t >= STAGES[i].at) s = i; return s; };

// ---------------------------------------------------------------- storage
const Store = {
  get(k, d) {
    let v = null;
    try { if (window.AeroNative && AeroNative.load) v = AeroNative.load(k); } catch (e) { v = null; }
    if (v === null || v === undefined || v === '') { try { v = localStorage.getItem('aerocat.' + k); } catch (e) { v = null; } }
    if (v === null || v === undefined || v === '') return d;
    try { return JSON.parse(v); } catch (e) { return d; }
  },
  set(k, val) {
    const s = JSON.stringify(val);
    try { if (window.AeroNative && AeroNative.save) AeroNative.save(k, s); } catch (e) { /* ignore */ }
    try { localStorage.setItem('aerocat.' + k, s); } catch (e) { /* ignore */ }
  },
};
const save = { best: 0, total: 0, runs: 0, sound: true, seenHow: false };
function loadSave() { const s = Store.get('save', null); if (s && typeof s === 'object') Object.assign(save, s); }
function writeSave() { Store.set('save', save); }

function buzz(p) {
  try { if (window.AeroNative && AeroNative.vibrate) { AeroNative.vibrate(Array.isArray(p) ? p[0] + (p[2] || 0) : p); return; } } catch (e) { /* ignore */ }
  try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------- sound (all synthesized)
const Snd = {
  ctx: null, out: null, sfx: null, mus: null, noiseBuf: null, timer: null, next: 0, step: 0, pattern: null, lastWarn: 0,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch (e) { this.ctx = null; return; }
    const c = this.ctx;
    this.out = c.createGain(); this.out.gain.value = save.sound ? 0.9 : 0; this.out.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 1.25; this.sfx.connect(this.out);
    this.mus = c.createGain(); this.mus.gain.value = 0; this.mus.connect(this.out);
    const len = c.sampleRate | 0, b = c.createBuffer(1, len, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = b;
  },
  resume() { if (this.ctx && this.ctx.state !== 'running') { try { this.ctx.resume(); } catch (e) { /* ignore */ } } },
  suspend() { if (this.ctx && this.ctx.state === 'running') { try { this.ctx.suspend(); } catch (e) { /* ignore */ } } },
  setOn(on) {
    save.sound = on; writeSave();
    if (this.out) this.out.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.05);
    if (on) { this.resume(); this.startMusic(); } else this.stopMusic();
  },
  ok() { return this.ctx && save.sound && this.ctx.state === 'running'; },
  tone(f, dur, o) {
    o = o || {}; if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const osc = c.createOscillator(); osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    const g = c.createGain(), v = o.vol || 0.2;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(o.dest || this.sfx); osc.start(t); osc.stop(t + dur + 0.05);
  },
  noise(dur, o) {
    o = o || {}; if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime + (o.delay || 0);
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = o.ft || 'bandpass'; f.frequency.setValueAtTime(o.f || 1200, t); f.Q.value = o.q || 1;
    if (o.fto) f.frequency.exponentialRampToValueAtTime(o.fto, t + dur);
    const g = c.createGain(), v = o.vol || 0.25;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (o.att || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfx); s.start(t); s.stop(t + dur + 0.05);
  },
  star(combo) {
    const sc = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
    const f = 660 * Math.pow(2, sc[Math.min(combo, sc.length - 1)] / 12);
    this.tone(f, 0.2, { type: 'triangle', vol: 0.16 }); this.tone(f * 2, 0.12, { vol: 0.05, delay: 0.03 });
  },
  bigStar() { [0, 4, 7, 12].forEach((s, i) => this.tone(784 * Math.pow(2, s / 12), 0.28, { type: 'triangle', vol: 0.13, delay: i * 0.06 })); },
  meow() {
    if (!this.ok()) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(520, t); o.frequency.linearRampToValueAtTime(840, t + 0.13); o.frequency.linearRampToValueAtTime(590, t + 0.45);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 7;
    f.frequency.setValueAtTime(650, t); f.frequency.linearRampToValueAtTime(2600, t + 0.13); f.frequency.linearRampToValueAtTime(850, t + 0.48);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.17, t + 0.05);
    g.gain.setValueAtTime(0.17, t + 0.32); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.52);
    o.connect(f); f.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + 0.56);
  },
  warp() { this.noise(1.3, { f: 300, fto: 3200, q: 1.4, vol: 0.5, att: 0.3 }); this.tone(220, 1.1, { type: 'sawtooth', to: 880, vol: 0.09, att: 0.25 }); [0, 4, 7, 12, 16].forEach((s, i) => this.tone(523 * Math.pow(2, s / 12), 0.3, { type: 'triangle', vol: 0.09, delay: 0.25 + i * 0.07 })); },
  pop() { this.noise(0.16, { f: 2600, q: 0.8, vol: 0.3 }); this.tone(950, 0.14, { to: 300, vol: 0.12 }); },
  smash() { this.noise(0.3, { f: 900, fto: 180, q: 0.7, vol: 0.35 }); },
  crash() { this.noise(1.0, { ft: 'lowpass', f: 1800, fto: 110, q: 0.5, vol: 0.55 }); this.tone(150, 0.7, { type: 'square', to: 40, vol: 0.1 }); },
  click() { this.noise(0.05, { f: 3200, q: 2, vol: 0.16 }); },
  warn() { if (!this.ok()) return; const now = this.ctx.currentTime; if (now - this.lastWarn < 0.45) return; this.lastWarn = now; this.tone(1046, 0.07, { type: 'square', vol: 0.05 }); this.tone(1318, 0.07, { type: 'square', vol: 0.05, delay: 0.1 }); },
  low() { this.tone(330, 0.16, { type: 'square', vol: 0.07 }); },
  ignite() { this.noise(1.8, { ft: 'lowpass', f: 300, fto: 1600, q: 0.8, vol: 0.32, att: 0.3 }); },
  sputter() { for (let i = 0; i < 4; i++) this.noise(0.1, { ft: 'lowpass', f: 600, q: 1, vol: 0.25, delay: i * 0.17 }); },
  near() { this.tone(1568, 0.1, { type: 'triangle', vol: 0.12 }); this.tone(2093, 0.12, { type: 'triangle', vol: 0.1, delay: 0.07 }); },
  startMusic() {
    if (!this.ctx || this.timer || !save.sound) return;
    if (!this.pattern) this.pattern = makePattern();
    this.mus.gain.cancelScheduledValues(this.ctx.currentTime);
    this.mus.gain.setTargetAtTime(0.55, this.ctx.currentTime, 0.6);
    this.next = this.ctx.currentTime + 0.12;
    this.timer = setInterval(() => this.schedule(), 70);
  },
  stopMusic() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    if (this.mus) this.mus.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
  },
  schedule() {
    const c = this.ctx; if (!c || c.state !== 'running') return;
    const spb = 60 / 92 / 2;
    if (this.next < c.currentTime) this.next = c.currentTime + 0.05;
    while (this.next < c.currentTime + 0.3) {
      const ev = this.pattern[this.step % this.pattern.length];
      if (ev.m) this.note(ev.m, this.next, 0.95, 0.09, 'triangle');
      if (ev.b) this.note(ev.b, this.next, 1.7, 0.11, 'sine');
      this.next += spb; this.step++;
    }
  },
  note(f, t, dur, vol, type) {
    const c = this.ctx, o = c.createOscillator(); o.type = type; o.frequency.value = f;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.mus); o.start(t); o.stop(t + dur + 0.05);
  },
};
function makePattern() {
  const midi = n => 440 * Math.pow(2, (n - 69) / 12);
  const chords = [[48, 52, 55], [43, 47, 50], [45, 48, 52], [41, 45, 48]]; // C G Am F
  const scale = [72, 74, 76, 79, 81, 84, 86, 88];
  const steps = []; let idx = 2;
  for (let bar = 0; bar < 8; bar++) {
    const ch = chords[bar % 4];
    for (let s = 0; s < 8; s++) {
      const ev = {};
      if (s === 0) ev.b = midi(ch[0]); else if (s === 4) ev.b = midi(ch[2]);
      if (Math.random() < (s % 2 === 0 ? 0.6 : 0.2)) { idx = clamp(idx + RI(-2, 2), 0, scale.length - 1); ev.m = midi(scale[idx]); }
      steps.push(ev);
    }
  }
  return steps;
}

// ---------------------------------------------------------------- canvas
const cv = $('c'), ctx = cv.getContext('2d');
const app = $('app');
let CW = 400, CH = 720, SCALE = 1, DPR = 1, safeTop = 0, safeBot = 0;
const IMG = {};

function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  CW = Math.min(vw, Math.round(vh * 0.62)); CH = vh;
  SCALE = CW / W; H = CH / SCALE;
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  cv.style.width = CW + 'px'; cv.style.height = CH + 'px';
  app.style.width = CW + 'px';
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe); safeTop = parseFloat(cs.paddingTop) || 0; safeBot = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
  if (G.state === 'title' || G.state === 'loading') G.camY = titleCam();
}
const groundScreenY = () => H - 96 - safeBot / SCALE;
const titleCam = () => -groundScreenY();
const anchorY = () => H * 0.74;

// ---------------------------------------------------------------- game state
const G = {
  state: 'loading', paused: false, t: 0, camY: 0, shake: 0, lt: 0, deathT: 0, deathReason: '',
  r: null, stars: [], comets: [], warns: [], gals: [], planets: [], parts: [], texts: [], streaks: [],
  genY: 0, cometT: 0, showerT: 0, shower: null, nextGalY: 0, nextPlanY: 0, combo: 0, comboT: 0,
  run: null, perks: null, hintDrag: 0, hintFuel: 0, lowT: 0, skyFade: 1, flashT: 0,
};

function newRocket() {
  return { x: 200, y: -PAD_H - ROCKET_H / 2, tx: 200, tilt: 0, speed: 0, vy: 0, fuel: 100, fuelMax: 100,
    shield: 0, inv: 0, warp: 0, warpMax: 3, sputter: 0, alive: true, spin: 0, spinV: 0, dvx: 0, dvy: 0,
    flame: 0, puffT: 0, shieldT: 0 };
}

function resetWorld() {
  G.r = newRocket();
  G.stars = []; G.comets = []; G.warns = []; G.gals = []; G.planets = []; G.parts = []; G.texts = []; G.streaks = [];
  G.genY = -560; G.cometT = 2.6; G.showerT = R(24, 32); G.shower = null;
  G.nextPlanY = -2300; G.nextGalY = -4600;
  G.combo = 0; G.comboT = 0; G.lt = 0; G.lowT = 0; G.flashT = 0;
  G.camY = titleCam();
  G.run = { stars: 0, dist: 0, near: 0 };
  const st = stageOf(save.total);
  G.perks = { fuelMax: st >= 1 ? 125 : 100, startShield: st >= 2, magnet: st >= 3 ? 85 : 0, warpBonus: st >= 4 ? 1.5 : 0,
    fuelMul: st >= 5 ? 1.5 : 1, bigMul: st >= 6 ? 2 : 1 };
  G.r.fuelMax = G.perks.fuelMax; G.r.fuel = G.r.fuelMax;
  if (G.perks.startShield) G.r.shield = 1;
}

// ---------------------------------------------------------------- spawning
const baseSpeed = d => 270 + Math.min(250, d * 0.12);
const burnRate = d => 8 + Math.min(5, d * 0.0025);
const cometInterval = d => Math.max(0.62, 2.1 - d * 0.00085);
const cometSpeed = d => Math.min(560, 250 + d * 0.09) * R(0.85, 1.15);

function addStar(x, y, kind) {
  G.stars.push({ x: clamp(x, 22, W - 22), y, kind: kind || (Math.random() < 0.5 ? 'tiny' : 'small'), ph: Math.random() * 6.28, got: false });
}

function genChunk() {
  const y0 = G.genY, dm = -y0 / 10, diff = clamp(dm / 1800, 0, 1);
  if (y0 < G.nextPlanY) {
    const x = R(110, 290);
    G.planets.push({ x, y: y0 - 120, bob: Math.random() * 6, got: false, k: 1 });
    addStar(x, y0 - 10, 'tiny'); addStar(x, y0 - 230, 'line');
    G.nextPlanY = y0 - R(3700, 5300); G.genY = y0 - 300; return;
  }
  if (y0 < G.nextGalY) {
    const gx = R(120, 280), gy = y0 - 230, side = gx < 200 ? 1 : -1;
    G.gals.push({ x: gx, y: gy, spin: 0, used: false, k: 1 });
    for (let i = 0; i < 7; i++) { // a curved trail of stars that leads into the swirl
      const t = i / 7, a = t * 2.3;
      addStar(gx + side * (130 - 125 * t) * Math.cos(a * 0.6), gy + 220 - 205 * t, 'tiny');
    }
    G.nextGalY = y0 - R(3900, 5700); G.genY = y0 - 420; return;
  }
  const r = Math.random();
  let h;
  if (r < 0.2) { // straight line
    const n = RI(6, 9), x = R(60, 340);
    for (let i = 0; i < n; i++) addStar(x, y0 - i * 44);
    h = (n - 1) * 44;
    if (Math.random() < 0.35) { addStar(x, y0 - n * 44 - 8, 'line'); h += 52; }
  } else if (r < 0.38) { // zigzag
    const n = RI(8, 12), x0 = R(110, 290), amp = R(45, 75), tri = [0, 1, 0, -1];
    for (let i = 0; i < n; i++) addStar(x0 + amp * tri[i % 4], y0 - i * 40);
    h = (n - 1) * 40;
  } else if (r < 0.56) { // sine sweep across the page
    const n = RI(11, 15), A = R(80, 135), ph = R(0, 6.28);
    for (let i = 0; i < n; i++) addStar(200 + A * Math.sin(ph + i * 0.42), y0 - i * 38);
    h = (n - 1) * 38;
  } else if (r < 0.68) { // ring with a big star inside
    const cx = R(100, 300), cy = y0 - 80;
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; addStar(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60); }
    addStar(cx, cy, 'line'); h = 150;
  } else if (r < 0.8) { // diagonal
    const n = 8, dir = Math.random() < 0.5 ? 1 : -1;
    for (let i = 0; i < n; i++) addStar(200 + dir * (-140 + i * 40), y0 - i * 42);
    h = (n - 1) * 42;
  } else if (r < 0.92) { // fork: pick a side
    const n = 6, x0 = R(130, 270), big = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) { addStar(x0 - 78, y0 - i * 44); addStar(x0 + 78, y0 - i * 44); }
    addStar(x0 + big * 78, y0 - n * 44 - 6, 'big'); h = n * 44 + 30;
  } else { // risky lone big star with a little diamond
    const x = Math.random() < 0.5 ? R(40, 90) : R(310, 360), cy = y0 - 60;
    addStar(x, cy, 'big');
    [[0, -46], [40, 0], [0, 46], [-40, 0]].forEach(p => addStar(x + p[0], cy + p[1]));
    h = 120;
  }
  G.genY = y0 - h - R(50, 120) * (1 + diff * 0.9);
}

function rocketScreenY() { return G.r.y - G.camY; }

function queueComet(opt) {
  const dm = G.run.dist;
  opt = opt || {};
  let ex, ey; const side = opt.side !== undefined ? opt.side : Math.random();
  if (side < 0.7) { ex = opt.ex !== undefined ? opt.ex : R(-30, W + 30); ey = -80; }
  else if (side < 0.85) { ex = -80; ey = R(10, H * 0.3); }
  else { ex = W + 80; ey = R(10, H * 0.3); }
  const tx = opt.tx !== undefined ? opt.tx : clamp(G.r.x + R(-90, 90), 20, W - 20);
  const ty = anchorY();
  let dx = tx - ex; const dy = ty - ey;
  if (Math.abs(dx) > dy * 1.1) dx = Math.sign(dx) * dy * 1.1;
  const L = Math.hypot(dx, dy), sp = opt.speed || cometSpeed(dm);
  const w = { ex, ey, vx: dx / L * sp, vy: dy / L * sp, t: opt.delay || 0.95, max: opt.delay || 0.95 };
  // marker: where the path crosses into the screen
  let mx, my;
  if (ey < 0) { const tt = (16 - ey) / w.vy; mx = ex + w.vx * tt; my = 16; }
  else { mx = ex < 0 ? 16 : W - 16; const tt = Math.abs((mx - ex) / w.vx); my = ey + w.vy * tt; }
  const hudB = safeTop / SCALE + 78;
  if (ey < 0) { const tt = (hudB - ey) / w.vy; mx = ex + w.vx * tt; my = hudB; }
  w.mx = clamp(mx, 16, W - 16); w.my = clamp(my, hudB, H - 16);
  G.warns.push(w);
  Snd.warn();
}

function spawnComet(w) {
  G.comets.push({ x: w.ex, y: G.camY + w.ey, vx: w.vx, vy: w.vy, rot: Math.atan2(w.vy, w.vx) - Math.PI / 2,
    alive: true, minD: 999, passed: false, wob: Math.random() * 6 });
}

function startShower() {
  const fromRight = Math.random() < 0.5, n = RI(5, 7), gap = RI(0, n - 1);
  G.shower = { n, i: 0, t: 0, fromRight, gap };
  floatText('comet shower!', W / 2, G.camY + H * 0.3, RED, 30, true);
}

// ---------------------------------------------------------------- effects
function floatText(txt, x, y, col, size, screen) {
  G.texts.push({ txt, x, y: screen ? y - G.camY : y, col: col || INK, size: size || 20, t: 0, life: screen ? 1.6 : 0.9, screen: !!screen });
}
function sparkle(x, y, n, col) {
  for (let i = 0; i < n; i++) {
    const a = R(0, 6.28), sp = R(70, 220);
    G.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: R(0.35, 0.65), t: 0, s: R(3, 6.5),
      col: col || (Math.random() < 0.6 ? '#f2b705' : INK), rot: R(0, 3) });
  }
}
function inkBurst(x, y, n, big) {
  for (let i = 0; i < n; i++) {
    const a = R(0, 6.28), sp = R(60, big ? 330 : 220);
    G.parts.push({ type: Math.random() < 0.5 ? 'shard' : 'blob', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: R(0.5, 1.1), t: 0, s: R(2, big ? 9 : 6), rot: R(0, 6.28), vr: R(-8, 8) });
  }
}

// ---------------------------------------------------------------- input
const input = { id: null, sx: 0, stx: 0, moved: 0, keys: {} };
cv.addEventListener('pointerdown', e => {
  Snd.init(); Snd.resume();
  if (input.id !== null) return;
  input.id = e.pointerId; input.sx = e.clientX; input.stx = G.r ? G.r.tx : 200; input.moved = 0;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
cv.addEventListener('pointermove', e => {
  if (e.pointerId !== input.id || !G.r) return;
  const dx = (e.clientX - input.sx) / SCALE;
  input.moved = Math.max(input.moved, Math.abs(dx));
  if (G.state === 'play' || G.state === 'launch') G.r.tx = clamp(input.stx + dx * 1.3, 22, W - 22);
  if (input.moved > 25) G.hintDrag = Math.min(G.hintDrag, 0.4);
});
const endPtr = e => { if (e.pointerId === input.id) input.id = null; };
if (!window.PointerEvent) {
  const tp = (t, fn) => cv.addEventListener(t, e => { const c = e.changedTouches[0]; if (c) fn({ pointerId: 1, clientX: c.clientX }); e.preventDefault(); }, { passive: false });
  tp('touchstart', e => { Snd.init(); Snd.resume(); if (input.id !== null) return; input.id = 1; input.sx = e.clientX; input.stx = G.r ? G.r.tx : 200; input.moved = 0; });
  tp('touchmove', e => { if (input.id === null || !G.r) return; const dx = (e.clientX - input.sx) / SCALE; input.moved = Math.max(input.moved, Math.abs(dx)); if (G.state === 'play' || G.state === 'launch') G.r.tx = clamp(input.stx + dx * 1.3, 22, W - 22); });
  tp('touchend', () => { input.id = null; }); tp('touchcancel', () => { input.id = null; });
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
// if the drag restarts while target was clamped, re-anchor so steering never feels stuck
window.addEventListener('keydown', e => {
  input.keys[e.key] = true;
  if ((e.key === ' ' || e.key === 'Enter') && G.state === 'title' && !anyCardOpen()) startRun();
  if ((e.key === 'Escape' || e.key === 'p') && (G.state === 'play' || G.state === 'launch')) togglePause();
});
window.addEventListener('keyup', e => { input.keys[e.key] = false; });
document.addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------- update
function update(dt) {
  G.t += dt;
  const r = G.r;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if (G.comboT > 0) G.comboT -= dt;
  if (G.state === 'title') { G.skyFade = Math.min(1, G.skyFade + dt * 2); updateParts(dt); return; }
  if (G.state !== 'launch' && G.state !== 'play' && G.state !== 'dying') { updateParts(dt); return; }
  if (G.skyFade > 0) G.skyFade = Math.max(0, G.skyFade - dt * 2.5);

  // keyboard steering
  if (G.state !== 'dying') {
    if (input.keys.ArrowLeft || input.keys.a) r.tx = clamp(r.tx - 430 * dt, 22, W - 22);
    if (input.keys.ArrowRight || input.keys.d) r.tx = clamp(r.tx + 430 * dt, 22, W - 22);
  }

  if (G.state === 'launch') {
    G.lt += dt;
    if (G.lt > 0.45) r.flame = Math.min(1, r.flame + dt * 3);
    else r.flame = Math.min(0.45, r.flame + dt * 1.2);
    if (G.lt > 1.6 && r.y < -300) { G.state = 'play'; }
  }

  if (G.state === 'launch' || G.state === 'play') updateRocket(dt);
  else updateDying(dt);

  // camera follows the rocket upward only
  const want = r.y - anchorY();
  if (G.state !== 'dying' && want < G.camY) G.camY = want;

  // distance
  G.run.dist = Math.max(G.run.dist, -(r.y + ROCKET_H / 2 + PAD_H) / 10);

  while (G.genY > G.camY - 260) genChunk();
  updateStars(dt);
  updateComets(dt);
  updatePowerups(dt);
  updateParts(dt);

  // warp streaks
  if (r.warp > 0 || r.speed > 450) {
    const rate = r.warp > 0 ? 40 : 8;
    if (Math.random() < rate * dt) G.streaks.push({ x: R(10, W - 10), y: -80, v: R(900, 1500), len: R(30, 80), w: R(-3, 3) });
  }
  for (const s of G.streaks) s.y += s.v * dt;
  G.streaks = G.streaks.filter(s => s.y < H + 60);

  // hints / low fuel
  if (G.hintDrag > 0) G.hintDrag -= dt;
  if (G.hintFuel > 0) G.hintFuel -= dt;
  if (G.state === 'play' && r.fuel / r.fuelMax < 0.22 && !r.sputter) {
    G.lowT -= dt;
    if (G.lowT <= 0) { Snd.low(); G.lowT = 0.75; }
    if (save.runs < 4 && !G.run.fuelHinted) { G.run.fuelHinted = true; G.hintFuel = 3.2; }
  }
}

function updateRocket(dt) {
  const r = G.r, d = G.run.dist;
  let target;
  if (G.state === 'launch') target = G.lt < 0.45 ? 0 : Math.min(baseSpeed(0), (G.lt - 0.45) * 520);
  else target = baseSpeed(d) * (r.warp > 0 ? 2.4 : 1);
  if (r.sputter > 0) {
    r.sputter += dt;
    target = baseSpeed(d) * Math.max(0, 1 - r.sputter / 1.0);
    r.flame = Math.max(0, 0.6 - r.sputter) * (Math.random() < 0.5 ? 1 : 0.2);
    if (r.sputter > 1.0) { r.vy += 520 * dt; r.y += r.vy * dt; r.tilt += Math.sin(G.t * 9) * dt * 0.8; }
    if (r.sputter > 2.5 || r.y - G.camY > H + 60) { crash('fuel'); return; }
  }
  r.speed += (target - r.speed) * Math.min(1, dt * (r.warp > 0 ? 3 : 2.2));
  r.y -= r.speed * dt;

  // steering (smooth follow of the finger target)
  const ox = r.x;
  r.x += (clamp(r.tx, 22, W - 22) - r.x) * (1 - Math.exp(-14 * dt));
  const vx = (r.x - ox) / Math.max(dt, 1e-3);
  if (!r.sputter) r.tilt += (clamp(vx * 0.0012, -0.42, 0.42) - r.tilt) * Math.min(1, dt * 10);

  // fuel
  if (G.state === 'play' && r.warp <= 0 && !r.sputter) {
    r.fuel -= burnRate(d) * dt;
    if (r.fuel <= 0) { r.fuel = 0; r.sputter = 0.001; Snd.sputter(); floatText('out of stardust!', W / 2, G.camY + H * 0.42, RED, 28, true); }
  }
  if (!r.sputter && G.state === 'play') r.flame = r.warp > 0 ? 1.7 : 1;
  if (r.inv > 0) r.inv -= dt;
  if (r.warp > 0) {
    r.warp -= dt;
    if (r.warp <= 0) { r.warp = 0; r.inv = Math.max(r.inv, 1.0); floatText('warp over', r.x, r.y - 70, PURPLE, 20); }
  }
  r.shieldT += dt;

  // exhaust puffs
  r.puffT -= dt;
  if (r.flame > 0.3 && r.puffT <= 0) {
    r.puffT = r.warp > 0 ? 0.02 : 0.05;
    const s = Math.sin(r.tilt), c = Math.cos(r.tilt), ly = 62;
    G.parts.push({ type: 'puff', x: r.x - s * ly + R(-4, 4), y: r.y + c * ly, vx: R(-25, 25) - s * 40, vy: R(30, 80), life: R(0.45, 0.8), t: 0, s: R(3, 6) });
  }
}

function recoverEngine() {
  const r = G.r; r.sputter = 0; r.vy = 0; r.tilt *= 0.3; r.flame = 1;
  floatText('phew!', r.x, r.y - 70, INK, 26);
}

function crash(reason, c) {
  const r = G.r;
  if (!r.alive) return;
  r.alive = false; G.state = 'dying'; G.deathT = 0; G.deathReason = reason;
  $('pauseBtn').classList.add('hidden');
  r.spinV = R(4, 8) * (Math.random() < 0.5 ? -1 : 1);
  r.dvx = c ? clamp(c.vx * 0.35, -160, 160) : R(-50, 50); r.dvy = c ? -140 : r.vy;
  r.flame = 0;
  inkBurst(r.x, r.y, 28, true);
  Snd.crash(); buzz([90, 50, 140]); G.shake = 14;
  if (c) smashComet(c, false);
  G.warns.length = 0;
}

function updateDying(dt) {
  const r = G.r;
  G.deathT += dt;
  r.spin += r.spinV * dt; r.x += r.dvx * dt; r.dvy += 480 * dt; r.y += r.dvy * dt;
  if (Math.random() < dt * 12) inkBurst(r.x, r.y, 1, false);
  if (G.deathT > 1.35 && G.state === 'dying') gameOver();
}

function bodyHit(px, py, pr) {
  const r = G.r, s = Math.sin(r.tilt), c = Math.cos(r.tilt);
  const seg = (ax, ay, bx, by, rad) => {
    const Ax = r.x + ax * c - ay * s, Ay = r.y + ax * s + ay * c, Bx = r.x + bx * c - by * s, By = r.y + bx * s + by * c;
    return distSeg(px, py, Ax, Ay, Bx, By) - rad - pr;
  };
  return Math.min(seg(-3.6, -26, -3.6, 40, 9.5), seg(14, -10, 14, 32, 5));
}
function distSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}

function updateStars(dt) {
  const r = G.r;
  const mag = r.warp > 0 ? 120 : G.perks.magnet;
  for (const s of G.stars) {
    if (s.got) continue;
    const k = STAR_KINDS[s.kind];
    if (r.alive && mag) {
      const dx = r.x - s.x, dy = r.y - s.y, d = Math.hypot(dx, dy);
      if (d < mag && d > 1) { const m = Math.min(d, (r.warp > 0 ? 900 : 520) * dt); s.x += dx / d * m; s.y += dy / d * m; }
    }
    if (r.alive && G.state !== 'dying' && bodyHit(s.x, s.y, k.r * 0.8) < 0) collectStar(s, k);
  }
  G.stars = G.stars.filter(s => !s.got && s.y - G.camY < H + 80);
}

function collectStar(s, k) {
  const r = G.r; s.got = true;
  const val = k.val * (s.kind === 'big' ? G.perks.bigMul : 1);
  G.run.stars += val;
  r.fuel = Math.min(r.fuelMax, r.fuel + k.fuel * G.perks.fuelMul);
  if (r.sputter > 0) recoverEngine();
  G.combo = G.comboT > 0 ? G.combo + 1 : 0; G.comboT = 0.8;
  if (k.val >= 3) { Snd.bigStar(); buzz(15); } else Snd.star(G.combo);
  sparkle(s.x, s.y, k.val >= 3 ? 12 : 6);
  floatText('+' + val, s.x + R(-6, 6), s.y - 14, k.val >= 3 ? GOLD : INK, k.val >= 3 ? 26 : 19);
}

function updateComets(dt) {
  const r = G.r, dm = G.run.dist;
  if (G.state === 'play' && r.warp <= 0 && !r.sputter) {
    G.cometT -= dt;
    if (G.cometT <= 0) { queueComet(); G.cometT = cometInterval(dm) * R(0.7, 1.3); }
    if (dm > 450 && !G.shower) { G.showerT -= dt; if (G.showerT <= 0) { startShower(); G.showerT = R(24, 38); G.cometT += 2.2; } }
  }
  if (G.shower) {
    const sh = G.shower; sh.t -= dt;
    if (sh.t <= 0 && G.state === 'play' && r.warp <= 0) {
      if (sh.i !== sh.gap) {
        const lane = (sh.i + 0.5) / sh.n;
        queueComet({ side: 0, ex: sh.fromRight ? W + 30 - lane * 120 : -30 + lane * 120, tx: sh.fromRight ? W - lane * W : lane * W, delay: 0.85, speed: Math.min(560, 300 + dm * 0.06) });
      }
      sh.i++; sh.t = 0.3;
      if (sh.i >= sh.n) G.shower = null;
    }
  }
  for (const w of G.warns) { w.t -= dt; if (w.t <= 0) spawnComet(w); }
  G.warns = G.warns.filter(w => w.t > 0);

  for (const c of G.comets) {
    if (!c.alive) continue;
    c.x += c.vx * dt; c.y += (c.vy - (G.state === 'dying' ? 0 : r.speed)) * dt;
    if (r.alive && G.state !== 'dying') {
      const shR = 44;
      if (r.shield > 0 && r.warp <= 0 && Math.hypot(c.x - r.x, c.y - (r.y + 4)) < shR + COMET_R) {
        r.shield = 0; r.inv = Math.max(r.inv, 1.1); smashComet(c, false); shieldPop(); continue;
      }
      const d = bodyHit(c.x, c.y, COMET_R);
      if (d < 0) {
        if (r.warp > 0) { smashComet(c, true); continue; }
        if (r.inv > 0) continue;
        crash('comet', c); continue;
      }
      c.minD = Math.min(c.minD, d);
      if (!c.passed && c.y - G.camY > anchorY() + 70) {
        c.passed = true;
        if (c.minD < 10 && r.inv <= 0 && r.warp <= 0) { G.run.stars += 1; G.run.near++; Snd.near(); floatText('close one! +1', r.x, r.y - 72, GOLD, 22); sparkle(r.x, r.y - 30, 5); }
      }
    }
  }
  G.comets = G.comets.filter(c => c.alive && c.y - G.camY < H + 160 && c.x > -220 && c.x < W + 220 && c.y - G.camY > -400);
}

function smashComet(c, bonus) {
  c.alive = false;
  inkBurst(c.x, c.y, 14, false);
  for (let i = 0; i < 6; i++) G.parts.push({ type: 'rock', x: c.x, y: c.y, vx: R(-160, 160), vy: R(-160, 120), life: R(0.6, 1), t: 0, s: R(3, 6), rot: R(0, 6), vr: R(-6, 6) });
  Snd.smash(); G.shake = Math.max(G.shake, 6);
  if (bonus) { G.run.stars += 2; floatText('smash! +2', c.x, c.y - 20, PURPLE, 24); }
}

function shieldPop() {
  const r = G.r;
  Snd.pop(); buzz(40);
  for (let i = 0; i < 18; i++) { const a = i / 18 * 6.28; G.parts.push({ type: 'spark', x: r.x + Math.cos(a) * 44, y: r.y + Math.sin(a) * 44, vx: Math.cos(a) * 160, vy: Math.sin(a) * 160, life: 0.5, t: 0, s: 4, col: '#7fb6ff', rot: 0 }); }
  floatText('saved by the cat!', r.x, r.y - 78, INK, 22);
}

function updatePowerups(dt) {
  const r = G.r;
  for (const g of G.gals) {
    g.spin += dt * (g.used ? 7 : 0.9);
    if (g.used) { g.k = Math.max(0, g.k - dt * 1.6); continue; }
    const dx = g.x - r.x, dy = g.y - r.y, d = Math.hypot(dx, dy);
    if (r.alive && !r.sputter && d < 150 && G.state === 'play') { r.x += clamp(dx, -1, 1) * 380 * (1 - d / 150) * dt; }
    if (r.alive && G.state === 'play' && d < 42) startWarp(g);
  }
  G.gals = G.gals.filter(g => g.k > 0 && g.y - G.camY < H + 150);
  for (const p of G.planets) {
    p.bob += dt;
    if (p.got) { p.k = Math.max(0, p.k - dt * 2.6); p.x = lerp(p.x, r.x, dt * 6); p.y = lerp(p.y, r.y, dt * 6); continue; }
    const d = Math.hypot(p.x - r.x, p.y - r.y);
    if (r.alive && G.state === 'play' && d < 52) {
      p.got = true;
      if (r.shield > 0) { G.run.stars += 3; floatText('purr! +3', p.x, p.y - 60, GOLD, 26); }
      else { r.shield = 1; r.shieldT = 0; floatText('meow! shield', p.x, p.y - 64, INK, 28); }
      Snd.meow(); buzz(25); sparkle(p.x, p.y, 14, '#7fb6ff');
    }
  }
  G.planets = G.planets.filter(p => p.k > 0 && p.y - G.camY < H + 160);
}

function startWarp(g) {
  const r = G.r; g.used = true;
  r.warp = 3 + G.perks.warpBonus; r.warpMax = r.warp; r.inv = Math.max(r.inv, r.warp + 0.5);
  if (r.sputter) recoverEngine();
  r.fuel = Math.min(r.fuelMax, r.fuel + 10);
  Snd.warp(); buzz(35); G.shake = 7; G.flashT = 0.35;
  floatText('WARP!', W / 2, G.camY + H * 0.3, PURPLE, 44, true);
  G.warns.length = 0; G.shower = null;
}

function updateParts(dt) {
  for (const p of G.parts) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.type === 'puff') { p.vx *= 0.96; p.s += dt * 9; }
    else if (p.type === 'spark') { p.vx *= 0.9; p.vy *= 0.9; p.rot += dt * 4; }
    else { p.vy += 300 * dt; p.rot += (p.vr || 0) * dt; }
  }
  G.parts = G.parts.filter(p => p.t < p.life);
  for (const t of G.texts) { t.t += dt; if (!t.screen) t.y -= 38 * dt; }
  G.texts = G.texts.filter(t => t.t < t.life);
}

// ---------------------------------------------------------------- drawing helpers
function spr(name, x, y, scale, rot, ax, ay, alpha) {
  const im = IMG[name]; if (!im) return;
  const w = im.width * scale, h = im.height * scale;
  if (!rot && (alpha === undefined || alpha >= 1)) { ctx.drawImage(im, x - w * ax, y - h * ay, w, h); return; }
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (alpha !== undefined) ctx.globalAlpha *= alpha;
  ctx.drawImage(im, -w * ax, -h * ay, w, h); ctx.restore();
}
function wobblyCircle(cx, cy, r, seed, amp) {
  amp = amp === undefined ? 0.05 : amp; const n = 30;
  ctx.beginPath();
  for (let i = 0; i <= n + 2; i++) {
    const a = (i / n) * Math.PI * 2 + seed * 0.37;
    const rr = r * (1 + amp * (hash(seed * 7 + (i % n)) - 0.5) * 2);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
}
function penText(txt, x, y, size, col, align, alpha) {
  ctx.font = size + 'px ' + FONT; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle';
  ctx.globalAlpha = alpha === undefined ? 1 : alpha;
  ctx.lineWidth = Math.max(2, size * 0.16); ctx.strokeStyle = 'rgba(251,250,243,0.9)'; ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y);
  ctx.fillStyle = col || INK; ctx.fillText(txt, x, y);
  ctx.globalAlpha = 1;
}
function sparkPath(x, y, s, rot) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, rr = i % 2 === 0 ? s : s * 0.32; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  ctx.closePath(); ctx.restore();
}

// ---------------------------------------------------------------- render
function render() {
  ctx.setTransform(DPR * SCALE, 0, 0, DPR * SCALE, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  drawPaper();
  if (!G.r) return;
  ctx.save();
  if (G.shake > 0) ctx.translate(R(-1, 1) * G.shake * 0.5, R(-1, 1) * G.shake * 0.5);
  ctx.translate(0, -G.camY);
  drawMarkers();
  if (G.skyFade > 0) drawTitleSky(G.skyFade);
  if (G.camY + H > -260) drawGarden();
  for (const g of G.gals) drawGalaxy(g);
  for (const p of G.planets) drawPlanet(p);
  for (const s of G.stars) drawStar(s);
  drawParts('puff');
  drawRocket();
  for (const c of G.comets) drawComet(c);
  drawParts('fx');
  for (const t of G.texts) if (!t.screen) penText(t.txt, t.x, t.y, t.size, t.col, 'center', Math.min(1, (t.life - t.t) * 3));
  ctx.restore();
  // screen-space layers
  if (G.streaks.length) {
    ctx.strokeStyle = 'rgba(34,40,128,0.32)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round'; ctx.beginPath();
    for (const s of G.streaks) { ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(s.x + s.w, s.y + s.len * 0.5, s.x, s.y + s.len); }
    ctx.stroke();
  }
  if (G.flashT > 0) { G.flashT -= 1 / 60; ctx.fillStyle = 'rgba(196,170,255,' + clamp(G.flashT * 1.6, 0, 0.5) + ')'; ctx.fillRect(0, 0, W, H); }
  for (const w of G.warns) drawWarning(w);
  for (const t of G.texts) if (t.screen) penText(t.txt, t.x, t.y, t.size * (t.t < 0.15 ? 0.7 + t.t * 2 : 1), t.col, 'center', Math.min(1, (t.life - t.t) * 2.5));
  if (G.state === 'launch' || G.state === 'play' || G.state === 'dying') drawHUD();
  drawHints();
}

const PAPER_STOPS = [[0, 251, 250, 243], [600, 244, 247, 252], [1500, 237, 238, 251], [3000, 231, 229, 247]];
function paperColor(d) {
  let a = PAPER_STOPS[0], b = PAPER_STOPS[PAPER_STOPS.length - 1];
  for (let i = 0; i < PAPER_STOPS.length - 1; i++) if (d >= PAPER_STOPS[i][0] && d < PAPER_STOPS[i + 1][0]) { a = PAPER_STOPS[i]; b = PAPER_STOPS[i + 1]; break; }
  if (d >= b[0]) a = b;
  const t = a === b ? 0 : (d - a[0]) / (b[0] - a[0]);
  return 'rgb(' + Math.round(lerp(a[1], b[1], t)) + ',' + Math.round(lerp(a[2], b[2], t)) + ',' + Math.round(lerp(a[3], b[3], t)) + ')';
}
function drawPaper() {
  const alt = G.camY < titleCam() ? (titleCam() - G.camY) / 10 : 0;
  ctx.fillStyle = paperColor(alt); ctx.fillRect(0, 0, W, H);
  const warp = G.r && G.r.warp > 0;
  const po = -G.camY * 0.5;
  const off = (po % 48 + 48) % 48;
  if (alt > 20) { // faint pen specks: distant stars doodled on the page
    ctx.fillStyle = ctx.strokeStyle = 'rgba(34,40,128,' + Math.min(0.32, (alt - 20) / 300) + ')'; ctx.lineWidth = 1;
    const j0 = Math.floor(-po / 48) - 1, j1 = Math.floor((H - po) / 48) + 1;
    ctx.beginPath();
    for (let j = j0; j <= j1; j++) for (let i = 0; i < 9; i++) {
      const h = hash(j * 9.13 + i * 3.7);
      if (h > 0.34) continue;
      const x = i * 48 + 8 + hash(j * 1.7 + i * 5.3) * 44, y = j * 48 + po + hash(j * 4.1 + i * 2.9) * 44;
      if (h < 0.1) { ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); }
      else { ctx.moveTo(x + 1.3, y); ctx.arc(x, y, 1.3, 0, 6.283); }
    }
    ctx.stroke();
  }
  ctx.lineWidth = 0.55; ctx.strokeStyle = warp ? 'rgba(120,140,215,0.12)' : 'rgba(120,140,215,0.33)';
  ctx.beginPath();
  for (let y = (off % 12) - 12; y < H + 12; y += 12) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.lineWidth = 0.75; ctx.strokeStyle = 'rgba(150,100,205,0.42)';
  ctx.beginPath();
  for (let y = off - 48; y < H + 48; y += 48) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  for (let x = 8; x < W; x += 48) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  ctx.stroke();
}

function drawMarkers() {
  if (G.state === 'title') return;
  const top = G.camY, bot = G.camY + H;
  const m0 = Math.max(1, Math.ceil(-bot / 1000)), m1 = Math.floor(-top / 1000);
  ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(34,40,128,0.45)';
  for (let m = m0; m <= m1; m++) {
    const y = -m * 1000 - PAD_H - ROCKET_H / 2;
    if (y - G.camY < safeTop / SCALE + 66) continue;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(16, y + 1); ctx.stroke();
    penText(m * 100 + ' m', 20, y, 15, 'rgba(34,40,128,0.6)', 'left');
  }
  if (save.best > 30) {
    const y = -save.best * 10 - PAD_H - ROCKET_H / 2;
    if (y > top - 20 && y < bot + 20) {
      ctx.save(); ctx.setLineDash([7, 6]); ctx.strokeStyle = 'rgba(216,51,58,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.restore();
      penText('best ' + save.best + ' m', W - 8, y - 11, 16, RED, 'right', 0.85);
    }
  }
}

function drawTitleSky(a) {
  const cy = titleCam();
  ctx.save(); ctx.globalAlpha = a;
  const t = G.t;
  const py = cy + H * 0.335 + Math.sin(t * 1.3) * 5;
  spr('catplanet', 304, py, 132 / SP.catplanet.w, Math.sin(t * 0.8) * 0.05, 0.5, 0.5);
  spr('galaxy', 82, cy + H * 0.325, 84 / SP.galaxy.h, t * 0.5, SP.galaxy.cx / SP.galaxy.w, SP.galaxy.cy / SP.galaxy.h);
  const tw = [[30, 0.2, 'star_tiny'], [376, 0.19, 'star_small'], [168, 0.36, 'star_tiny'], [196, 0.27, 'star_line'], [24, 0.62, 'star_small'], [380, 0.6, 'star_tiny']];
  tw.forEach((s, i) => { const k = STAR_KINDS[s[2] === 'star_line' ? 'line' : s[2] === 'star_small' ? 'small' : 'tiny']; const sc = (k.h * 0.85 / IMG[s[2]].height) * (1 + 0.12 * Math.sin(t * 3 + i * 2)); spr(s[2], s[0], cy + H * s[1], sc, Math.sin(t + i) * 0.15, 0.5, 0.5); });
  ctx.restore();
}

function gardenLayout() {
  const st = stageOf(save.total);
  if (!G.btnBottom) { const b = document.querySelector('#title .btns'); const rc = b ? b.getBoundingClientRect() : null; G.btnBottom = rc && rc.height ? rc.bottom / SCALE : H * 0.6; }
  const maxH = clamp(groundScreenY() - G.btnBottom - 14, 120, 250);
  const treeH = maxH * [0.46, 0.46, 0.5, 0.66, 0.84, 1, 1][st];
  return { st, treeH };
}

function drawGarden() {
  const L = gardenLayout(), t = G.t;
  // soil hatching
  ctx.save();
  ctx.fillStyle = 'rgba(236,150,110,0.18)'; ctx.fillRect(-10, 2, W + 20, 140);
  ctx.strokeStyle = 'rgba(34,40,128,0.35)'; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 34; i++) { const x = i * 12.5 + hash(i) * 6, y = 10 + hash(i + 50) * 40; ctx.moveTo(x, y); ctx.lineTo(x + 9, y - 7); }
  ctx.stroke();
  // ground line
  ctx.strokeStyle = INK; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
  ctx.beginPath(); for (let x = -6; x <= W + 6; x += 10) ctx.lineTo(x, Math.sin(x * 0.05) * 1.6 + hash(x) * 1.2); ctx.stroke();
  // grass tufts
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 14; i++) { const x = 14 + i * 29 + hash(i + 9) * 10; ctx.beginPath(); ctx.moveTo(x - 4, -6); ctx.lineTo(x, 0); ctx.lineTo(x + 2, -8); ctx.moveTo(x, 0); ctx.lineTo(x + 6, -5); ctx.stroke(); }
  ctx.restore();
  // tree
  const ts = L.treeH / SP.tree.h;
  spr('tree', 92, 2, ts, Math.sin(t * 0.9) * 0.012, SP.tree.bx / SP.tree.w, 1);
  if (L.st >= 5) {
    const fruit = [[0.32, 0.18], [0.62, 0.12], [0.5, 0.3], [0.2, 0.36], [0.75, 0.33], [0.42, 0.06]];
    const n = L.st >= 6 ? 6 : 4;
    for (let i = 0; i < n; i++) {
      const fx = 92 - SP.tree.bx * ts + fruit[i][0] * SP.tree.w * ts, fy = 2 - SP.tree.h * ts + fruit[i][1] * SP.tree.h * ts;
      spr(i % 2 ? 'star_tiny' : 'star_small', fx, fy, (23 / 61) * (1 + 0.15 * Math.sin(t * 3 + i)), Math.sin(t * 2 + i) * 0.2, 0.5, 0.5);
    }
  }
  // pot + plant
  const pw = 92, ps = pw / SP.pot.w, px = 316 - pw / 2, py = 2 - SP.pot.h * ps;
  if (L.st >= 2) spr('flower', px + SP.flower.ox * ps, py + SP.flower.oy * ps + 2, ps, Math.sin(t * 1.4) * 0.02, 0, 0);
  else if (L.st === 1) spr('sprout', px + SP.sprout.ox * ps, py + SP.sprout.oy * ps + 2, ps, 0, 0, 0);
  spr('pot', px, py, ps, 0, 0, 0);
  // launch pad
  ctx.save(); ctx.strokeStyle = INK; ctx.lineWidth = 1.8; ctx.fillStyle = 'rgba(255,224,102,0.55)';
  ctx.beginPath(); ctx.moveTo(168, 0); ctx.lineTo(176, -PAD_H); ctx.lineTo(224, -PAD_H); ctx.lineTo(232, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.lineWidth = 1; ctx.beginPath(); for (let x = 178; x < 224; x += 7) { ctx.moveTo(x, -1); ctx.lineTo(x + 5, -PAD_H + 1); } ctx.stroke();
  ctx.restore();
}

function drawRocket() {
  const r = G.r; if (!r) return;
  if (r.inv > 0 && r.alive && r.warp <= 0 && Math.floor(G.t * 14) % 2 === 0 && G.state === 'play') return;
  ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.tilt + r.spin);
  const w = SP.rocket.w * RS, h = SP.rocket.h * RS;
  // flame
  if (r.flame > 0.02 && IMG.flame) {
    const fl = r.flame * (0.82 + 0.3 * Math.random());
    const fw = SP.flame.w * RS * (r.warp > 0 ? 1.35 : 1), fh = SP.flame.h * RS * fl * (r.warp > 0 ? 1.5 : 1.15);
    const fx = -w / 2 + SP.rocket.fx * RS + SP.flame.w * RS / 2;
    const fy = -h / 2 + SP.rocket.fy * RS - 1;
    ctx.drawImage(IMG.flame, fx - fw / 2, fy, fw, fh);
  }
  ctx.drawImage(IMG.rocket, -w / 2, -h / 2, w, h);
  ctx.restore();
  // shield bubble with cat ears
  if (r.shield > 0 && r.alive) {
    const cx = r.x, cy = r.y + 4, rad = 44 + Math.sin(G.t * 5) * 1.5;
    ctx.save();
    ctx.fillStyle = 'rgba(150,205,255,0.2)'; ctx.strokeStyle = 'rgba(34,40,128,0.75)'; ctx.lineWidth = 1.8;
    wobblyCircle(cx, cy, rad, Math.floor(G.t * 6) % 5 + 1, 0.03); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(150,205,255,0.45)';
    [-1, 1].forEach(sd => {
      const a = -Math.PI / 2 + sd * 0.55, bx = cx + Math.cos(a) * rad, by = cy + Math.sin(a) * rad;
      ctx.beginPath(); ctx.moveTo(bx - 9 * sd * 0.2 - 8, by + 4); ctx.lineTo(bx + sd * 4, by - 16); ctx.lineTo(bx + 9, by + 3); ctx.closePath(); ctx.fill(); ctx.stroke();
    });
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx - 14, cy - 20, 14, Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
    ctx.restore();
  }
  // warp aura
  if (r.warp > 0) {
    ctx.save(); ctx.strokeStyle = 'rgba(122,60,200,0.5)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { wobblyCircle(r.x, r.y, 36 + i * 9 + Math.sin(G.t * 12 + i) * 3, i + Math.floor(G.t * 10), 0.08); ctx.stroke(); }
    ctx.restore();
  }
}

function drawStar(s) {
  const k = STAR_KINDS[s.kind], im = IMG[k.img]; if (!im) return;
  const sc = (k.h / im.height) * (1 + 0.09 * Math.sin(G.t * 4 + s.ph));
  spr(k.img, s.x, s.y, sc, Math.sin(G.t * 1.7 + s.ph) * 0.12, 0.5, 0.5);
}

function drawComet(c) {
  if (!c.alive || !IMG.comet) return;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot + Math.sin(G.t * 10 + c.wob) * 0.02);
  ctx.drawImage(IMG.comet, -SP.comet.hx * CS, -SP.comet.hy * CS, SP.comet.w * CS, SP.comet.h * CS);
  ctx.restore();
}

function drawGalaxy(g) {
  const k = g.k * (1 + 0.04 * Math.sin(G.t * 2));
  ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(-g.spin);
  const s = GS * k;
  ctx.drawImage(IMG.galaxy, -SP.galaxy.cx * s, -SP.galaxy.cy * s, SP.galaxy.w * s, SP.galaxy.h * s);
  ctx.restore();
  if (!g.used && G.state === 'play') {
    const dy = g.y - G.camY;
    if (dy > -60 && dy < H) penText('warp!', g.x, g.y + 74, 18, PURPLE, 'center', 0.8);
  }
}

function drawPlanet(p) {
  const s = PS * p.k, y = p.y + Math.sin(p.bob * 1.6) * 4;
  ctx.save(); ctx.translate(p.x, y); ctx.rotate(Math.sin(p.bob) * 0.05 + (p.got ? (1 - p.k) * 3 : 0));
  ctx.drawImage(IMG.catplanet, -SP.catplanet.cx * s, -SP.catplanet.cy * s, SP.catplanet.w * s, SP.catplanet.h * s);
  ctx.restore();
  if (!p.got && G.state === 'play') penText('shield', p.x, y + 66, 17, INK, 'center', 0.75);
}

function drawParts(layer) {
  for (const p of G.parts) {
    const a = 1 - p.t / p.life;
    if (layer === 'puff') {
      if (p.type !== 'puff') continue;
      ctx.strokeStyle = 'rgba(34,40,128,' + (a * 0.45) + ')'; ctx.lineWidth = 1.1;
      wobblyCircle(p.x, p.y, p.s, (p.x * 13) | 0, 0.12); ctx.stroke();
      continue;
    }
    if (p.type === 'puff') continue;
    if (p.type === 'spark') { ctx.fillStyle = p.col; ctx.globalAlpha = a; sparkPath(p.x, p.y, p.s, p.rot); ctx.fill(); ctx.globalAlpha = 1; }
    else if (p.type === 'blob') { ctx.fillStyle = 'rgba(34,40,128,' + a + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.6 + 0.4 * a), 0, 6.283); ctx.fill(); }
    else if (p.type === 'shard') { ctx.strokeStyle = 'rgba(34,40,128,' + a + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + Math.cos(p.rot) * p.s * 1.8, p.y + Math.sin(p.rot) * p.s * 1.8); ctx.stroke(); }
    else if (p.type === 'rock') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = 'rgba(205,200,190,' + a + ')'; ctx.strokeStyle = 'rgba(34,40,128,' + a + ')'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-p.s, -p.s * 0.6); ctx.lineTo(p.s * 0.8, -p.s); ctx.lineTo(p.s, p.s * 0.7); ctx.lineTo(-p.s * 0.6, p.s); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }
}

function drawWarning(w) {
  const k = 1 - w.t / w.max, pulse = 1 + 0.15 * Math.sin(G.t * 22);
  ctx.save(); ctx.globalAlpha = 0.5 + 0.5 * k;
  ctx.fillStyle = 'rgba(255,179,179,0.55)'; ctx.strokeStyle = RED; ctx.lineWidth = 2;
  wobblyCircle(w.mx, w.my, 13 * pulse, 3, 0.06); ctx.fill(); ctx.stroke();
  ctx.fillStyle = RED; ctx.font = 'bold 22px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', w.mx, w.my + 1);
  // little arrow showing direction
  const a = Math.atan2(w.vy, w.vx); ctx.lineWidth = 2; ctx.beginPath();
  const ax = w.mx + Math.cos(a) * 20, ay = w.my + Math.sin(a) * 20;
  ctx.moveTo(w.mx + Math.cos(a) * 15, w.my + Math.sin(a) * 15); ctx.lineTo(ax + Math.cos(a) * 6, ay + Math.sin(a) * 6); ctx.stroke();
  ctx.restore();
}

function drawHUD() {
  const r = G.r, top = safeTop / SCALE + 8;
  penText(Math.floor(G.run.dist) + ' m', 14, top + 18, 30, INK, 'left');
  if (save.best > 0) penText('best ' + save.best + ' m', 15, top + 44, 15, INK, 'left', 0.65);
  // stars
  const sx = W - 62;
  ctx.font = '26px ' + FONT; const tw = ctx.measureText(String(G.run.stars)).width;
  spr('star_line', sx - tw - 16, top + 18, 26 / SP_H('star_line'), Math.sin(G.t * 2) * 0.1, 0.5, 0.5);
  penText(String(G.run.stars), sx, top + 19, 26, INK, 'right');
  // fuel gauge
  const gx = 128, gy = top + 9, gw = 120, gh = 15, f = clamp(r.fuel / r.fuelMax, 0, 1);
  const low = f < 0.22;
  ctx.save();
  ctx.beginPath(); roundRectPath(gx, gy, gw, gh, 7); ctx.fillStyle = '#fffdf6'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = low ? (Math.floor(G.t * 6) % 2 ? '#ff8f8f' : '#ffc1c1') : (r.warp > 0 ? '#d4c0ff' : '#ffd84d');
  ctx.fillRect(gx, gy, gw * f, gh);
  ctx.strokeStyle = 'rgba(34,40,128,0.35)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let x = gx - 10; x < gx + gw * f; x += 6) { ctx.moveTo(x, gy + gh); ctx.lineTo(x + 10, gy); } ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); roundRectPath(gx + 0.5, gy - 0.5, gw - 1, gh + 1, 7); ctx.stroke();
  ctx.restore();
  penText(r.warp > 0 ? 'warp ' + r.warp.toFixed(1) + 's' : (low ? 'fuel low!' : 'stardust fuel'), gx + gw / 2, gy + gh + 11, 14, low ? RED : (r.warp > 0 ? PURPLE : INK), 'center', 0.85);
  if (r.shield > 0) {
    ctx.save(); ctx.strokeStyle = INK; ctx.fillStyle = 'rgba(150,205,255,0.45)'; ctx.lineWidth = 1.6;
    wobblyCircle(gx - 18, gy + 7, 10, 2, 0.04); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(gx - 26, gy); ctx.lineTo(gx - 24, gy - 8); ctx.lineTo(gx - 19, gy - 3); ctx.moveTo(gx - 17, gy - 3); ctx.lineTo(gx - 12, gy - 8); ctx.lineTo(gx - 10, gy); ctx.stroke();
    ctx.restore();
  }
}
function SP_H(n) { return IMG[n] ? IMG[n].height : 100; }
function roundRectPath(x, y, w, h, rr) {
  ctx.moveTo(x + rr, y); ctx.lineTo(x + w - rr, y); ctx.quadraticCurveTo(x + w, y, x + w, y + rr); ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h); ctx.lineTo(x + rr, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr); ctx.quadraticCurveTo(x, y, x + rr, y); ctx.closePath();
}

function drawHints() {
  if (G.state !== 'play' && G.state !== 'launch') return;
  if (G.hintDrag > 0 && G.r) {
    const a = Math.min(1, G.hintDrag * 2), y = rocketScreenY() + 92, sw = Math.sin(G.t * 3) * 26;
    if (y < H - 10) {
      penText('drag anywhere to steer', W / 2, Math.min(y, H - 40), 22, INK, 'center', a);
      ctx.save(); ctx.globalAlpha = a; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const cx = W / 2 + sw, cy = Math.min(y, H - 40) + 24;
      ctx.beginPath(); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx + 30, cy); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 22, cy - 6); ctx.moveTo(cx - 30, cy); ctx.lineTo(cx - 22, cy + 6);
      ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 22, cy - 6); ctx.moveTo(cx + 30, cy); ctx.lineTo(cx + 22, cy + 6); ctx.stroke(); ctx.restore();
    }
  }
  if (G.hintFuel > 0) penText('grab stars to refuel!', W / 2, safeTop / SCALE + 86, 22, RED, 'center', Math.min(1, G.hintFuel));
}

// ---------------------------------------------------------------- flow / UI
const screens = ['title', 'over', 'pause', 'garden', 'how'];
function show(id) { screens.forEach(s => $(s).classList.toggle('hidden', s !== id && !(id === 'garden' && s === 'title') && !(id === 'how' && s === 'title'))); }
function anyCardOpen() { return ['over', 'pause', 'garden', 'how'].some(s => !$(s).classList.contains('hidden')); }

function goTitle() {
  resetWorld(); G.state = 'title'; G.paused = false; G.skyFade = 0;
  $('pauseBtn').classList.add('hidden');
  updateTitle(); show('title');
  Snd.startMusic();
}
function updateTitle() {
  $('bestLine').textContent = save.best > 0 ? 'best: ' + save.best + ' m  ·  stardust: ' + save.total : '';
  G.btnBottom = 0;
  const st = stageOf(save.total);
  $('gardenBtn').textContent = 'Garden ' + st + '/' + (STAGES.length - 1);
}
function startRun() {
  Snd.init(); Snd.resume(); Snd.click();
  resetWorld(); G.state = 'launch'; G.paused = false;
  G.hintDrag = save.runs < 3 ? 4.5 : 0; G.hintFuel = 0;
  show(null); $('pauseBtn').classList.remove('hidden');
  Snd.ignite(); buzz(20); G.shake = 4;
  Snd.startMusic();
}
function gameOver() {
  G.state = 'over';
  $('pauseBtn').classList.add('hidden');
  const run = G.run, dist = Math.floor(run.dist);
  const oldTotal = save.total, oldStage = stageOf(oldTotal);
  save.total += run.stars; save.runs++;
  const newStage = stageOf(save.total);
  const isBest = dist > save.best && dist > 0;
  if (isBest) save.best = dist;
  writeSave();
  $('overTitle').textContent = G.deathReason === 'fuel' ? 'Out of stardust!' : 'Crash!';
  $('overSub').textContent = G.deathReason === 'fuel' ? 'The engine sputtered out. Grab more stars next time.' : 'A comet got you.';
  $('oDist').textContent = dist; $('oStars').textContent = run.stars;
  $('oBest').innerHTML = isBest ? '<span class="hl">New best!</span>' : 'best: ' + save.best + ' m';
  const g = $('oGrowth');
  if (newStage > oldStage) {
    g.classList.remove('hidden');
    g.innerHTML = '🌱 Your garden grew: <b>' + STAGES[newStage].name + '</b><br>Perk unlocked: <span class="hl">' + STAGES[newStage].perk + '</span>';
  } else g.classList.add('hidden');
  setBar($('oBar'), oldTotal, true);
  $('oGardenTxt').textContent = gardenLine();
  show('over');
  if (newStage > oldStage) {
    setTimeout(() => { $('oBar').style.width = '100%'; }, 120);
    setTimeout(() => { setBar($('oBar'), STAGES[newStage].at, true); setTimeout(() => setBar($('oBar'), save.total, false), 60); }, 1450);
  } else setTimeout(() => setBar($('oBar'), save.total, false), 120);
}
function stageProgress(total) {
  const st = stageOf(total);
  if (st >= STAGES.length - 1) return 1;
  return (total - STAGES[st].at) / (STAGES[st + 1].at - STAGES[st].at);
}
function setBar(el, total, instant) {
  if (instant) { el.style.transition = 'none'; el.style.width = (stageProgress(total) * 100) + '%'; void el.offsetWidth; el.style.transition = ''; }
  else el.style.width = (stageProgress(total) * 100) + '%';
}
function gardenLine() {
  const st = stageOf(save.total);
  if (st >= STAGES.length - 1) return 'Garden fully grown! Stardust: ' + save.total;
  return 'Garden: ' + save.total + ' / ' + STAGES[st + 1].at + ' stardust → ' + STAGES[st + 1].name;
}
function openGarden() {
  Snd.init(); Snd.resume(); Snd.click();
  const st = stageOf(save.total);
  $('gTotal').textContent = save.total;
  $('gNext').textContent = st >= STAGES.length - 1 ? 'Your garden is fully grown!' : (STAGES[st + 1].at - save.total) + ' more stardust until: ' + STAGES[st + 1].name;
  setBar($('gBar'), save.total, true);
  const ul = $('gList'); ul.innerHTML = '';
  STAGES.forEach((s, i) => {
    if (i === 0) return;
    const li = document.createElement('li'); li.className = i <= st ? 'done' : 'locked';
    li.innerHTML = '<span class="ck">' + (i <= st ? '✔' : '☆') + '</span><div>' + s.name + ' <small>' + s.at + ' stardust · ' + s.perk + '</small></div>';
    ul.appendChild(li);
  });
  show('garden');
}
function togglePause() {
  if (G.state !== 'play' && G.state !== 'launch') return;
  if (G.paused) resume(); else pause();
}
function pause() {
  if (G.paused || (G.state !== 'play' && G.state !== 'launch')) return;
  G.paused = true; input.id = null;
  $('pauseInfo').textContent = Math.floor(G.run.dist) + ' m · ' + G.run.stars + ' stars';
  $('pSoundBtn').textContent = 'Sound: ' + (save.sound ? 'on' : 'off');
  show('pause'); Snd.stopMusic();
}
function resume() {
  if (!G.paused) return;
  G.paused = false; show(null); Snd.resume(); Snd.startMusic();
  if (G.r) G.r.inv = Math.max(G.r.inv, 0.6);
}

function bindUI() {
  const tap = (id, fn) => $(id).addEventListener('click', e => { e.preventDefault(); Snd.init(); Snd.resume(); fn(); });
  tap('playBtn', startRun);
  tap('againBtn', startRun);
  tap('homeBtn', () => { Snd.click(); goTitle(); });
  tap('gardenBtn', openGarden);
  tap('howBtn', () => { Snd.click(); show('how'); });
  tap('gBack', () => { Snd.click(); show('title'); });
  tap('hBack', () => { Snd.click(); show('title'); if (!save.seenHow) { save.seenHow = true; writeSave(); } });
  tap('pauseBtn', () => { Snd.click(); pause(); });
  tap('resumeBtn', () => { Snd.click(); resume(); });
  tap('quitBtn', () => { Snd.click(); G.paused = false; goTitle(); });
  tap('soundBtn', () => { Snd.setOn(!save.sound); updateSoundBtn(); Snd.click(); });
  tap('pSoundBtn', () => { Snd.setOn(!save.sound); $('pSoundBtn').textContent = 'Sound: ' + (save.sound ? 'on' : 'off'); if (G.paused) Snd.stopMusic(); });
  document.addEventListener('pointerdown', () => { Snd.init(); Snd.resume(); if (G.state === 'title' || G.state === 'over') Snd.startMusic(); }, { passive: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) onBackground(); else Snd.resume(); });
  window.addEventListener('blur', () => { if (G.state === 'play' || G.state === 'launch') pause(); });
}
function updateSoundBtn() { $('soundBtn').innerHTML = save.sound ? '&#9834;' : '<s>&#9834;</s>'; }
function onBackground() { pause(); Snd.stopMusic(); Snd.suspend(); }

// hooks for the Android wrapper
window.__onPause = onBackground;
window.__onResume = () => { Snd.resume(); if (G.state === 'title' || G.state === 'over') Snd.startMusic(); };
window.__onBack = () => {
  if (G.state === 'play' || G.state === 'launch') { if (G.paused) { G.paused = false; goTitle(); } else pause(); return true; }
  if (!$('garden').classList.contains('hidden') || !$('how').classList.contains('hidden')) { show('title'); return true; }
  if (G.state === 'over' || G.state === 'dying') { goTitle(); return true; }
  return false;
};

// ---------------------------------------------------------------- boot
let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (!last) last = now;
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.paused && G.state !== 'loading') update(dt);
  if (G.state !== 'loading') render();
}

function loadImages() {
  const A = window.AERO_ASSETS || {};
  return Promise.all(Object.keys(A).map(n => new Promise(res => {
    const im = new Image(); im.onload = () => { IMG[n] = im; res(); }; im.onerror = () => res(); im.src = A[n];
  })));
}

function boot() {
  loadSave(); bindUI(); updateSoundBtn(); resize();
  window.addEventListener('resize', resize);
  $('logo').src = (window.AERO_ASSETS || {}).logo_text || '';
  document.querySelectorAll('img[data-sprite]').forEach(im => { im.src = (window.AERO_ASSETS || {})[im.dataset.sprite] || ''; });
  const fontReady = (document.fonts && document.fonts.load) ? Promise.race([document.fonts.load('20px "Patrick Hand"'), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
  Promise.all([loadImages(), fontReady]).then(() => {
    resetWorld(); G.state = 'title'; G.skyFade = 1; updateTitle(); show(save.seenHow ? 'title' : 'how');
    requestAnimationFrame(frame);
  });
}
window.AeroGame = { G, save, Snd, startRun, goTitle, STAGES, stageOf, _update: dt => update(dt) };
boot();
})();
