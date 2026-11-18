/* Piano Coach ears.
   Finds each key strike in a recording and works out its pitch.
   Periodicity (YIN) proposes pitches; the spectrum of the energy that is new since the strike
   picks the one whose harmonics are really there. Then a lesson can ask "is the note I expected
   in there?", which is much more reliable than guessing every note from scratch. */

export const pc = (m) => ((m % 12) + 12) % 12;
const LETTERS = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const letter = (m) => LETTERS[pc(m)];
export const noteName = (m) => letter(m) + (Math.floor(m / 12) - 1);

function toWorkRate(x, sr) {
  const k = Math.max(1, Math.round(sr / 22050));
  if (k === 1) return { x, sr };
  const n = Math.floor(x.length / k);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < k; j++) s += x[i * k + j];
    y[i] = s / k;
  }
  return { x: y, sr: sr / k };
}

export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i]; re[i] = re[j]; re[j] = t;
      t = im[i]; im[i] = im[j]; im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k;
        const b = a + half;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi;
        re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}

const ON_N = 1024;
const ON_HOP = 256;
const onWin = new Float32Array(ON_N);
for (let i = 0; i < ON_N; i++) onWin[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / ON_N);

/* Spectral flux and level per frame, computed once per recording. */
function fluxTrack(x, sr) {
  const N = ON_N;
  const hop = ON_HOP;
  const frames = Math.max(0, Math.floor((x.length - N) / hop) + 1);
  const flux = new Float32Array(frames);
  const lev = new Float32Array(frames);
  const kMax = Math.min(N / 2, Math.round(6000 / (sr / N)));
  const prev = new Float32Array(kMax);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i]; e += v * v; re[i] = v * onWin[i]; im[i] = 0; }
    lev[f] = 10 * Math.log10(e / N + 1e-12);
    fft(re, im);
    let s = 0;
    for (let k = 2; k < kMax; k++) {
      const m = Math.log(1 + 200 * Math.hypot(re[k], im[k]));
      const d = m - prev[k];
      if (d > 0 && f > 0) s += d;
      prev[k] = m;
    }
    flux[f] = s;
  }
  return { flux, lev, frames, hop, N };
}

/* Picks key strikes out of the flux track. opts.floorDb lets a live listener pass the room's
   quiet level, so a stretch of nonstop playing isn't mistaken for silence. opts.sens and
   opts.minFrac make it more sensitive when searching a gap for a note it may have missed. */
function pickOnsets(tr, sr, opts) {
  opts = opts || {};
  const { flux, lev, frames, hop, N } = tr;
  if (frames < 4) return { times: [], quiet: true };
  const sl = Array.from(lev).sort((a, b) => a - b);
  let floor = sl[Math.floor(sl.length * 0.03)];
  if (opts.floorDb != null) floor = Math.min(floor, opts.floorDb);
  const loud = sl[Math.floor(sl.length * 0.99)];
  if (loud - floor < 10 || loud < -62) return { times: [], quiet: true, loud, floor };
  const f0 = opts.from != null ? Math.max(1, Math.floor(opts.from * sr / hop)) : 1;
  const f1 = opts.to != null ? Math.min(frames - 1, Math.ceil(opts.to * sr / hop)) : frames - 1;
  let fmax = 0;
  for (let f = 0; f < frames; f++) fmax = Math.max(fmax, flux[f]);
  const sens = opts.sens || 1.6;
  const minFrac = opts.minFrac != null ? opts.minFrac : 0.06;
  const gap = Math.max(1, Math.round(0.075 * sr / hop));
  const out = [];
  let last = -1e9;
  for (let f = f0; f < f1; f++) {
    let isMax = true;
    for (let j = Math.max(0, f - 3); j <= Math.min(frames - 1, f + 3); j++) {
      if (flux[j] > flux[f] || (flux[j] === flux[f] && j < f)) { isMax = false; break; }
    }
    if (!isMax) continue;
    let sum = 0;
    let cnt = 0;
    for (let j = Math.max(0, f - 12); j <= Math.min(frames - 1, f + 6); j++) { sum += flux[j]; cnt++; }
    const mean = sum / cnt;
    if (flux[f] < mean * sens || flux[f] < fmax * minFrac) continue;
    let after = -200;
    for (let j = f; j <= Math.min(frames - 1, f + 7); j++) after = Math.max(after, lev[j]);
    if (after < floor + 10 || after < loud - 45) continue;
    let pre = 0;
    let pn = 0;
    for (let j = Math.max(0, f - 5); j <= f - 2; j++) { pre += lev[j]; pn++; }
    const rise = pn ? after - pre / pn : 20;
    // In legato playing the last key's damper drops just as the next key is struck, so the
    // overall level can stay flat even on a real strike. A very sharp flux peak counts anyway.
    if (rise < 0.5 && flux[f] < mean * 3) continue;
    // how sudden the strike is: level jump over the next ~25 ms. Hammers are sudden; voices aren't.
    let jump = -200;
    for (let j = f; j <= Math.min(frames - 1, f + 2); j++) jump = Math.max(jump, lev[j]);
    const sharp = pn ? jump - pre / pn : 20;
    const t = (f * hop + N * 0.5) / sr;
    if (f - last < gap) {
      if (out.length && flux[f] > out[out.length - 1].flux) { out[out.length - 1] = { t, flux: flux[f], rise, sharp }; last = f; }
      continue;
    }
    out.push({ t, flux: flux[f], rise, sharp });
    last = f;
  }
  return { times: out.map((o) => o.t), info: out, quiet: false, loud, floor };
}

const FFTN = 4096;
const pRe = new Float32Array(FFTN);
const pIm = new Float32Array(FFTN);
const pMag = new Float32Array(FFTN / 2);
function salience(binHz, f0, mag) {
  mag = mag || pMag;
  let s = 0;
  for (let k = 1; k <= 12; k++) {
    const fk = k * f0;
    if (fk > 7000) break;
    const c = fk / binHz;
    const w = Math.max(1.5, c * 0.03);
    let best = 0;
    for (let b = Math.max(1, Math.floor(c - w)); b <= Math.min(mag.length - 1, Math.ceil(c + w)); b++) if (mag[b] > best) best = mag[b];
    s += best / Math.pow(k, 0.7);
  }
  return s;
}
function specInto(x, start, L, out) {
  for (let i = 0; i < FFTN; i++) {
    const j = start + i;
    pRe[i] = i < L && j >= 0 && j < x.length ? x[j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / L)) : 0;
    pIm[i] = 0;
  }
  fft(pRe, pIm);
  for (let k = 0; k < out.length; k++) out[k] = Math.sqrt(Math.hypot(pRe[k], pIm[k]));
  return out;
}
function pitchAt(x, sr, start, W, maxLag, minLag, before) {
  if (start < 0 || start + W + maxLag >= x.length) return null;
  let en = 0;
  for (let j = 0; j < W; j++) en += x[start + j] * x[start + j];
  if (en / W < 1e-9) return null;
  const d = new Float32Array(maxLag + 1);
  for (let tau = 1; tau <= maxLag; tau++) {
    let s = 0;
    const o = start + tau;
    for (let j = 0; j < W; j++) { const v = x[start + j] - x[o + j]; s += v * v; }
    d[tau] = s;
  }
  const c = new Float32Array(maxLag + 1);
  c[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= maxLag; tau++) { run += d[tau]; c[tau] = run > 0 ? d[tau] * tau / run : 1; }
  const lo = Math.max(2, minLag);
  const cands = [];
  let gmin = 1;
  for (let t = lo + 1; t < maxLag; t++) {
    if (c[t] < gmin) gmin = c[t];
    if (c[t] < 0.45 && c[t] <= c[t - 1] && c[t] <= c[t + 1]) cands.push(t);
  }
  if (!cands.length || gmin > 0.45) return null;
  const L = Math.min(FFTN, W + maxLag);
  specInto(x, start, L, pMag);
  if (before) for (let k = 0; k < pMag.length; k++) pMag[k] = Math.max(0, pMag[k] - before[k]);
  const binHz = sr / FFTN;
  let best = null;
  const tried = {};
  const consider = (tt, cv) => {
    const f = sr / tt;
    if (f < 26 || f > 4500) return;
    const key = Math.round(69 + 12 * Math.log2(f / 440));
    const sal = salience(binHz, f) * (1.15 - 0.5 * Math.min(1, cv));
    if (tried[key] && tried[key] >= sal) return;
    tried[key] = sal;
    if (!best || sal > best.sal) best = { sal, f, conf: 1 - Math.min(1, cv) };
  };
  cands.slice(0, 12).forEach((t) => {
    let tt = t;
    const a = c[t - 1];
    const b = c[t];
    const e = c[t + 1];
    const den = a + e - 2 * b;
    if (den > 0) tt = t + 0.5 * (a - e) / den;
    consider(tt, c[t]);
    [2, 3].forEach((q) => {
      const h = tt / q;
      const hi = Math.round(h);
      if (hi >= lo && hi < maxLag) consider(h, Math.min(c[hi - 1], c[hi], c[hi + 1]));
    });
  });
  if (best) best.conf = Math.max(best.conf, 1 - gmin);
  return best;
}

function noteAt(an, t, next) {
  const { x, sr, W, maxLag, minLag } = an;
  const span = (W + maxLag) / sr;
  const L = Math.min(FFTN, W + maxLag);
  const bStart = Math.round((t - 0.025) * sr) - L;
  const before = bStart >= 0 ? specInto(x, bStart, L, new Float32Array(FFTN / 2)) : null;
  const ests = [];
  for (const off of [0.03, 0.06, 0.095, 0.14, 0.19]) {
    if (ests.length && t + off + span > next + 0.03) break;
    const r = pitchAt(x, sr, Math.round((t + off) * sr), W, maxLag, minLag, before);
    if (r && r.conf > 0.55) ests.push(69 + 12 * Math.log2(r.f / 440));
  }
  if (!ests.length) return null;
  // A struck string holds its pitch to within a few cents. A speaking voice slides. If the
  // guesses slide, this strike is (mostly) a voice: look underneath it for a steady pitch.
  if (ests.length >= 3) {
    const med = ests.slice().sort((a, b) => a - b)[Math.floor(ests.length / 2)];
    const dev = ests.map((v) => Math.abs(v - 12 * Math.round((v - med) / 12) - med)).sort((a, b) => a - b);
    // judge by the guesses that agree best (the first one or two can still be caught in the
    // last note's ring or the hammer's thump)
    const keep = dev.slice(0, Math.max(2, Math.ceil(dev.length * 0.6)));
    if (keep[keep.length - 1] > 0.2) return steadyUnder(an, t, next, before, Math.round(med));
  }
  // Group the guesses by note name (an octave slip is the same key). The biggest group wins;
  // its guesses must agree closely, because a piano note holds its pitch while speech and
  // noise wander. One early guess caught in the strike's thump doesn't sink the rest.
  const groups = {};
  ests.forEach((v, i) => {
    const p = pc(Math.round(v));
    (groups[p] = groups[p] || []).push({ v, i });
  });
  let g = null;
  Object.keys(groups).forEach((p) => {
    const a = groups[p];
    if (!g || a.length > g.length || (a.length === g.length && a[0].i < g[0].i)) g = a;
  });
  if (ests.length >= 3 && g.length < 2) return null;
  // (with 3 or more guesses the steadiness check above has already done this job properly)
  if (ests.length === 2 && g.length === 2) {
    const folded = g.map((e) => e.v - 12 * Math.round((e.v - g[0].v) / 12));
    if (Math.max(...folded) - Math.min(...folded) > 0.45) return null;
  }
  // the octave most of the group agrees on (ties: the earliest)
  const oct = {};
  g.forEach((e) => { const k = Math.round(e.v); oct[k] = (oct[k] || 0) + 1; });
  let m = null;
  let best = 0;
  g.forEach((e) => { const k = Math.round(e.v); if (oct[k] > best) { best = oct[k]; m = k; } });
  if (m < 21 || m > 108) return null;
  return { m, votes: g.length, of: ests.length };
}

/* When the sound at a strike slides (a voice counting along), find the pitch that stays put
   underneath it: strong right after the strike AND still there a moment later, at the same
   pitch. A sliding voice smears across pitches; a piano string doesn't. */
function steadyUnder(an, t, next, before, voiceM) {
  const { x, sr, W, maxLag } = an;
  const L = Math.min(FFTN, W + maxLag);
  const binHz = sr / FFTN;
  const tA = t + 0.04;
  const tB = Math.min(t + 0.2, next - L / sr - 0.01);
  if (tB - tA < 0.1) return null;
  const sA = specInto(x, Math.round(tA * sr), L, new Float32Array(FFTN / 2));
  const sB = specInto(x, Math.round(tB * sr), L, new Float32Array(FFTN / 2));
  if (before) for (let k = 0; k < sA.length; k++) { sA[k] = Math.max(0, sA[k] - before[k]); sB[k] = Math.max(0, sB[k] - before[k] * 0.8); }
  let best = null;
  let top = 0;
  // the sliding voice itself (and its octaves) can't be the answer
  const isVoice = (m) => voiceM != null && Math.abs(m - voiceM - 12 * Math.round((m - voiceM) / 12)) <= 1;
  for (let m = 36; m <= 96; m++) {
    const a = salienceC(binHz, hz(m), sA);
    const b = salienceC(binHz, hz(m), sB);
    top = Math.max(top, a);
    if (isVoice(m)) continue;
    const s = Math.min(a, b * 1.4);
    if (!best || s > best.s) best = { m, s };
  }
  if (!best || best.s < 0.45 * top) return null;
  // prefer the lowest octave that explains it (its upper octave shares its harmonics)
  const lower = best.m - 12;
  if (lower >= 36) {
    const a = salienceC(binHz, hz(lower), sA);
    const b = salienceC(binHz, hz(lower), sB);
    if (!isVoice(lower) && Math.min(a, b * 1.4) > 0.8 * best.s) best.m = lower;
  }
  return { m: best.m, votes: 0, of: 0, steady: true };
}

/* Listens to a whole recording. Returns the notes with their times, plus what a lesson needs
   to ask follow-up questions about it. */
export function hearNotes(raw, rawSr, opts) {
  opts = opts || {};
  const { x, sr } = toWorkRate(raw, rawSr);
  const W = 1024;
  const maxLag = Math.min(760, Math.floor(sr / 30));
  const minLag = Math.max(2, Math.floor(sr / 4600));
  const an = { x, sr, W, maxLag, minLag, secs: x.length / sr, notes: [], quiet: false };
  const tr = fluxTrack(x, sr);
  an.track = tr;
  const on = pickOnsets(tr, sr, { floorDb: opts.floorDb });
  an.loud = on.loud;
  an.floor = on.floor;
  if (on.quiet) { an.quiet = true; return an; }
  const notes = [];
  for (let i = 0; i < on.info.length; i++) {
    const o = on.info[i];
    const next = i + 1 < on.info.length ? on.info[i + 1].t : x.length / sr;
    const r = noteAt(an, o.t, next);
    if (!r) continue;
    notes.push({ t: Math.round(o.t * 1000) / 1000, m: r.m, sharp: Math.round(o.sharp * 10) / 10, rise: Math.round(o.rise * 10) / 10 });
  }
  // A lone note far from both neighbours and squeezed right next to one is a glitch, not a key.
  an.notes = notes.filter((nt, i) => {
    const a = notes[i - 1];
    const b = notes[i + 1];
    const far = (o) => !o || Math.abs(o.m - nt.m) > 15;
    const close = (a && nt.t - a.t < 0.3) || (b && b.t - nt.t < 0.3);
    return !(far(a) && far(b) && close && (a || b));
  });
  return an;
}

/* Harmonic salience where each harmonic only counts by how far its peak stands above the
   spectrum around it, so a burst of broadband noise (a hammer's thump in a room) can't make
   every pitch look present. */
function salienceC(binHz, f0, mag) {
  let s = 0;
  for (let k = 1; k <= 12; k++) {
    const fk = k * f0;
    if (fk > 7000) break;
    const c = fk / binHz;
    const w = Math.max(1.5, c * 0.03);
    let best = 0;
    for (let b = Math.max(1, Math.floor(c - w)); b <= Math.min(mag.length - 1, Math.ceil(c + w)); b++) if (mag[b] > best) best = mag[b];
    let nb = 0;
    let nc = 0;
    const lo1 = Math.max(1, Math.floor(c * 0.88));
    const hi1 = Math.floor(c * 0.94);
    const lo2 = Math.ceil(c * 1.06);
    const hi2 = Math.min(mag.length - 1, Math.ceil(c * 1.12));
    for (let b = lo1; b <= hi1; b++) { nb += mag[b]; nc++; }
    for (let b = lo2; b <= hi2; b++) { nb += mag[b]; nc++; }
    const base = nc ? nb / nc : 0;
    s += Math.max(0, best - base) / Math.pow(k, 0.7);
  }
  return s;
}
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

/* How strong a typical key strike is in this take: the median of each heard note's own
   salience just after it was struck. Worked out once and kept. */
function refStrength(an) {
  if (an.ref != null) return an.ref;
  const { x, sr, W, maxLag } = an;
  const L = Math.min(FFTN, W + maxLag);
  const binHz = sr / FFTN;
  const vals = [];
  const mag = new Float32Array(FFTN / 2);
  (an.notes || []).forEach((n) => {
    const start = Math.round((n.t + 0.05) * sr);
    if (start + L >= x.length) return;
    specInto(x, start, L, mag);
    vals.push(salienceC(binHz, hz(n.m), mag));
  });
  vals.sort((a, b) => a - b);
  an.ref = vals.length ? vals[Math.floor(vals.length / 2)] : 0;
  return an.ref;
}

/* Was note m (or the same key heard an octave off) freshly struck at time t? Compares it with
   the strongest pitch within a few keys of it, and checks that its sound is new rather than
   left ringing from before. 1 means clearly yes; near 0 means no. Pitches far from m (a voice
   counting out loud, a low hum) don't get a say. */
export function evidence(an, t, m) {
  const { x, sr, W, maxLag } = an;
  const L = Math.min(FFTN, W + maxLag);
  const binHz = sr / FFTN;
  const start = Math.round((t + 0.05) * sr);
  if (start + L >= x.length || start < 0) return 0;
  const bStart = Math.round((t - 0.025) * sr) - L;
  const before = bStart >= 0 ? specInto(x, bStart, L, new Float32Array(FFTN / 2)) : null;
  const now = specInto(x, start, L, new Float32Array(FFTN / 2));
  const sal = (mag, mm) => salienceC(binHz, hz(mm), mag);
  const want = (mag) => Math.max(sal(mag, m), 0.9 * sal(mag, m + 12), 0.9 * sal(mag, m - 12));
  const wNow = want(now);
  if (wNow <= 0) return 0;
  // it has to be about as strong as a real key strike in this take, not a whisper in a quiet gap
  if (wNow < 0.2 * refStrength(an)) return 0;
  const wBef = before ? want(before) : 0;
  let top = wNow;
  for (let k = m - 8; k <= m + 8; k++) if (k !== m) top = Math.max(top, sal(now, k));
  const share = wNow / top;
  const fresh = Math.max(0, wNow - wBef) / wNow;
  return share * Math.min(1, fresh / 0.35);
}

/* Looks again, more carefully, between two times for a strike of note m that the first pass
   may have missed (a soft note, or two notes very close together). */
export function searchGap(an, t0, t1, m) {
  if (!an.track || t1 - t0 < 0.12) return null;
  const on = pickOnsets(an.track, an.sr, { floorDb: an.floor, sens: 1.2, minFrac: 0.025, from: t0 + 0.04, to: t1 - 0.04 });
  if (on.quiet || !on.info) return null;
  for (let i = 0; i < on.info.length; i++) {
    const o = on.info[i];
    if (o.t <= t0 + 0.04 || o.t >= t1 - 0.1) continue;
    const r = noteAt(an, o.t, Math.min(t1, i + 1 < on.info.length ? on.info[i + 1].t : t1));
    if (r && pc(r.m) === pc(m)) return { t: o.t, m: r.m };
    if (evidence(an, o.t, m) > 0.65) return { t: o.t, m };
  }
  // no strike found: scan the gap for the note's sound turning up fresh
  let best = null;
  for (let t = t0 + 0.06; t < t1 - 0.13; t += 0.03) {
    const ev = evidence(an, t, m);
    if (ev > 0.7 && (!best || ev > best.ev)) best = { t, m, ev };
  }
  return best;
}

/* Turns a recording into a 16-bit WAV, so a take can be sent to Claude to look at. */
export function toWav(x, sr) {
  const n = x.length;
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) { const s = Math.max(-1, Math.min(1, x[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
  return new Blob([buf], { type: 'audio/wav' });
}

/* Just the key strikes (no pitches), quick enough to run a few times a second while you play. */
export function countStrikes(raw, rawSr, floorDb) {
  const { x, sr } = toWorkRate(raw, rawSr);
  const tr = fluxTrack(x, sr);
  const on = pickOnsets(tr, sr, { floorDb });
  return on.quiet ? [] : on.times;
}
export const _dbg = { pickOnsets, noteAt, fluxTrack, pitchAt, specInto, FFTN, salienceC };

/* Does note m keep sounding after a strike at time t, the way a held key does? Returns how much
   of it is left 0.3 s later (1 = all of it, near 0 = gone), or null if the next strike comes
   too soon to tell. A spoken word is over by then; a piano key is still ringing. */
export function holds(an, t, m, nextT) {
  const { x, sr, W, maxLag } = an;
  const L = Math.min(FFTN, W + maxLag);
  const binHz = sr / FFTN;
  // look as late as possible before the next strike, but at least a quarter second after
  const late = Math.min(t + 0.3, (nextT == null ? Infinity : nextT) - L / sr - 0.01);
  if (late < t + 0.24) return null;
  const a0 = Math.round((t + 0.05) * sr);
  const a1 = Math.round(late * sr);
  if (a1 + L >= x.length) return null;
  const sa = specInto(x, a0, L, new Float32Array(FFTN / 2));
  const sb = specInto(x, a1, L, new Float32Array(FFTN / 2));
  const f = hz(m);
  const ea = Math.max(salienceC(binHz, f, sa), 1e-9);
  const eb = salienceC(binHz, f, sb);
  return eb / ea;
}
