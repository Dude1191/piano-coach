/* Piano Coach mic and speaker.
   One audio context for everything. The mic is only open while you play, so the coach's
   voice and demos never play through iOS's call-style audio (quieter, sometimes crackly). */

let ctx = null;
export function audioCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC({ latencyHint: 'interactive' });
  }
  return ctx;
}
function session(type) {
  try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* not supported */ }
}
/* Call from a tap: iOS only lets sound start after one. */
export async function unlock() {
  const c = audioCtx();
  session('playback');
  try { if (c.state !== 'running') await c.resume(); } catch (e) { /* try again next tap */ }
  try {
    const b = c.createBuffer(1, 1, c.sampleRate);
    const s = c.createBufferSource();
    s.buffer = b;
    s.connect(c.destination);
    s.start(0);
  } catch (e) { /* fine */ }
  return c.state === 'running';
}

export class Mic {
  constructor() {
    this.on = false;
    this.taking = false;
    this.chunks = [];
    this.recent = [];
    this.recentLen = 0;
    this.level = -120;
    this.levels = [];
    this.label = '';
    this.sr = 48000;
    this.listeners = new Set();
  }
  async open(deviceId) {
    if (this.on) return;
    const c = audioCtx();
    session('play-and-record');
    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    const get = async (id) => {
      const audio = Object.assign({}, base);
      if (id) audio.deviceId = { exact: id };
      try {
        return await navigator.mediaDevices.getUserMedia({ audio });
      } catch (e) {
        if (id && e && e.name === 'OverconstrainedError') return navigator.mediaDevices.getUserMedia({ audio: base });
        throw e;
      }
    };
    let stream;
    try {
      stream = await get(deviceId || Mic.builtInId || '');
      // With headphones in, iPhone switches to the headphone mic, which is on your head and
      // can't hear the piano. If that happened, find the iPhone's own mic and use it instead.
      if (!deviceId && !BUILT_IN.test(labelOf(stream))) {
        const own = await findBuiltIn();
        if (own && own.label !== labelOf(stream)) {
          stream.getTracks().forEach((t) => t.stop());
          stream = await get(own.deviceId);
          if (!isHeadset(labelOf(stream))) Mic.builtInId = own.deviceId;
        }
      }
    } catch (e) { session('playback'); throw e; }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    this.label = labelOf(stream) || 'Microphone';
    this.headset = isHeadset(this.label);
    this.settings = track && track.getSettings ? track.getSettings() : {};
    try { if (c.state !== 'running') await c.resume(); } catch (e) { /* the take will show silence */ }
    this.sr = c.sampleRate;
    this.src = c.createMediaStreamSource(stream);
    if (c.audioWorklet && window.AudioWorkletNode) {
      if (!Mic.ready) {
        await c.audioWorklet.addModule(new URL('./worklet.js', import.meta.url));
        Mic.ready = true;
      }
      this.node = new AudioWorkletNode(c, 'pc-tap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.node.port.onmessage = (e) => this._chunk(e.data);
    } else {
      this.node = c.createScriptProcessor(2048, 1, 1);
      this.node.onaudioprocess = (e) => this._chunk(new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    this.sink = c.createGain();
    this.sink.gain.value = 0;
    this.src.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(c.destination);
    this.on = true;
    this.recent = [];
    this.recentLen = 0;
    this.levels = [];
  }
  close() {
    if (!this.on) return;
    try { this.src.disconnect(); } catch (e) { /* gone */ }
    try { this.node.disconnect(); } catch (e) { /* gone */ }
    try { this.sink.disconnect(); } catch (e) { /* gone */ }
    if (this.node && this.node.port) this.node.port.onmessage = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.on = false;
    this.taking = false;
    session('playback');
  }
  _chunk(x) {
    let e = 0;
    for (let i = 0; i < x.length; i++) e += x[i] * x[i];
    this.level = 10 * Math.log10(e / x.length + 1e-12);
    this.total = (this.total || 0) + x.length;
    this.levels.push(this.level);
    if (this.levels.length > 200) this.levels.shift();
    if (this.taking) { this.chunks.push(x); this.takeLen += x.length; }
    this.recent.push(x);
    this.recentLen += x.length;
    while (this.recentLen - this.recent[0].length > this.sr * 4) this.recentLen -= this.recent.shift().length;
    this.listeners.forEach((f) => f(x, this.level));
  }
  /* The room's quiet level, from the quietest stretch heard lately. */
  floorDb() {
    if (!this.levels.length) return null;
    const s = this.levels.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length * 0.2)];
  }
  startTake() {
    this.chunks = [];
    this.takeLen = 0;
    this.taking = true;
  }
  takeSoFar() { return join(this.chunks); }
  stopTake() {
    this.taking = false;
    const x = join(this.chunks);
    this.chunks = [];
    return { x, sr: this.sr };
  }
  /* The last few seconds heard, and the running sample count where they start. */
  recentAudio(secs) {
    const all = join(this.recent);
    const n = Math.min(all.length, Math.round(secs * this.sr));
    return { x: all.subarray(all.length - n), start: (this.total || 0) - n };
  }
}
function join(list) {
  let n = 0;
  list.forEach((a) => { n += a.length; });
  const out = new Float32Array(n);
  let o = 0;
  list.forEach((a) => { out.set(a, o); o += a.length; });
  return out;
}

function labelOf(stream) {
  const t = stream && stream.getAudioTracks()[0];
  return (t && t.label) || '';
}
const HEADSET = /airpods|beats|headset|headphone|earpods|earbuds|bluetooth|hands-free|handsfree|wireless|buds|bose|sony|jabra|skullcandy|jbl|usb|lightning/i;
const BUILT_IN = /iphone|ipad|built-in|builtin|internal|front|back|bottom/i;
/* Is this the mic in a pair of headphones? */
export function isHeadset(label) { return !!label && HEADSET.test(label) && !BUILT_IN.test(label); }
async function findBuiltIn() {
  try {
    const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default');
    return all.find((d) => BUILT_IN.test(d.label) && !HEADSET.test(d.label)) || null;
  } catch (e) { return null; }
}

/* Lists the mics, once permission has been given (before that, names are blank). */
export async function listMics() {
  try {
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((d) => d.kind === 'audioinput');
  } catch (e) { return []; }
}
