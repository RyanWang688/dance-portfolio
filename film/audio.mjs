// D.A.N.C.E. score — every sample synthesized here. 48 kHz stereo, 120 BPM, locked to the 15-frames-per-beat picture grid.
import fs from 'fs';
const SR = 48000, LEN = 15, N = SR * LEN, BEAT = 0.5;
const L = new Float32Array(N), R = new Float32Array(N);       // dry mix
const VL = new Float32Array(N), VR = new Float32Array(N);     // reverb send
const SC = new Float32Array(N).fill(1);                        // sidechain gain for bass/pad
const TAU = Math.PI * 2;
let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
const bt = b => b * BEAT;
const hz = m => 440 * Math.pow(2, (m - 69) / 12);

function put(t0, sig, { gain = 1, pan = 0, send = 0, duck = false } = {}) {
  const s0 = Math.round(t0 * SR), gl = gain * Math.cos((pan + 1) * Math.PI / 4) * Math.SQRT2, gr = gain * Math.sin((pan + 1) * Math.PI / 4) * Math.SQRT2;
  for (let i = 0; i < sig.length; i++) {
    const j = s0 + i; if (j < 0 || j >= N) continue;
    const d = duck ? SC[j] : 1, v = sig[i] * d;
    L[j] += v * gl; R[j] += v * gr;
    if (send) { VL[j] += v * gl * send; VR[j] += v * gr * send; }
  }
}
const buf = sec => new Float32Array(Math.round(sec * SR));
function onepoleLP(x, fc) { const a = Math.exp(-TAU * fc / SR); let y = 0; for (let i = 0; i < x.length; i++) { y = (1 - a) * x[i] + a * y; x[i] = y; } return x; }
function onepoleHP(x, fc) { const a = Math.exp(-TAU * fc / SR); let y = 0, px = 0; for (let i = 0; i < x.length; i++) { y = a * (y + x[i] - px); px = x[i]; x[i] = y; } return x; }

// ---------- instruments ----------
function kick(big = 1) {
  const x = buf(.55 * big); let ph = 0;
  for (let i = 0; i < x.length; i++) { const t = i / SR; const f = 44 + 120 * Math.exp(-t * 28) * big; ph += TAU * f / SR; x[i] = Math.sin(ph) * Math.exp(-t * (7 / big)) + (t < .004 ? rnd() * .6 * (1 - t / .004) : 0); x[i] = Math.tanh(x[i] * 1.6); }
  return x;
}
function softKick() { const x = buf(.4); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; ph += TAU * (42 + 50 * Math.exp(-t * 20)) / SR; x[i] = Math.sin(ph) * Math.exp(-t * 9); } return x; }
function clap() {
  const x = buf(.35);
  for (let i = 0; i < x.length; i++) { const t = i / SR; let e = Math.exp(-t * 18); for (const o of [0, .011, .022]) if (t >= o && t < o + .008) e = Math.max(e, 1 - (t - o) / .008); x[i] = rnd() * e; }
  onepoleHP(x, 900); onepoleLP(x, 6000);
  const s = buf(.35); let ph = 0; for (let i = 0; i < s.length; i++) { ph += TAU * 190 / SR; s[i] = Math.sin(ph) * Math.exp(-i / SR * 30) * .5; }
  return x.map((v, i) => v * 1.4 + s[i]);
}
function hat(open = false) { const x = buf(open ? .25 : .06); for (let i = 0; i < x.length; i++) x[i] = rnd() * Math.exp(-i / SR * (open ? 14 : 70)); onepoleHP(x, 7000); return x; }
function crash(len = 1.8) { const x = buf(len); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = rnd() * Math.exp(-t * 2.4) * (1 + .3 * Math.sin(TAU * 7 * t)); } onepoleHP(x, 4500); return x; }
function wood(f = 1100) { const x = buf(.12); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = (Math.sin(TAU * f * t) + .5 * Math.sin(TAU * f * 1.51 * t)) * Math.exp(-t * 45); } return x; }
function pluck(f, len = .7) { // FM pluck
  const x = buf(len); for (let i = 0; i < x.length; i++) { const t = i / SR; const env = Math.exp(-t * 6); x[i] = Math.sin(TAU * f * t + 2.2 * env * Math.sin(TAU * f * 2 * t)) * env; } return x;
}
function bell(f, len = 2.2) { const x = buf(len); for (let i = 0; i < x.length; i++) { const t = i / SR; const env = Math.exp(-t * 2.2); x[i] = Math.sin(TAU * f * t + 1.6 * Math.exp(-t * 4) * Math.sin(TAU * f * 3.5 * t)) * env * Math.min(1, t * 400); } return x; }
function blip(f, len = .045) { const x = buf(len); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.sin(TAU * f * t) * Math.sin(Math.PI * t / len); } return x; }
function tick() { const x = buf(.012); for (let i = 0; i < x.length; i++) x[i] = rnd() * Math.exp(-i / SR * 500); onepoleHP(x, 3000); return x; }
function errTone() { const x = buf(.34); for (let i = 0; i < x.length; i++) { const t = i / SR; const f = t < .14 ? 520 : 390; const sq = Math.sign(Math.sin(TAU * f * t)); x[i] = sq * .35 * Math.exp(-((t < .14 ? t : t - .16)) * 10) * (t > .14 && t < .16 ? 0 : 1); } onepoleLP(x, 2500); return x; }
function saw(f, t) { const p = (f * t) % 1; return 2 * p - 1; }
function pad(notes, len, cutoff = 1800, att = .25, rel = .5) {
  const x = buf(len + rel);
  for (const m of notes) for (const d of [-0.11, 0, 0.13]) { const f = hz(m + d); const ph = (rnd() + 1) / 2; for (let i = 0; i < x.length; i++) x[i] += saw(f, i / SR + ph) * .12; }
  onepoleLP(x, cutoff); onepoleLP(x, cutoff * 1.4);
  for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] *= Math.min(1, t / att) * (t > len ? Math.exp(-(t - len) / rel * 3) : 1); }
  return x;
}
function stab(notes, len = .35) { const x = buf(len); for (const m of notes) { const f = hz(m); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] += (saw(f, t) + saw(f * 1.005, t)) * .16 * Math.exp(-t * 9); } } onepoleLP(x, 3200); return x; }
function bassNote(m, len) { const f = hz(m); const x = buf(len); for (let i = 0; i < x.length; i++) { const t = i / SR; x[i] = Math.tanh((Math.sin(TAU * f * t) + .25 * Math.sin(TAU * f * 2 * t)) * 1.5) * Math.min(1, t * 200) * Math.exp(-t * 3); } return x; }
function noiseSweep(len, f0, f1, shape = 'up') { // riser / whoosh
  const x = buf(len); let y = 0;
  for (let i = 0; i < x.length; i++) { const u = i / x.length; const fc = f0 * Math.pow(f1 / f0, u); const a = Math.exp(-TAU * fc / SR); y = (1 - a) * rnd() + a * y; const env = shape === 'up' ? Math.pow(u, 2.2) : shape === 'bell' ? Math.sin(Math.PI * u) ** 2 : Math.pow(1 - u, 2); x[i] = y * env * 3; }
  return x;
}
function boom() { const x = buf(3); let ph = 0; for (let i = 0; i < x.length; i++) { const t = i / SR; ph += TAU * (30 + 40 * Math.exp(-t * 6)) / SR; x[i] = Math.tanh(Math.sin(ph) * 2) * Math.exp(-t * 1.3) + rnd() * Math.exp(-t * 9) * .4; } return x; }
function heartbeat() { const x = buf(.6); for (const [o, g] of [[0, 1], [.2, .7]]) { let ph = 0; for (let i = Math.round(o * SR); i < x.length; i++) { const t = i / SR - o; ph += TAU * (48 + 30 * Math.exp(-t * 30)) / SR; x[i] += Math.sin(ph) * Math.exp(-t * 14) * g; } } return x; }
function shimmer(len) { const x = buf(len); const fs_ = [hz(81), hz(85), hz(88), hz(93), hz(96)]; for (let i = 0; i < x.length; i++) { const t = i / SR; let v = 0; fs_.forEach((f, k) => v += Math.sin(TAU * f * t + k) * (0.5 + .5 * Math.sin(TAU * (.7 + k * .23) * t))); x[i] = v * .06 * Math.min(1, t / .6) * Math.min(1, (len - t) / .5); } return x; }
function reverseSwell(len) { const c = crash(len); c.reverse(); const n = noiseSweep(len, 400, 9000, 'up'); return c.map((v, i) => v * .9 + n[i] * .35); }

// ---------- arrangement ----------
// chords per bar (2 s): Am9, Fmaj7, Cadd9, G6
const CH = { Am: [57, 60, 64, 71], F: [53, 57, 60, 64], C: [48, 55, 64, 62 + 12], G: [55, 59, 62, 64] };
const BASS = { Am: 33, F: 29, C: 36, G: 31 };
const prog = ['Am', 'F', 'C', 'G'];

// 0–2 s: count-in — woodblock + rising arpeggio, riser into the drop
[0, 1, 2, 3].forEach((k, i) => { put(bt(k), wood(i === 3 ? 1500 : 1100), { gain: .55, send: .2 }); put(bt(k), pluck(hz([69, 72, 76, 81][i]), .9), { gain: .32, pan: [-.3, .3, -.15, .15][i], send: .45 }); });
put(bt(2), noiseSweep(1.0, 300, 9000, 'up'), { gain: .25, send: .3 });
put(bt(3.5), reverseSwell(.25), { gain: .35 });

// helpers for the groove
function drums(b0, b1, { hats16 = false, claps = true } = {}) {
  for (let b = b0; b < b1; b++) {
    put(bt(b), kick(), { gain: .95 });
    const s0 = Math.round(bt(b) * SR); for (let i = 0; i < SR * .22 && s0 + i < N; i++) SC[s0 + i] = Math.min(SC[s0 + i], .25 + .75 * (i / (SR * .22)) ** 1.5);
    if (claps && b % 2 === 1) put(bt(b), clap(), { gain: .5, send: .25 });
    const sub = hats16 ? 4 : 2;
    for (let k = 0; k < sub; k++) { const off = k / sub; if (off === 0 && !hats16) continue; put(bt(b + off), hat(off === .5 && !hats16), { gain: off === .5 ? .22 : .13, pan: k % 2 ? .35 : -.35 }); }
  }
}
function harmony(b0, b1, gain = .5) {
  for (let b = b0; b < b1; b += 4) {
    const ch = prog[Math.floor((b - 4) / 4) % 4] || 'Am';
    const len = Math.min(4, b1 - b) * BEAT;
    put(bt(b), pad(CH[ch], len, 1600), { gain: gain * .55, send: .5, duck: true, pan: 0 });
    for (let e = 0; e < Math.min(8, (b1 - b) * 2); e++) { const m = BASS[ch] + (e % 4 === 3 ? 12 : 0); put(bt(b + e / 2), bassNote(m + 12, .24), { gain: gain * .6, duck: true }); }
  }
}

// 2–6 s: drop 1 — four on the floor, joints lock in with blips
put(bt(4), crash(2), { gain: .35, send: .3 });
put(bt(4), boom().slice(0, SR * 1.2), { gain: .35 });
for (let j = 0; j < 16; j++) put(bt(4) + j * .45 / FPS_(), blip(1700 + j * 70), { gain: .12, pan: (j % 2 ? .5 : -.5), send: .2 });
function FPS_() { return 30; }
drums(4, 8); drums(8, 12, { hats16: true });
harmony(4, 12, .55);

// 6–8 s: correction — half-time, filtered, UI sounds
put(bt(12), softKick(), { gain: .8 }); put(bt(14), softKick(), { gain: .8 });
put(bt(12), pad(CH.Am, 1.0, 900), { gain: .3, send: .6 });
put(bt(14), pad(CH.F, 1.0, 1200), { gain: .3, send: .6 });
put(bt(12.5), errTone(), { gain: .32, send: .25 });
for (let i = 0; i < 34; i++) put(bt(12.7) + i * (bt(.9) / 34), tick(), { gain: .18, pan: (i % 3 - 1) * .3 });
[72, 76, 79, 84].forEach((m, i) => put(bt(14.25) + i * .055, bell(hz(m), 1.6), { gain: .2, pan: (i - 1.5) * .25, send: .55 }));
put(bt(15), noiseSweep(1.0, 400, 7000, 'up'), { gain: .22, send: .3 });

// 8–10.5 s: take-off, freeze, orbit, release
drums(16, 17, { claps: true });
put(bt(16), stab(CH.C.map(m => m + 12)), { gain: .3, send: .3 });
put(bt(16.5), noiseSweep(.25, 600, 6000, 'bell'), { gain: .4, send: .2 });
put(bt(17), boom(), { gain: .75, send: .9 });
put(bt(17), crash(2.5), { gain: .25, send: .8 });
put(bt(17.1), shimmer(1.75), { gain: 1, send: .9 });
for (let k = 0; k < 3; k++) put(bt(17.4) + k * .55, heartbeat(), { gain: .55 });
put(bt(19.6), reverseSwell(bt(.9)), { gain: .45, send: .2 });
put(bt(20.5), noiseSweep(.25, 5000, 300, 'down'), { gain: .35 });

// 10.5–12 s: landing + four cameras, double-time energy
put(bt(21), kick(1.5), { gain: 1 }); put(bt(21), clap(), { gain: .6, send: .4 }); put(bt(21), crash(2), { gain: .4, send: .3 });
drums(22, 24, { hats16: true });
for (let k = 0; k < 6; k++) put(bt(21.5 + k * .5), blip(2400, .03), { gain: .1, pan: k % 2 ? .6 : -.6 });
harmony(21, 24, .6);

// 12–13 s: D · A · N · C · E stabs
const stabs = [CH.Am, CH.F, CH.C, CH.G, CH.Am];
for (let i = 0; i < 5; i++) {
  const b = 24 + i * .4;
  put(bt(b), kick(), { gain: .85 }); put(bt(b), clap(), { gain: .35, send: .3 });
  put(bt(b), stab(stabs[i].map(m => m + 12)), { gain: .42, pan: (i - 2) * .2, send: .35 });
  put(bt(b), blip(1200 + i * 220, .05), { gain: .1 });
}
for (let b = 24; b < 26; b += .25) put(bt(b), hat(), { gain: .12, pan: .3 });

// 13–15 s: logo — sub drop, final chord, shimmer and type ticks
put(bt(26), kick(1.6), { gain: .9 }); put(bt(26), boom(), { gain: .45, send: .6 }); put(bt(26), crash(2.5), { gain: .3, send: .5 });
put(bt(26), pad([45, 57, 64, 67, 71, 76], 1.9, 2200, .02, .6), { gain: .5, send: .7 });
put(bt(27.45), bell(hz(81), 2), { gain: .22, send: .7 }); put(bt(27.5), bell(hz(88), 2), { gain: .14, pan: .4, send: .7 });
for (let i = 0; i < 30; i++) put(bt(28.0) + i * (bt(.7) / 30), tick(), { gain: .12, pan: .2 });

// ---------- reverb (Freeverb-style) ----------
function freeverb(inp, spread) {
  const combs = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617].map(n => Math.round((n + spread) * SR / 44100));
  const aps = [556, 441, 341, 225].map(n => Math.round((n + spread) * SR / 44100));
  const out = new Float32Array(N); const fb = .86, damp = .25;
  for (const n of combs) { const d = new Float32Array(n); let idx = 0, f = 0; for (let i = 0; i < N; i++) { const y = d[idx]; f = y * (1 - damp) + f * damp; d[idx] = inp[i] * .015 + f * fb; idx = (idx + 1) % n; out[i] += y; } }
  for (const n of aps) { const d = new Float32Array(n); let idx = 0; for (let i = 0; i < N; i++) { const bv = d[idx]; const y = -out[i] + bv; d[idx] = out[i] + bv * .5; idx = (idx + 1) % n; out[i] = y; } }
  return out;
}
const rvL = freeverb(VL, 0), rvR = freeverb(VR, 23);

// ---------- master ----------
let peak = 0; const mL = new Float32Array(N), mR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  const t = i / SR;
  let fade = Math.min(1, t / .01); if (t > 14.65) fade *= Math.max(0, (15 - t) / .35);
  mL[i] = Math.tanh((L[i] + rvL[i] * 1.1) * .9) * fade; mR[i] = Math.tanh((R[i] + rvR[i] * 1.1) * .9) * fade;
  peak = Math.max(peak, Math.abs(mL[i]), Math.abs(mR[i]));
}
const g = .89 / peak;
const out = Buffer.alloc(44 + N * 4);
out.write('RIFF', 0); out.writeUInt32LE(36 + N * 4, 4); out.write('WAVE', 8); out.write('fmt ', 12);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(2, 22); out.writeUInt32LE(SR, 24); out.writeUInt32LE(SR * 4, 28); out.writeUInt16LE(4, 32); out.writeUInt16LE(16, 34);
out.write('data', 36); out.writeUInt32LE(N * 4, 40);
for (let i = 0; i < N; i++) { out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mL[i] * g)) * 32767), 44 + i * 4); out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, mR[i] * g)) * 32767), 46 + i * 4); }
fs.writeFileSync(process.argv[2], out);
console.log('wav written, peak before norm', peak.toFixed(3));
