/* Piano Coach's demo piano: a simple built-in piano sound, so demos work offline and instantly. */
import { audioCtx } from './mic.js';

let master = null;
let noise = null;
function out() {
  const c = audioCtx();
  if (!master) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    master = c.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(c.destination);
    const n = Math.round(c.sampleRate * 0.03);
    noise = c.createBuffer(1, n, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.004));
  }
  return master;
}

export function now() { return audioCtx().currentTime; }

/* Plays MIDI note m at audio time `when` for `dur` seconds. */
export function playNote(m, when, dur, vel) {
  vel = vel == null ? 0.8 : vel;
  const c = audioCtx();
  const dest = out();
  const t0 = Math.max(when, c.currentTime + 0.01);
  const f0 = 440 * Math.pow(2, (m - 69) / 12);
  const B = 0.00018 * Math.pow(2, (m - 60) / 18);
  const parts = m < 48 ? 9 : (m < 72 ? 7 : 5);
  const base = m < 48 ? 2.4 : (m < 72 ? 1.6 : 1.0);
  const bus = c.createGain();
  bus.gain.value = 1;
  bus.connect(dest);
  for (let k = 1; k <= parts; k++) {
    const fk = k * f0 * Math.sqrt(1 + B * k * k);
    if (fk > 9000) break;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = fk;
    o.detune.value = (k % 2 ? 1 : -1) * 1.5;
    const g = c.createGain();
    let amp = vel * 0.2 / Math.pow(k, 1.15);
    if (k === 1 && m < 48) amp *= 0.7;
    const tau = base / (1 + 0.3 * k);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.004);
    g.gain.setTargetAtTime(amp * 0.25, t0 + 0.004, tau * 0.35);
    g.gain.setTargetAtTime(0, t0 + 0.3, tau);
    g.gain.setTargetAtTime(0, t0 + dur, 0.07);
    o.connect(g);
    g.connect(bus);
    o.start(t0);
    o.stop(t0 + dur + 0.6);
  }
  const h = c.createBufferSource();
  h.buffer = noise;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = Math.min(4000, f0 * 6);
  bp.Q.value = 0.8;
  const hg = c.createGain();
  hg.gain.value = vel * 0.05;
  h.connect(bp);
  bp.connect(hg);
  hg.connect(bus);
  h.start(t0);
  setTimeout(() => { try { bus.disconnect(); } catch (e) { /* done */ } }, (t0 - c.currentTime + dur + 1) * 1000);
}

/* A soft woodblock tick for count-ins. */
export function tick(when, accent) {
  const c = audioCtx();
  const dest = out();
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.value = accent ? 1760 : 1320;
  const g = c.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(accent ? 0.35 : 0.22, when + 0.002);
  g.gain.setTargetAtTime(0, when + 0.003, 0.025);
  o.connect(g);
  g.connect(dest);
  o.start(when);
  o.stop(when + 0.2);
}

/* Plays a list of steps ({n: [midi...], beats}) at `bpm`, starting a little from now.
   Returns when each step starts (audio time) so the screen can light the keys in time. */
export function playSteps(steps, bpm, lead) {
  const c = audioCtx();
  const beat = 60 / bpm;
  let t = c.currentTime + (lead == null ? 0.25 : lead);
  const times = [];
  steps.forEach((s) => {
    const len = (s.beats || 1) * beat;
    (s.n || []).forEach((m) => playNote(m, t, len * 0.92, s.vel));
    times.push({ t, len });
    t += len;
  });
  return { times, end: t };
}
