// D.A.N.C.E. — 15s motion piece. Every pixel is drawn here. 1920x1080 @ 30fps, 120 BPM (1 beat = 15 frames).
// usage: node motion.mjs stills <outDir> f1 f2 ...   |   node motion.mjs video <ffmpeg> <wav> <out.mp4>
import { createCanvas, GlobalFonts } from '@napi-rs/canvas';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FD = path.join(HERE, 'fonts');
GlobalFonts.registerFromPath(path.join(FD, 'ArchivoXItalic900.ttf'), 'AXI');
GlobalFonts.registerFromPath(path.join(FD, 'ArchivoX800.ttf'), 'AX');
GlobalFonts.registerFromPath(path.join(FD, 'Archivo600.ttf'), 'A6');
GlobalFonts.registerFromPath(path.join(FD, 'JetBrainsMono500.ttf'), 'JB');

const W = 1920, H = 1080, FPS = 30, NF = 450, FPB = 15;
const INK = '#0A0B10', PAPER = '#F2F4F8', CORAL = '#FF5E5B', BLUE = '#4DB8F2', LILAC = '#B39BFF', MUTED = 'rgba(242,244,248,0.55)';
const CORAL_RGB = [255, 94, 91], BLUE_RGB = [77, 184, 242], PAPER_RGB = [242, 244, 248];

// ---------- math ----------
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const inv = (a, b, x) => clamp((x - a) / (b - a));
const E = {
  lin: x => x,
  outCubic: x => 1 - Math.pow(1 - x, 3),
  inQuad: x => x * x,
  inOutCubic: x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2,
  outExpo: x => x >= 1 ? 1 : 1 - Math.pow(2, -10 * x),
  outBack: x => { const s = 1.7; return 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); },
};
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const mix = (c1, c2, t) => c1.map((v, i) => Math.round(lerp(v, c2[i], t)));
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

// ---------- skeleton / poses ----------
const D2R = Math.PI / 180;
const BASE = { x: 0, lift: 0, a: 90, h: 90, tw: 0, lu: -100, lf: -95, ru: -80, rf: -85, lt: -96, ls: -92, rt: -84, rs: -88, zl: 0, zr: 0, zlt: 0, zrt: 0 };
const P = {
  stand: {},
  point: { a: 82, h: 72, tw: -0.35, lu: -130, lf: -112, ru: 40, rf: 52, lt: -100, ls: -95, rt: -40, rs: -105, zr: 0.4, zrt: 0.5 },
  wide: { a: 97, h: 102, tw: 0.25, lu: 165, lf: 140, ru: -35, rf: -72, lt: -128, ls: -100, rt: -52, rs: -80, zl: -0.3, zr: 0.4 },
  vup: { a: 90, h: 90, lu: 150, lf: 95, ru: 30, rf: 85, lt: -93, ls: -90, rt: -78, rs: -96 },
  crouch: { a: 86, h: 78, tw: 0.2, lu: -140, lf: -118, ru: -40, rf: -62, lt: -125, ls: -72, rt: -55, rs: -108, zl: -0.6, zr: -0.6 },
  nat: { a: 95, h: 84, tw: 0.3, lu: 170, lf: 122, ru: 12, rf: 55, lt: -100, ls: -91, rt: -18, rs: -98, zrt: 0.6 },
  natFix: { a: 95, h: 84, tw: 0.3, lu: 170, lf: 122, ru: 24, rf: 102, lt: -100, ls: -91, rt: -18, rs: -98, zrt: 0.6 },
  leap: { a: 80, h: 86, tw: 0.55, lu: 165, lf: 172, ru: 22, rf: 12, lt: -160, ls: -172, rt: -18, rs: -6, zl: 0.5, zr: -0.5, zlt: -0.6, zrt: 0.6, lift: 0.95 },
};
for (const k in P) P[k] = { ...BASE, ...P[k] };
function M(p) { // mirror left/right
  const r = (a) => 180 - a;
  return { ...p, x: -p.x, a: r(p.a), h: r(p.h), tw: -p.tw, lu: r(p.ru), lf: r(p.rf), ru: r(p.lu), rf: r(p.lf), lt: r(p.rt), ls: r(p.rs), rt: r(p.lt), rs: r(p.ls), zl: p.zr, zr: p.zl, zlt: p.zrt, zrt: p.zlt };
}
const W_ = (p, o) => ({ ...p, ...o });
const KEYS = [
  [4, P.stand, .5, E.outCubic],
  [5, P.point, .35, E.outBack], [6, P.wide, .35, E.outBack], [7, P.vup, .35, E.outBack],
  [8, M(P.point), .35, E.outBack], [9, M(P.wide), .35, E.outBack], [10, P.crouch, .35, E.outBack], [11, P.vup, .35, E.outBack],
  [12, P.nat, .5, E.outCubic], [14, P.natFix, .5, E.inOutCubic],
  [16, W_(P.crouch, { x: -0.7 }), .45, E.inOutCubic], [16.5, P.leap, .5, E.outCubic], [17, W_(P.wide, { x: 0.7 }), .5, E.inQuad],
  [18, P.point, .32, E.outBack], [18.5, M(P.wide), .32, E.outBack], [19, P.vup, .32, E.outBack], [19.5, M(P.point), .32, E.outBack],
  [20, P.wide, .32, E.outBack], [20.5, P.crouch, .32, E.outBack], [22.3, P.vup, .3, E.outCubic],
];
function poseAt(tau) {
  if (tau <= KEYS[0][0]) return KEYS[0][1];
  let i = 0; while (i + 1 < KEYS.length && KEYS[i + 1][0] <= tau) i++;
  const [t0, to, dur, ease] = KEYS[i];
  const from = i > 0 ? KEYS[i - 1][1] : to;
  const u = ease(clamp((tau - t0) / dur));
  const o = {}; for (const k in to) o[k] = lerp(from[k], to[k], u);
  return o;
}
const dir = (a, zf = 0) => { const x = Math.cos(a * D2R), y = Math.sin(a * D2R), l = Math.hypot(x, y, zf); return [x / l, y / l, zf / l]; };
const add = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s];
function fk(p) {
  const pel = [p.x, 0, 0];
  const td = dir(p.a);
  const chest = add(pel, td, .30), neck = add(chest, td, .24), head = add(neck, dir(p.h), .2);
  const ra = (p.a - 90) * D2R;
  const r = [Math.cos(ra) * Math.cos(p.tw), Math.sin(ra) * Math.cos(p.tw), -Math.sin(p.tw)];
  const lsh = add(add(neck, r, -.19), [0, -1, 0], .03), rsh = add(add(neck, r, .19), [0, -1, 0], .03);
  const lel = add(lsh, dir(p.lu, p.zl), .29), lwr = add(lel, dir(p.lf, p.zl), .27);
  const rel = add(rsh, dir(p.ru, p.zr), .29), rwr = add(rel, dir(p.rf, p.zr), .27);
  const hr = [Math.cos(p.tw * .5), 0, -Math.sin(p.tw * .5)];
  const lhip = add(pel, hr, -.11), rhip = add(pel, hr, .11);
  const lkn = add(lhip, dir(p.lt, p.zlt), .43), lan = add(lkn, dir(p.ls, p.zlt), .43);
  const rkn = add(rhip, dir(p.rt, p.zrt), .43), ran = add(rkn, dir(p.rs, p.zrt), .43);
  const J = [head, neck, chest, pel, lsh, lel, lwr, rsh, rel, rwr, lhip, lkn, lan, rhip, rkn, ran];
  const sh = -Math.min(lan[1], ran[1]) + .06 + p.lift;
  return J.map(q => [q[0], q[1] + sh, q[2]]);
}
const BONES = [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [5, 6], [1, 7], [7, 8], [8, 9], [3, 10], [10, 11], [11, 12], [3, 13], [13, 14], [14, 15]];
const JNAME = ['HEAD', 'NECK', 'CHEST', 'PELVIS', 'L_SHLDR', 'L_ELBOW', 'L_WRIST', 'R_SHLDR', 'R_ELBOW', 'R_WRIST', 'L_HIP', 'L_KNEE', 'L_ANKLE', 'R_HIP', 'R_KNEE', 'R_ANKLE'];

// dancer time: the leap freezes at its apex while real time keeps running
const tauOf = b => b < 17 ? b : b < 20.5 ? 17 : b - 3.5;

// ---------- camera ----------
function proj(c, p) {
  const dx = p[0] - c.tx, dy = p[1] - c.ty, dz = p[2] - c.tz;
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const x1 = dx * cy - dz * sy, z1 = dx * sy + dz * cy;
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const y2 = dy * cp - z1 * sp, z2 = dy * sp + z1 * cp;
  const depth = c.R - z2, s = c.f / depth;
  return [c.cx + x1 * s, c.cy - y2 * s, depth, s];
}

// ---------- static assets ----------
const R0 = rng(7);
const PARTS = Array.from({ length: 460 }, () => ({ p: [lerp(-4, 4, R0()), lerp(0.05, 3.4, R0()), lerp(-3.6, 2.6, R0())], ph: R0() * 6.28, k: R0() < .18 ? 1 : 0, c: R0() }));
const grains = Array.from({ length: 4 }, (_, i) => {
  const g = createCanvas(960, 540), x = g.getContext('2d'), im = x.createImageData(960, 540), r = rng(100 + i);
  for (let j = 0; j < im.data.length; j += 4) { const v = r() * 255; im.data[j] = im.data[j + 1] = im.data[j + 2] = v; im.data[j + 3] = 255; }
  x.putImageData(im, 0, 0); return g;
});
const vignette = (() => {
  const v = createCanvas(W, H), x = v.getContext('2d');
  const g = x.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.62)');
  x.fillStyle = g; x.fillRect(0, 0, W, H); return v;
})();

// ---------- drawing helpers ----------
function mono(ctx, txt, x, y, px = 22, col = MUTED, align = 'left') { ctx.font = `${px}px JB`; ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(txt, x, y); }
function ghostText(ctx, txt, x, y, px, off, { font = 'AXI', fill = PAPER, align = 'center', base = 'middle', stroke = true, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.font = `${px}px ${font}`; ctx.textAlign = align; ctx.textBaseline = base;
  if (stroke && off > 0.3) {
    ctx.lineWidth = Math.max(2, px * 0.012); ctx.lineJoin = 'round';
    ctx.strokeStyle = CORAL; ctx.strokeText(txt, x - off, y + off * .55);
    ctx.strokeStyle = BLUE; ctx.strokeText(txt, x + off, y - off * .55);
  }
  ctx.fillStyle = fill; ctx.fillText(txt, x, y);
  ctx.restore();
}
const tc = f => `00:00:${String(Math.floor(f / FPS)).padStart(2, '0')}:${String(f % FPS).padStart(2, '0')}`;
function segBar(ctx, cx, y, n, prog, w = 520, col = BLUE) {
  const gap = 8, sw = (w - gap * (n - 1)) / n;
  for (let i = 0; i < n; i++) {
    const x = cx - w / 2 + i * (sw + gap);
    ctx.fillStyle = 'rgba(242,244,248,0.16)'; ctx.fillRect(x, y, sw, 5);
    const fpart = clamp(prog - i); if (fpart > 0) { ctx.fillStyle = col; ctx.fillRect(x, y, sw * fpart, 5); }
  }
}

function drawGrid(ctx, c, alpha) {
  if (alpha <= 0.002) return;
  ctx.save(); ctx.lineWidth = 1.2;
  const seg = (a, b) => {
    const N = 14;
    for (let i = 0; i < N; i++) {
      const p = [lerp(a[0], b[0], i / N), 0, lerp(a[2], b[2], i / N)], q = [lerp(a[0], b[0], (i + 1) / N), 0, lerp(a[2], b[2], (i + 1) / N)];
      const A = proj(c, p), B = proj(c, q);
      if (A[2] < .5 || B[2] < .5) continue;
      const dist = Math.hypot(p[0] - c.tx, p[2] - c.tz);
      const al = alpha * clamp(1 - dist / 4.6) * .55;
      if (al < .01) continue;
      ctx.strokeStyle = `rgba(150,170,210,${al})`;
      ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke();
    }
  };
  for (let x = -4; x <= 4.001; x += .5) seg([x, 0, -4], [x, 0, 3]);
  for (let z = -4; z <= 3.001; z += .5) seg([-4, 0, z], [4, 0, z]);
  ctx.restore();
}
function drawParticles(ctx, c, t, frozen, alpha) {
  ctx.save();
  for (const q of PARTS) {
    const p = frozen ? q.p : [q.p[0] + .05 * Math.sin(t * .7 + q.ph), q.p[1] + .07 * Math.sin(t * .9 + q.ph * 2), q.p[2]];
    const A = proj(c, p); if (A[2] < .4) continue;
    const a = alpha * clamp(1.3 - A[2] / 7) * (q.k ? .9 : .5);
    if (a < .02) continue;
    const col = q.c < .33 ? CORAL_RGB : q.c < .66 ? BLUE_RGB : PAPER_RGB;
    ctx.fillStyle = rgba(col, a); ctx.strokeStyle = rgba(col, a);
    const s = clamp(A[3] / 300, .4, 6);
    if (q.k) { ctx.lineWidth = 1.5; const r = 5 * s; ctx.beginPath(); ctx.moveTo(A[0] - r, A[1]); ctx.lineTo(A[0] + r, A[1]); ctx.moveTo(A[0], A[1] - r); ctx.lineTo(A[0], A[1] + r); ctx.stroke(); }
    else { ctx.beginPath(); ctx.arc(A[0], A[1], 1.8 * s, 0, 6.283); ctx.fill(); }
  }
  ctx.restore();
}
function drawSkel(ctx, c, J, st = {}) {
  const { col = PAPER, lw = 5, alpha = 1, glow = 0, dots = true, dotR = 7, reveal = null, blend = null, head = true } = st;
  const S = J.map(p => proj(c, p));
  ctx.save(); ctx.globalAlpha = alpha; if (blend) ctx.globalCompositeOperation = blend;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = col; ctx.fillStyle = col;
  if (glow) { ctx.shadowColor = col; ctx.shadowBlur = glow; }
  const k = S[3][3] / 300; // scale relative to front view
  ctx.lineWidth = lw * clamp(k, .5, 3);
  BONES.forEach(([a, b], i) => {
    if (a === 0 && b === 1 && head) return; // neck drawn to head circle edge below
    let f = reveal ? clamp(reveal.bone(i)) : 1; if (f <= 0) return;
    const A = S[a], B = S[b];
    ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(lerp(A[0], B[0], f), lerp(A[1], B[1], f)); ctx.stroke();
  });
  if (head) {
    const hr = .1 * S[0][3]; const hv = reveal ? clamp(reveal.joint(0)) : 1;
    if (hv > 0) {
      const N = S[1], Hh = S[0]; const dx = Hh[0] - N[0], dy = Hh[1] - N[1], l = Math.hypot(dx, dy) || 1;
      ctx.beginPath(); ctx.moveTo(N[0], N[1]); ctx.lineTo(Hh[0] - dx / l * hr, Hh[1] - dy / l * hr); ctx.stroke();
      ctx.beginPath(); ctx.arc(Hh[0], Hh[1], hr * hv, 0, 6.283); ctx.stroke();
    }
  }
  if (dots) {
    ctx.shadowBlur = 0;
    S.forEach((s, i) => {
      if (i === 0) return;
      const v = reveal ? clamp(reveal.joint(i)) : 1; if (v <= 0) return;
      const r = dotR * clamp(k, .5, 3) * (v < 1 ? E.outBack(v) : 1);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 6.283); ctx.fill();
      ctx.lineWidth = 2.5 * clamp(k, .5, 3); ctx.strokeStyle = col; ctx.stroke();
    });
  }
  ctx.restore();
  return S;
}

// ---------- scene: the capture stage (reused by full frame and the 4 camera panels) ----------
function stage(ctx, c, b, t, o = {}) {
  const tau = tauOf(b);
  const frozen = b >= 17 && b < 20.5;
  drawGrid(ctx, c, o.grid ?? 1);
  drawParticles(ctx, c, t, frozen, o.parts ?? .8);
  const J = fk(poseAt(tau));
  if (o.ghosts !== false && !frozen) {
    drawSkel(ctx, c, fk(poseAt(tau - .22)), { col: BLUE, lw: 3.5, alpha: .55, dots: false, blend: 'lighter' });
    drawSkel(ctx, c, fk(poseAt(tau - .11)), { col: CORAL, lw: 3.5, alpha: .6, dots: false, blend: 'lighter' });
  }
  if (o.target) drawSkel(ctx, c, fk(o.target), { col: CORAL, lw: 6, alpha: o.targetA ?? .6, dots: false, glow: 26, blend: 'lighter' });
  return drawSkel(ctx, c, J, { lw: 5, glow: o.glow ?? 14, reveal: o.reveal });
}
function baseCam(b, extra = {}) {
  return { yaw: .14 * Math.sin(b * .45), pitch: .07, R: 4.6, tx: 0, ty: 1.0, tz: 0, f: 1850, cx: 960, cy: 585, ...extra };
}
function pulseAt(b) {
  const on = (b >= 4 && b < 12) || (b >= 16 && b < 17) || (b >= 21 && b < 26) || (b >= 12 && b < 16 && Math.floor(b) % 2 === 0);
  return on ? Math.exp(-(b - Math.floor(b)) * 9) : 0;
}

// ---------- logo geometry (from favicon.svg, tile coords) ----------
const bez = (p0, p1, p2, p3, u) => { const v = 1 - u; return [v * v * v * p0[0] + 3 * v * v * u * p1[0] + 3 * v * u * u * p2[0] + u * u * u * p3[0], v * v * v * p0[1] + 3 * v * v * u * p1[1] + 3 * v * u * u * p2[1] + u * u * u * p3[1]]; };
const LK = 1.45, LCX = 960, LCY = 420, L0 = [206, 202];
const L2S = p => [LCX + (p[0] - L0[0]) * LK, LCY + (p[1] - L0[1]) * LK];
function logoU(n) { const pts = []; for (let i = 0; i < n; i++) { const u = i / (n - 1) * 2; pts.push(L2S(u <= 1 ? bez([104, 52], [104, 132], [137, 165], [183, 165], u) : bez([183, 165], [229, 165], [263, 132], [264, 52], u - 1))); } return pts; }
function logoBody(n) { const pts = []; for (let i = 0; i < n; i++) pts.push(L2S(bez([105, 352], [137, 227], [197, 177], [309, 153], i / (n - 1)))); return pts; }
function resample(poly, n) {
  const L = [0]; for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const out = []; let j = 0;
  for (let i = 0; i < n; i++) { const d = L[L.length - 1] * i / (n - 1); while (j < L.length - 2 && L[j + 1] < d) j++; const u = (d - L[j]) / ((L[j + 1] - L[j]) || 1); out.push([lerp(poly[j][0], poly[j + 1][0], u), lerp(poly[j][1], poly[j + 1][1], u)]); }
  return out;
}
function strokePoly(ctx, pts) { ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.stroke(); }

// ---------- HUD ----------
function hud(ctx, f, b, o = {}) {
  ctx.save();
  mono(ctx, 'D.A.N.C.E.  /  MOTION CAPTURE', 72, 86, 22, PAPER);
  const rec = Math.floor(f / 15) % 2 === 0;
  ctx.fillStyle = rec ? CORAL : 'rgba(255,94,91,0.25)'; ctx.beginPath(); ctx.arc(80, 118, 7, 0, 6.283); ctx.fill();
  mono(ctx, 'REC', 96, 125, 20, MUTED);
  mono(ctx, o.right || '', W - 72, 86, 22, PAPER, 'right');
  mono(ctx, tc(f), 72, H - 70, 22, MUTED);
  mono(ctx, '120 BPM  ·  BEAT ' + String(Math.floor(b) + 1).padStart(2, '0'), 72, H - 104, 20, 'rgba(242,244,248,0.35)');
  if (o.acc != null) { mono(ctx, 'ACCURACY', W - 72, H - 104, 20, 'rgba(242,244,248,0.35)', 'right'); mono(ctx, `${Math.round(o.acc)}%`, W - 72, H - 70, 22, PAPER, 'right'); }
  // corner ticks
  ctx.strokeStyle = 'rgba(242,244,248,0.35)'; ctx.lineWidth = 2;
  for (const [x, y, sx, sy] of [[40, 40, 1, 1], [W - 40, 40, -1, 1], [40, H - 40, 1, -1], [W - 40, H - 40, -1, -1]]) { ctx.beginPath(); ctx.moveTo(x, y + 26 * sy); ctx.lineTo(x, y); ctx.lineTo(x + 26 * sx, y); ctx.stroke(); }
  ctx.restore();
}
function trackBoxes(ctx, S, f, which, alpha = 1) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = 'rgba(242,244,248,0.7)'; ctx.lineWidth = 1.5;
  const r = rng(f * 13 + 5);
  for (const i of which) {
    const [x, y] = S[i]; const s = 22;
    ctx.strokeRect(x - s, y - s, s * 2, s * 2);
    ctx.fillStyle = 'rgba(242,244,248,0.75)'; ctx.font = '15px JB'; ctx.textAlign = 'left';
    ctx.fillText(JNAME[i], x + s + 8, y - 6);
    ctx.fillStyle = 'rgba(242,244,248,0.4)';
    ctx.fillText(`${(x / 1000).toFixed(3)} ${(1 - y / 1000).toFixed(3)} ${(r() * .2).toFixed(2)}`, x + s + 8, y + 12);
  }
  ctx.restore();
}

// ---------- the frame ----------
function frame(ctx, f) {
  const t = f / FPS, b = f / FPB;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = INK; ctx.fillRect(0, 0, W, H);
  const pulse = pulseAt(b);
  const shake = rng(f * 31 + 1); const sk = pulse * (b >= 21 && b < 21.6 ? 26 : 7);
  ctx.translate((shake() - .5) * sk, (shake() - .5) * sk);

  if (b < 4) countIn(ctx, f, b);
  else if (b < 12) dance(ctx, f, b, t);
  else if (b < 16) correction(ctx, f, b, t);
  else if (b < 21) leap(ctx, f, b, t);
  else if (b < 24) panels(ctx, f, b, t);
  else if (b < 26) acronym(ctx, f, b);
  else ending(ctx, f, b, t);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // flashes on section hits
  const fl = Math.max(flash(b, 4, .9), flash(b, 17, .45), flash(b, 21, .7), flash(b, 26, .35));
  if (fl > 0) { ctx.fillStyle = `rgba(242,244,248,${fl})`; ctx.fillRect(0, 0, W, H); }
  // finish: vignette + grain
  ctx.globalAlpha = 1; ctx.drawImage(vignette, 0, 0);
  ctx.globalAlpha = .055; ctx.drawImage(grains[f % 4], -(f * 37 % 40), -(f * 53 % 40), W + 80, H + 80);
  ctx.globalAlpha = 1;
  // loop: rise out of ink at the start, dissolve back into ink at the end
  const fi = 1 - inv(0, .7, b); if (fi > 0) { ctx.fillStyle = `rgba(10,11,16,${E.inOutCubic(fi)})`; ctx.fillRect(0, 0, W, H); }
  const fo = inv(28.4, 30, b); if (fo > 0) { ctx.fillStyle = `rgba(10,11,16,${E.inOutCubic(fo)})`; ctx.fillRect(0, 0, W, H); }
}
const flash = (b, at, peak) => b >= at && b < at + .2 ? peak * (1 - (b - at) / .2) : 0;

// ---- 0:00–2:00  5 6 7 8 ----
function countIn(ctx, f, b) {
  const k = Math.floor(b), lt = b - k;
  const n = '5678'[k];
  let s = 1 + .32 * Math.exp(-lt * 7);
  const off = 90 * Math.exp(-lt * 5.5);
  let alpha = 1;
  if (k === 3 && lt > .55) { const z = inv(.55, 1, lt); s *= 1 + Math.pow(z, 3.2) * 38; alpha = 1 - inv(.85, 1, lt); }
  // faint previous numbers drift as ghosts
  for (let j = 0; j < k; j++) ghostText(ctx, '5678'[j], 960 + (j - k) * 360, 540, 260, 0, { fill: 'rgba(242,244,248,0.06)', stroke: false });
  ghostText(ctx, n, 960, 548, 640 * s, off, { alpha });
  mono(ctx, 'COUNT IN', 72, 86, 22, PAPER);
  mono(ctx, tc(f), 72, H - 70, 22, MUTED);
  mono(ctx, '120 BPM  ·  4/4', W - 72, 86, 22, MUTED, 'right');
  mono(ctx, 'GHOSTS CONVERGE = ALIGNED', W - 72, H - 70, 18, 'rgba(242,244,248,0.35)', 'right');
  segBar(ctx, 960, H - 120, 4, k + E.outCubic(clamp(lt * 3)), 420);
}

// ---- 2:00–6:00  the dancer assembles and grooves ----
function dance(ctx, f, b, t) {
  const word = b < 8 ? 'LEARN' : 'PRACTISE';
  ctx.save(); ctx.font = '420px AXI'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(242,244,248,0.07)';
  const ww = ctx.measureText(word + '  ').width; const sx = -((b - 4) * 80 % ww);
  for (let x = sx; x < W; x += ww) ctx.strokeText(word, x, 560);
  ctx.restore();
  const c = baseCam(b);
  const rv = (b - 4) * FPB; // frames since drop
  const reveal = { joint: i => (rv - i * .45) / 3, bone: i => (rv - 7 - i * .3) / 4 };
  const S = stage(ctx, c, b, t, { grid: inv(4, 4.6, b), parts: .8 * inv(4, 5, b), reveal, ghosts: b > 4.6, glow: 14 + 26 * pulseAt(b) });
  if (b > 4.8) trackBoxes(ctx, S, f, [6, 9, 12, 15], inv(4.8, 5.1, b));
  const seqTxt = b < 8 ? 'LEARN  ·  SEQ 01/05  ·  0.5×' : 'PRACTISE  ·  SEQ 02/05  ·  1.0×';
  hud(ctx, f, b, { right: seqTxt, acc: 78 + 6 * Math.sin(b * 1.7) + (b - 4) });
  segBar(ctx, 960, H - 84, 5, (b - 4) / 8 * 2, 520);
}

// ---- 6:00–8:00  real-time correction: the arm rises into the coral target ----
function correction(ctx, f, b, t) {
  const zin = E.inOutCubic(inv(12, 13.1, b)), zout = E.inOutCubic(inv(15.1, 16, b)), z = zin * (1 - zout);
  const J = fk(poseAt(b));
  const wr = J[9];
  const c = baseCam(b, { tx: lerp(0, wr[0] * .75, z), ty: lerp(1.0, wr[1] - .1, z), R: lerp(4.6, 2.3, z), yaw: lerp(.14 * Math.sin(b * .45), -.25, z) });
  const fixed = b >= 14.25;
  const S = stage(ctx, c, b, t, { target: P.natFix, targetA: .85 * (1 - inv(14.3, 14.6, b)) + .15, ghosts: false });
  if (b < 14.3) { const T = proj(c, fk(P.natFix)[9]); ctx.save(); ctx.globalAlpha = inv(12.6, 13, b) * (1 - inv(14, 14.3, b)); mono(ctx, 'STANDARD', T[0] - 20, T[1] - 30, 18, CORAL, 'right'); ctx.restore(); }
  // correction ring on R_WRIST
  const [x, y] = S[9];
  const ringOn = inv(12.5, 12.9, b);
  if (ringOn > 0) {
    const col = fixed ? BLUE : CORAL;
    const r = 58 + (fixed ? 0 : 6 * Math.sin(b * 12));
    ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 24;
    ctx.beginPath(); ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + 6.283 * E.outCubic(ringOn)); ctx.stroke();
    if (fixed) { const ck = E.outCubic(inv(14.3, 14.7, b)); ctx.lineWidth = 6; ctx.beginPath(); const p0 = [x - 20, y + 2], p1 = [x - 5, y + 18], p2 = [x + 24, y - 16]; ctx.moveTo(...p0); if (ck < .4) ctx.lineTo(lerp(p0[0], p1[0], ck / .4), lerp(p0[1], p1[1], ck / .4)); else { ctx.lineTo(...p1); ctx.lineTo(lerp(p1[0], p2[0], (ck - .4) / .6), lerp(p1[1], p2[1], (ck - .4) / .6)); } ctx.stroke(); }
    ctx.shadowBlur = 0;
    // leader + label
    const lx = x + 120, ly = y - 110;
    ctx.globalAlpha = ringOn; ctx.lineWidth = 2; ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(x + r * .7, y - r * .7); ctx.lineTo(lx, ly); ctx.lineTo(lx + 40, ly); ctx.stroke();
    ctx.fillStyle = 'rgba(10,11,16,0.85)'; ctx.fillRect(lx + 48, ly - 34, 300, 68); ctx.strokeRect(lx + 48, ly - 34, 300, 68);
    mono(ctx, 'R_WRIST', lx + 64, ly - 6, 20, PAPER);
    const err = fixed ? 0 : Math.round(-18 * (1 - inv(14, 14.3, b)));
    mono(ctx, fixed ? 'Δ 0°   ALIGNED' : `Δ ${err}°   OFF TARGET`, lx + 64, ly + 22, 18, col);
    ctx.restore();
  }
  // tip, typed like the app's feedback toast
  const tip = 'Raise your right hand a bit higher';
  const nch = Math.floor(tip.length * inv(12.7, 13.6, b));
  ctx.save();
  if (!fixed && nch > 0) {
    ctx.font = '46px A6'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const wTip = ctx.measureText(tip).width + 80;
    ctx.fillStyle = CORAL; ctx.fillRect(960 - wTip / 2, H - 190, wTip, 92);
    ctx.fillStyle = PAPER; ctx.fillText(tip.slice(0, nch), 960, H - 144);
  } else if (fixed) {
    const a = inv(14.25, 14.5, b) * (1 - inv(15.6, 16, b));
    ghostText(ctx, 'Aligned.', W - 72, H - 170, 104, 30 * (1 - inv(14.25, 14.8, b)), { alpha: a, fill: PAPER, align: 'right' });
  }
  ctx.restore();
  const acc = fixed ? lerp(76, 96, E.outCubic(inv(14.25, 14.9, b))) : 76;
  ctx.save(); ctx.font = '150px AX'; ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = fixed ? BLUE : CORAL; ctx.globalAlpha = inv(12.4, 12.8, b);
  ctx.fillText(`${Math.round(acc)}%`, W - 72, 250); ctx.restore();
  mono(ctx, fixed ? 'MATCHES STANDARD' : 'VS STANDARD', W - 72, 290, 18, fixed ? BLUE : CORAL, 'right');
  hud(ctx, f, b, { right: 'REAL-TIME FEEDBACK' });
}

// ---- 8:00–10:30  the leap: freeze at the apex, camera orbits through the chronophotograph ----
function leap(ctx, f, b, t) {
  const frozen = b >= 17 && b < 20.5;
  const orb = E.inOutCubic(inv(17.15, 20.4, b));
  const yaw = -orb * Math.PI * 2;
  const bell = Math.sin(orb * Math.PI);
  const pel = fk(poseAt(tauOf(b)))[3];
  const c = baseCam(b, { yaw: b < 17 ? .14 * Math.sin(b * .45) * (1 - inv(16, 17, b)) : yaw, pitch: .07 + .3 * bell, R: 5.0 - .7 * bell, tx: pel[0] * .5, ty: 1.1 + .25 * bell });
  drawGrid(ctx, c, 1);
  drawParticles(ctx, c, t, frozen, .8 + .6 * bell);
  // arc of the pelvis through the jump
  if (b >= 16.5) {
    ctx.save(); ctx.setLineDash([3, 12]); ctx.lineWidth = 3; ctx.strokeStyle = LILAC; ctx.globalAlpha = .8;
    ctx.beginPath(); const tEnd = Math.min(tauOf(b), 17.45);
    for (let u = 16.5, i = 0; u <= tEnd + 1e-6; u += .02, i++) { const q = proj(c, fk(poseAt(u))[3]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
    ctx.stroke(); ctx.restore();
  }
  // chronophotograph: 14 exposures of the take-off, revealed as time stops
  if (b >= 17) {
    const n = 14;
    for (let i = 0; i < n; i++) {
      const vis = inv(17 + i * .07, 17.25 + i * .07, b) * (1 - inv(20.35, 20.6, b));
      if (vis <= 0) continue;
      const u = i / (n - 1);
      const col = mix(BLUE_RGB, CORAL_RGB, u);
      drawSkel(ctx, c, fk(poseAt(16.0 + u * .98)), { col: rgba(col, 1), lw: 3, alpha: vis * (.25 + .55 * u), dots: true, dotR: 4, blend: 'lighter' });
    }
  }
  // motion blur on the way up
  if (!frozen && b >= 16.5) for (let k = 3; k >= 1; k--) drawSkel(ctx, c, fk(poseAt(tauOf(b - k / 45))), { alpha: .12 * (4 - k), dots: false, lw: 5 });
  if (b < 17) {
    drawSkel(ctx, c, fk(poseAt(tauOf(b) - .2)), { col: BLUE, lw: 3.5, alpha: .5, dots: false, blend: 'lighter' });
    drawSkel(ctx, c, fk(poseAt(tauOf(b) - .1)), { col: CORAL, lw: 3.5, alpha: .55, dots: false, blend: 'lighter' });
  }
  const S = drawSkel(ctx, c, fk(poseAt(tauOf(b))), { lw: 5.5, glow: frozen ? 30 : 16 });
  // letterbox + freeze HUD
  const lb = E.outCubic(inv(17, 17.35, b)) * (1 - E.inOutCubic(inv(20.35, 20.75, b)));
  if (lb > 0) {
    ctx.fillStyle = '#000'; ctx.fillRect(-40, -40, W + 80, 40 + 118 * lb); ctx.fillRect(-40, H - 118 * lb, W + 80, 158);
    ctx.save(); ctx.globalAlpha = lb;
    mono(ctx, 'TIME  ×0.00', 960, 70, 24, PAPER, 'center');
    mono(ctx, 'DANCE GHOST  ·  14 EXPOSURES', 72, H - 50, 20, MUTED);
    mono(ctx, `YAW ${String(Math.round(-yaw / D2R)).padStart(3, '0')}°`, W - 72, H - 50, 20, MUTED, 'right');
    ctx.restore();
  }
  if (frozen) trackBoxes(ctx, S, 1, [6, 9, 12, 15], .7 * lb);
  if (!frozen) hud(ctx, f, b, { right: b < 17 ? 'PRACTISE  ·  SEQ 03/05' : 'LANDING', acc: 88 });
  // the line that sells it
  if (frozen) {
    const a = inv(18.2, 18.6, b) * (1 - inv(19.9, 20.3, b));
    ghostText(ctx, 'Every frame,', 110, 790, 104, 24 * (1 - inv(18.2, 18.9, b)), { alpha: a, align: 'left' });
    const a2 = inv(18.7, 19.1, b) * (1 - inv(19.9, 20.3, b));
    ghostText(ctx, 'every joint.', 110, 900, 104, 24 * (1 - inv(18.7, 19.4, b)), { alpha: a2, fill: BLUE, align: 'left' });
  }
}

// ---- 10:30–12:00  landing → four synchronized cameras ----
function panels(ctx, f, b, t) {
  if (b < 21.5) {
    const pel = fk(poseAt(tauOf(b)))[3];
    const c = baseCam(b, { tx: pel[0] * .8 });
    const S = stage(ctx, c, b, t, { glow: 30 });
    hud(ctx, f, b, { right: 'LANDED  ·  1.0×', acc: 91 });
    return;
  }
  const cams = [['CAM A', 'FRONT', 0], ['CAM B', 'SIDE L', Math.PI / 2], ['CAM C', 'BACK', Math.PI], ['CAM D', 'SIDE R', -Math.PI / 2]];
  const active = Math.floor((b - 21.5) * 2) % 4;
  const open = E.outExpo(inv(21.5, 21.8, b));
  cams.forEach(([name, view, yaw], i) => {
    const px = (i % 2) * 960, py = Math.floor(i / 2) * 540;
    ctx.save();
    ctx.beginPath(); ctx.rect(px + 4, py + 4, 952, 532); ctx.clip();
    ctx.translate(px, py); ctx.scale(.5, .5);
    const pel = fk(poseAt(tauOf(b)))[3];
    const c = baseCam(b, { yaw: yaw + .2 * Math.sin(b * .8 + i), pitch: .1, R: 4.4, tx: pel[0], ty: 1.0 });
    stage(ctx, c, b, t, { glow: 12, ghosts: true });
    ctx.restore();
    ctx.save(); ctx.translate(px, py);
    mono(ctx, `${name}  ·  ${view}`, 34, 50, 22, i === active ? PAPER : MUTED);
    mono(ctx, tc(f), 926, 50, 20, MUTED, 'right');
    if (i === active) { ctx.strokeStyle = BLUE; ctx.lineWidth = 6; ctx.strokeRect(7, 7, 946, 526); }
    ctx.restore();
  });
  ctx.fillStyle = INK; ctx.fillRect(956, 0, 8, H); ctx.fillRect(0, 536, W, 8);
  if (open < 1) { ctx.fillStyle = INK; const g = (1 - open) * 540; ctx.fillRect(0, 0, W, g); ctx.fillRect(0, H - g, W, g); }
  mono(ctx, '4 CAMERAS  ·  1 DANCER  ·  SYNCED', 960, H / 2 + 8, 20, PAPER, 'center');
}

// ---- 12:00–13:00  D.A.N.C.E. ----
function acronym(ctx, f, b) {
  const words = ['DANCE', 'AND', 'NUANCED', 'COACHING', 'EXPERT'];
  const bgs = [CORAL, INK, BLUE, PAPER, LILAC];
  const fgs = [INK, PAPER, INK, INK, INK];
  const i = clamp(Math.floor((b - 24) / .4), 0, 4), lt = (b - 24 - i * .4) / .4;
  ctx.fillStyle = bgs[i]; ctx.fillRect(-40, -40, W + 80, H + 80);
  const L = words[i][0];
  const slide = 1 - E.outExpo(clamp(lt * 1.6));
  ctx.save();
  ctx.font = '860px AXI'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  const lx = 120 + slide * 260, ly = 900;
  if (bgs[i] === INK) { ctx.lineWidth = 8; ctx.strokeStyle = CORAL; ctx.strokeText(L, lx - 14 * (1 + slide * 4), ly + 8); ctx.strokeStyle = BLUE; ctx.strokeText(L, lx + 14 * (1 + slide * 4), ly - 8); }
  ctx.fillStyle = fgs[i]; ctx.fillText(L, lx, ly);
  const lw = ctx.measureText(L).width;
  const word = words[i], nch = Math.max(1, Math.ceil(word.length * clamp(lt * 2.2)));
  ctx.font = '150px AX';
  const room = W - 120 - (120 + lw + 30), full = ctx.measureText(word).width;
  const wpx = Math.min(150, Math.floor(150 * room / full));
  ctx.font = `${wpx}px AX`;
  ctx.fillText(word.slice(0, nch), lx + lw + 30, 720);
  ctx.restore();
  // running line of the full name
  ctx.save(); ctx.font = '26px JB'; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
  let x = 140;
  words.forEach((w, j) => { ctx.fillStyle = j <= i ? fgs[i] : (fgs[i] === INK ? 'rgba(10,11,16,0.3)' : 'rgba(242,244,248,0.3)'); ctx.fillText(w, x, H - 80); x += ctx.measureText(w + '   ').width; });
  ctx.fillStyle = fgs[i]; ctx.textAlign = 'right'; ctx.fillText(`0${i + 1} / 05`, W - 140, H - 80);
  ctx.fillText('D.A.N.C.E.', W - 140, 110);
  ctx.restore();
}

// ---- 13:00–15:00  the skeleton becomes the logo ----
function ending(ctx, f, b, t) {
  // slow push-in so the end card keeps breathing while it dissolves
  const push = 1 + .045 * E.inOutCubic(inv(26.5, 30, b));
  ctx.translate(960, 540); ctx.scale(push, push); ctx.translate(-960, -540);
  const c = baseCam(b, { yaw: 0, pitch: .05, R: 4.0, ty: 1.05, cy: 560 });
  const m = E.inOutCubic(inv(26.45, 27.45, b));
  const J = fk(poseAt(tauOf(b)));
  const S = J.map(p => proj(c, p));
  drawGrid(ctx, c, .7 * (1 - m));
  drawParticles(ctx, c, t, false, .5 * (1 - m * .7));
  // the bones that don't belong to the mark fade away
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.globalAlpha = 1 - E.outCubic(clamp(m * 1.6));
  ctx.strokeStyle = PAPER; ctx.lineWidth = 5 * S[3][3] / 300;
  for (const [a, bb] of [[3, 13], [13, 14], [14, 15], [3, 10]]) { ctx.beginPath(); ctx.moveTo(S[a][0], S[a][1]); ctx.lineTo(S[bb][0], S[bb][1]); ctx.stroke(); }
  S.forEach((s, i) => { if (i === 0) return; ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(s[0], s[1], 8, 0, 6.283); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke(); });
  ctx.restore();
  // arms: wrist→elbow→shoulder→neck→shoulder→elbow→wrist  ⇒  the blue U
  const N = 48;
  const armsSk = resample([6, 5, 4, 1, 7, 8, 9].map(i => S[i]), N), armsLg = logoU(N);
  // body: ankle→knee→hip→pelvis→chest→neck  ⇒  the black curve (bottom-left to top-right)
  const bodySk = resample([12, 11, 10, 3, 2, 1].map(i => S[i]), N), bodyLg = logoBody(N);
  const mixP = (A, Bp) => A.map((p, i) => [lerp(p[0], Bp[i][0], m), lerp(p[1], Bp[i][1], m)]);
  const lw = lerp(5 * S[3][3] / 300, 30 * LK, m);
  ctx.save(); ctx.lineCap = m > .5 ? 'butt' : 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = lw;
  ctx.shadowBlur = 30 * (1 - m) + 10; ctx.shadowColor = rgba(mix(PAPER_RGB, BLUE_RGB, m), .8);
  ctx.strokeStyle = rgba(mix(PAPER_RGB, BLUE_RGB, m), 1); strokePoly(ctx, mixP(armsSk, armsLg));
  ctx.lineCap = 'round'; ctx.shadowColor = 'rgba(242,244,248,0.6)';
  ctx.strokeStyle = PAPER; strokePoly(ctx, mixP(bodySk, bodyLg));
  // head
  const hs = S[0], hl = L2S([186, 98]);
  ctx.fillStyle = PAPER; ctx.strokeStyle = PAPER; ctx.lineWidth = 5;
  const hr = lerp(.1 * hs[3], 25 * LK, m);
  ctx.beginPath(); ctx.arc(lerp(hs[0], hl[0], m), lerp(hs[1], hl[1], m), hr, 0, 6.283);
  if (m > .5) { ctx.globalAlpha = 1; ctx.fill(); } else ctx.stroke();
  ctx.restore();
  // wordmark
  const wa = E.inOutCubic(inv(27.2, 27.7, b));
  if (wa > 0) ghostText(ctx, 'D.A.N.C.E.', 960, 820, 150, 48 * (1 - E.outCubic(inv(27.2, 28.0, b))), { alpha: wa });
  const sa = E.inOutCubic(inv(27.6, 28.0, b));
  if (sa > 0) {
    const s1 = 'DANCE AND NUANCED COACHING EXPERT';
    ctx.save(); ctx.globalAlpha = sa; ctx.font = '26px JB'; ctx.fillStyle = PAPER; ctx.textAlign = 'center';
    const n = Math.ceil(s1.length * inv(27.6, 28.2, b));
    ctx.fillText(s1.slice(0, n).split('').join(' '), 960, 925); ctx.restore();
  }
  const ta = E.inOutCubic(inv(27.9, 28.3, b));
  if (ta > 0) { ctx.save(); ctx.globalAlpha = ta; mono(ctx, 'UX / UI CASE STUDY   ·   YUE WANG', 960, 975, 20, MUTED, 'center'); ctx.restore(); }
}

// ---------- run ----------
const mode = process.argv[2];
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
if (mode === 'stills') {
  const out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  for (const fs_ of process.argv.slice(4)) { const f = +fs_; frame(ctx, f); fs.writeFileSync(path.join(out, `f${String(f).padStart(3, '0')}.png`), await canvas.encode('png')); }
  console.log('stills done');
} else if (mode === 'video') {
  const [ff, wav, outMp4] = process.argv.slice(3);
  const args = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-', '-i', wav,
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '17', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', outMp4];
  const p = spawn(ff, args, { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let f = 0; f < NF; f++) {
    frame(ctx, f);
    const buf = await canvas.encode('png');
    if (!p.stdin.write(buf)) await new Promise(r => p.stdin.once('drain', r));
    if (f % 30 === 0) process.stdout.write(`frame ${f}/${NF} ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
  }
  p.stdin.end();
  await new Promise(r => p.on('close', code => { console.log('ffmpeg exit', code); r(); }));
}
