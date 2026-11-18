/* Piano Coach: the screens and the teaching loop.
   why (one sentence) → watch (demo from your seat) → your turn → check by ear →
   one fix → 3 clean in a row → a cold check the next day. */
import { Mic, unlock, audioCtx, listMics } from './mic.js?v=0.2';
import { hearNotes, countStrikes, letter, noteName, toWav } from './ears.js?v=0.2';
import { gradeSeq, gradeHunt } from './grade.js?v=0.2';
import { playSteps, playNote, tick } from './synth.js?v=0.2';
import { keyboard } from './keys.js?v=0.2';
import { LESSON1, HEARING } from './lessons.js?v=0.2';

const VERSION = '0.2';
const app = document.getElementById('app');
const mic = new Mic();
const $ = (s, r) => (r || document).querySelector(s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const names = (ns) => (ns || []).map((n) => letter(n.m)).join(' ');
const fullNames = (ns) => (ns || []).map((n) => noteName(n.m)).join(' ');
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

/* ---------- saved progress ---------- */
function fresh() { return { v: 1, voice: true, micId: '', micLabel: '', chunks: {}, hearing: {}, log: [], cardSeen: false }; }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem('pc.v1'));
    if (s && s.v === 1) return Object.assign(fresh(), s);
  } catch (e) { /* start fresh */ }
  return fresh();
}
let S = load();
function save() { try { localStorage.setItem('pc.v1', JSON.stringify(S)); } catch (e) { /* private mode */ } }
function logIt(entry) {
  S.log.push(Object.assign({ at: new Date().toISOString() }, entry));
  if (S.log.length > 300) S.log = S.log.slice(-300);
  save();
}

/* ---------- the coach's voice ---------- */
let voice = null;
function pickVoice() {
  if (!window.speechSynthesis) return null;
  const vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
  for (const p of ['Samantha', 'Ava', 'Allison', 'Alex', 'Daniel', 'Google US English']) {
    const v = vs.find((x) => x.name.indexOf(p) >= 0);
    if (v) return v;
  }
  return vs.find((v) => /en-US/i.test(v.lang)) || vs[0] || null;
}
if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
function say(text, alive) {
  return new Promise((res) => {
    if (!S.voice || !window.speechSynthesis || (alive && !alive())) return res();
    try { speechSynthesis.cancel(); } catch (e) { /* fine */ }
    const u = new SpeechSynthesisUtterance(text);
    voice = voice || pickVoice();
    if (voice) u.voice = voice;
    u.rate = 1.04;
    let done = false;
    const fin = () => { if (!done) { done = true; res(); } };
    u.onend = fin;
    u.onerror = fin;
    setTimeout(fin, 1500 + text.length * 80);
    try { speechSynthesis.speak(u); } catch (e) { fin(); }
  });
}
function hush() { try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch (e) { /* fine */ } }

/* ---------- screens ---------- */
let token = 0;
let current = ['home', null];
function go(name, arg) {
  hush();
  mic.close();
  const my = ++token;
  const alive = () => my === token;
  current = [name, arg];
  window.scrollTo(0, 0);
  SCREENS[name](arg, alive);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { token++; hush(); mic.close(); } else go(current[0], current[1]);
});
function on(id, fn) { const e = document.getElementById(id); if (e) e.addEventListener('click', fn); }
function toast(msg) {
  let t = $('#toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.className = 'show';
  clearTimeout(toast.h);
  toast.h = setTimeout(() => { t.className = ''; }, 2600);
}
function standalone() { return window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches); }
function bar(label, backTo) {
  return '<header class="bar"><button class="back" id="back">‹ ' + (backTo === 'home' ? 'Home' : 'Back') + '</button><span class="muted">' + esc(label) + '</span></header>';
}

const SCREENS = {};

/* Home */
SCREENS.home = function () {
  const hDone = HEARING.filter((c) => S.hearing[c.id] && S.hearing[c.id].pass != null).length;
  const hPass = HEARING.filter((c) => S.hearing[c.id] && S.hearing[c.id].pass).length;
  const lc = LESSON1.chunks;
  const locked = lc.filter((c) => (S.chunks[c.id] || {}).lockedOn || (S.chunks[c.id] || {}).learned).length;
  const due = coldDue();
  const pip = (c) => { const s = S.chunks[c.id] || {}; return '<i class="pip ' + (s.learned ? 'learned' : s.lockedOn ? 'locked' : '') + '" title="' + esc(c.title) + '"></i>'; };
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  app.innerHTML =
    '<header class="top"><div><h1>Piano Coach</h1><p class="muted">Test version ' + VERSION + '</p></div><button class="icon" id="set" aria-label="Settings">⚙︎</button></header>' +
    (!standalone() && ios ? '<div class="tip">Put this on your Home Screen: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>. It opens like an app.</div>' : '') +
    (due.length ? '<section class="card big hot"><h2>Cold check</h2><p class="muted">Play what you locked in before, once, no warm-up. ' + due.length + ' to go.</p><button class="btn primary" id="goCold">Start cold check</button></section>' : '') +
    '<section class="card big"><h2>Hearing test</h2><p class="muted">' + (hDone ? hPass + ' of 4 passed' + (hDone < 4 ? ', ' + (4 - hDone) + ' left' : '') : '4 quick checks, about 10 minutes. Do this first.') + '</p><button class="btn ' + (hDone < 4 ? 'primary' : 'ghost') + '" id="goTest">' + (hDone === 4 ? 'See results' : hDone ? 'Continue' : 'Start') + '</button></section>' +
    '<section class="card big"><h2>' + esc(LESSON1.title) + '</h2><p class="muted">' + esc(LESSON1.sub) + '</p><div class="pips">' + lc.map(pip).join('') + '<span class="muted small">' + locked + ' of ' + lc.length + '</span></div><button class="btn ' + (hDone >= 1 ? 'primary' : 'ghost') + '" id="goLesson">' + (locked ? 'Continue' : 'Start') + '</button></section>' +
    '<section class="card"><div class="row between"><div><h3>Free play</h3><p class="muted small">Play anything and see what I hear.</p></div><button class="btn ghost" id="goListen">Open</button></div></section>' +
    '<footer class="foot muted small">Built for you in the Piano chat. Something off? Tell Claude there.</footer>';
  on('set', () => go('settings'));
  on('goTest', () => { unlock(); go(hDone === 4 ? 'testDone' : 'test'); });
  on('goLesson', () => { unlock(); go('lesson'); });
  on('goListen', () => { unlock(); go('listen'); });
  on('goCold', () => { unlock(); go('cold'); });
};

/* ---------- taking a take ---------- */
let lastTake = null;
function micError(host, e) {
  const name = e && e.name;
  let msg;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) msg = 'This browser can’t use the mic here. Open the link in Safari.';
  else if (name === 'NotAllowedError' || name === 'SecurityError') msg = 'The mic is blocked for this page. In Safari’s page menu, open Website Settings and set Microphone to Allow, then try again.';
  else if (name === 'NotFoundError') msg = 'I can’t find a mic on this device.';
  else msg = 'The mic didn’t start (' + (name || 'error') + '). Close any app that’s using the mic, then try again.';
  host.innerHTML = '<p class="warn">' + esc(msg) + '</p>';
}

/* Opens the mic, counts you in, listens until you're done, and hears the take.
   opt.expect: how many notes; opt.duet: {bpm, note} plays a note on every beat meanwhile. */
async function runTake(stage, opt, alive) {
  try {
    await unlock();
    await mic.open(S.micId);
  } catch (e) { micError(stage, e); return null; }
  if (!alive()) { mic.close(); return null; }
  if (mic.label && S.micLabel !== mic.label) { S.micLabel = mic.label; save(); }
  const sr = mic.sr;
  const micLine = mic.headset
    ? '<p class="warn small center">I’m stuck on your headphone mic, and it can’t hear the piano well. Take the headphones out for this one.</p>'
    : '<p class="muted center tiny">Mic: ' + esc(mic.label) + '</p>';
  mic.startTake();
  stage.innerHTML = '<div class="count" id="cnt">3</div><p class="muted center small">Hand in place. Eyes on your first key.</p>' + micLine;
  const cnt = $('#cnt', stage);
  let duetEnd = null;
  const bpm = opt.bpm || (opt.duet ? opt.duet.bpm : 60);
  if (opt.duet) {
    const beat = 60 / opt.duet.bpm;
    const c = audioCtx();
    const t0 = c.currentTime + 0.25;
    for (let k = 0; k < 3; k++) tick(t0 + k * beat, k === 0);
    for (let k = 0; k < opt.expect + 1; k++) playNote(opt.duet.note, t0 + (3 + k) * beat, beat * 0.85, 0.75);
    duetEnd = performance.now() + (0.25 + (3 + opt.expect + 1) * beat) * 1000;
    for (let k = 3; k >= 1; k--) { cnt.textContent = k; await wait(beat * 1000); if (!alive()) { mic.close(); return null; } }
  } else {
    // count in at the take's beat: three clicks you can hear, numbers you can see
    const beat = 60 / bpm;
    const c = audioCtx();
    const t0 = c.currentTime + 0.15;
    for (let k = 0; k < 3; k++) tick(t0 + k * beat, k === 0);
    await wait(150);
    for (let k = 3; k >= 1; k--) { cnt.textContent = k; await wait(beat * 1000); if (!alive()) { mic.close(); return null; } }
  }
  const floorDb = mic.floorDb();
  const goSec = mic.takeLen / sr;
  const goAt = performance.now();
  const dots = Array.from({ length: opt.expect }, () => '<i></i>').join('');
  stage.innerHTML = '<div class="pulse" id="pulse"><b>1</b><span class="muted small">Count in your head. One note per beat.</span></div>' +
    '<div class="dots" id="dots">' + dots + '<b id="more"></b></div><div class="meter"><i id="lvl"></i></div><button class="btn ghost" id="done">I’m done</button>' + micLine;
  // the beat on screen, 1-2-3 like a waltz, so you never have to count out loud
  const pulse = $('#pulse b', stage);
  const beatMs = 60000 / bpm;
  let lastBeat = -1;
  const beatTimer = setInterval(() => {
    if (!pulse.isConnected) { clearInterval(beatTimer); return; }
    const k = Math.floor((performance.now() - goAt) / beatMs);
    if (k === lastBeat) return;
    lastBeat = k;
    pulse.textContent = String((k % 3) + 1);
    pulse.className = k % 3 === 0 ? 'one' : '';
    void pulse.offsetWidth;
    pulse.classList.add('hit');
  }, 30);
  let stop = false;
  on('done', () => { stop = true; });
  const strikes = [];
  const dEls = Array.from(stage.querySelectorAll('#dots i'));
  const lvl = $('#lvl', stage);
  let lastCount = 0;
  while (!stop && alive()) {
    await wait(350);
    if (!alive()) break;
    lvl.style.width = Math.max(0, Math.min(100, (mic.level + 70) * 1.7)) + '%';
    const x = mic.takeSoFar();
    const secs = x.length / sr;
    const tail = x.subarray(Math.max(0, x.length - Math.round(3 * sr)));
    const off = (x.length - tail.length) / sr;
    countStrikes(tail, sr, floorDb).forEach((t) => {
      const at = t + off;
      if (at > secs - 0.08 || at < goSec - 0.3) return; // count-in clicks aren't notes
      if (!strikes.some((s) => Math.abs(s - at) < 0.1)) strikes.push(at);
    });
    strikes.sort((a, b) => a - b);
    if (strikes.length !== lastCount) {
      lastCount = strikes.length;
      dEls.forEach((d, k) => d.classList.toggle('on', k < strikes.length));
      const more = $('#more', stage);
      if (more) more.textContent = strikes.length > opt.expect ? '+' + (strikes.length - opt.expect) : '';
    }
    const last = strikes.length ? strikes[strikes.length - 1] : goSec;
    const quiet = secs - last;
    if (duetEnd) { if (performance.now() > duetEnd + 1200) break; continue; }
    if (strikes.length >= opt.expect && quiet > 1.4) break;
    if (strikes.length >= 1 && quiet > 4.5) break;
    if (!strikes.length && secs - goSec > 12) break;
    if (secs - goSec > opt.expect * 2.2 + 8) break;
  }
  clearInterval(beatTimer);
  if (!alive()) { mic.close(); return null; }
  const take = mic.stopTake();
  mic.close();
  stage.innerHTML = '<p class="listening center">Listening back…</p>';
  await wait(40);
  const an = hearNotes(take.x, take.sr, { floorDb });
  lastTake = { x: take.x, sr: take.sr, at: new Date().toISOString(), heard: fullNames(an.notes) };
  window.__pcTakeWav = () => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(toWav(take.x, take.sr)); });
  window.__pcLast = { heard: fullNames(an.notes) + ' @ ' + an.notes.map((n) => n.t.toFixed(2)).join(','), sr: take.sr, secs: Math.round(take.x.length / take.sr * 10) / 10, floorDb, quiet: an.quiet };
  stage.innerHTML = '';
  return { an, take, floorDb };
}

function chipsFor(g) {
  if (g.kind === 'seq') {
    return g.marks.map((mk, j) => {
      const cls = mk.ok ? 'ok' : (g.first && g.first.j === j ? 'bad' : 'meh');
      return '<span class="chip ' + cls + '">' + letter(mk.want) + '</span>';
    }).join('');
  }
  return (g.heard || []).map((n) => '<span class="chip ' + (n.ok ? 'ok' : n.ok === false ? 'bad' : 'meh') + '">' + letter(n.m) + '</span>').join('');
}
function resultBox(g, extra) {
  return '<div class="result ' + (g.clean ? 'good' : 'fix') + '"><div class="chips">' + chipsFor(g) + '</div><p class="verdict">' + esc(g.text) + '</p>' +
    (g.note ? '<p class="muted small">' + esc(g.note) + '</p>' : '') + (extra || '') + '</div>';
}

async function shareTake() {
  if (!lastTake) { toast('Play something first.'); return; }
  const blob = toWav(lastTake.x, lastTake.sr);
  const file = new File([blob], 'piano-take-' + lastTake.at.replace(/[:.]/g, '-') + '.wav', { type: 'audio/wav' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Piano take', text: 'Heard: ' + lastTake.heard });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied. Paste it to Claude in the Piano chat.'); return; } catch (e) { /* fall back */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.className = 'copybox';
  app.appendChild(ta);
  ta.select();
  toast('Select all and copy it.');
}

/* ---------- hearing test ---------- */
SCREENS.test = function (arg, alive) {
  let i = arg != null ? arg : HEARING.findIndex((c) => !S.hearing[c.id] || S.hearing[c.id].pass == null);
  if (i < 0) { go('testDone'); return; }
  const c = HEARING[i];
  app.innerHTML = bar('Hearing test · ' + (i + 1) + ' of 4', 'home') +
    '<section class="card"><h2>' + esc(c.title) + '</h2><p class="why">' + esc(c.why) + '</p><p class="task">' + esc(c.task) + '</p>' +
    '<div class="stage" id="stage"></div><div id="res"></div>' +
    '<div class="actions" id="acts"><button class="btn primary big" id="start">Start</button>' +
    '<button class="btn ghost" id="skip">' + (c.duet ? 'No headphones? Skip' : 'Skip this one') + '</button></div></section>' +
    '<p class="muted small center">Stand the phone on the music stand, screen facing you.</p>';
  on('back', () => go('home'));
  say(c.why, alive);
  on('skip', () => {
    S.hearing[c.id] = { pass: false, skipped: true, text: 'Skipped', heard: '', at: new Date().toISOString() };
    save();
    go('test', i + 1 < HEARING.length ? i + 1 : undefined);
  });
  on('start', async () => {
    hush();
    unlock();
    const acts = $('#acts');
    const res = $('#res');
    acts.hidden = true;
    res.innerHTML = '';
    const r = await runTake($('#stage'), { expect: c.E.length, bpm: 60, duet: c.duet ? { bpm: 60, note: 48 } : null }, alive);
    if (!alive()) return;
    if (!r) { acts.hidden = false; return; }
    const g = gradeSeq(r.an, c.E, c.fingers);
    let pass = c.wantMiss ? g.status === 'miss' : g.clean;
    let verdict;
    if (c.wantMiss) verdict = g.status === 'miss' ? 'Caught it. ' + g.text : (g.clean ? 'I didn’t catch a mistake in that one. If you really hit a wrong key, that’s a fail for me, not you.' : g.text);
    else verdict = g.clean ? 'Passed: I heard every note.' : g.text;
    if (c.duet && mic.label) verdict += ' Mic: ' + mic.label + (mic.headset ? ' (your headphone mic, which can’t hear the piano well).' : '.');
    const rec = { pass, status: g.status, text: verdict, heard: fullNames(r.an.notes), at: new Date().toISOString(), mic: S.micLabel };
    if (g.note) rec.note = g.note;
    S.hearing[c.id] = rec;
    save();
    logIt({ k: 'hearing', id: c.id, pass, status: g.status, heard: rec.heard });
    // the raw list can include stray sounds the grading already threw out, so only show it when it helps
    const heardLine = (!pass || c.wantMiss) ? '<p class="muted small">What I heard: ' + esc(names(r.an.notes) || 'nothing') + '</p>' : '';
    res.innerHTML = '<div class="result ' + (pass ? 'good' : 'fix') + '"><div class="chips">' + chipsFor(g) + '</div><p class="verdict">' + esc(verdict) + '</p>' + (g.note ? '<p class="muted small">' + esc(g.note) + '</p>' : '') + heardLine + '</div>';
    say(pass ? (c.wantMiss ? 'Caught it.' : 'Passed.') : verdict, alive);
    const nextBtns = '<div class="actions"><button class="btn ghost" id="again">Try again</button><button class="btn primary" id="next">' + (i + 1 < HEARING.length ? 'Next check' : 'See results') + '</button></div>' +
      '<button class="link" id="send">Send this take to Claude</button>';
    if (c.duet) {
      res.insertAdjacentHTML('beforeend', '<div class="ask"><p>Did my notes sound clean in your headphones, with no crackle?</p><div class="actions"><button class="btn ghost" data-q="clean" data-a="no">No</button><button class="btn ghost" data-q="clean" data-a="yes">Yes</button></div>' +
        '<p>Did they line up with your playing, with no delay?</p><div class="actions"><button class="btn ghost" data-q="time" data-a="no">No</button><button class="btn ghost" data-q="time" data-a="yes">Yes</button></div></div>');
      const answers = {};
      res.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => {
        answers[b.dataset.q] = b.dataset.a;
        res.querySelectorAll('[data-q="' + b.dataset.q + '"]').forEach((x) => x.classList.toggle('picked', x === b));
        if (answers.clean && answers.time) {
          rec.answers = answers;
          rec.pass = pass && answers.clean === 'yes' && answers.time === 'yes';
          S.hearing[c.id] = rec;
          save();
          if (!$('#next')) res.insertAdjacentHTML('beforeend', nextBtns);
          bindNext();
        }
      }));
    } else {
      res.insertAdjacentHTML('beforeend', nextBtns);
      bindNext();
    }
    function bindNext() {
      on('again', () => go('test', i));
      on('next', () => go(i + 1 < HEARING.length ? 'test' : 'testDone', i + 1 < HEARING.length ? i + 1 : undefined));
      on('send', shareTake);
    }
  });
};

function testReport() {
  const lines = ['Piano Coach hearing test (v' + VERSION + ', ' + todayStr() + ')'];
  HEARING.forEach((c, i) => {
    const r = S.hearing[c.id];
    if (!r) { lines.push((i + 1) + ' ' + c.title + ': not done'); return; }
    let l = (i + 1) + ' ' + c.title + ': ' + (r.skipped ? 'SKIPPED' : r.pass ? 'PASS' : 'FAIL') + ' | heard: ' + (r.heard || '-') + ' | ' + r.text;
    if (r.note) l += ' | ' + r.note;
    if (r.answers) l += ' | clean sound: ' + r.answers.clean + ', on time: ' + r.answers.time;
    lines.push(l);
  });
  let sr = '?';
  try { sr = audioCtx().sampleRate; } catch (e) { /* fine */ }
  lines.push('Mic: ' + (S.micLabel || '?') + ' | ' + sr + ' Hz | ' + (standalone() ? 'home screen app' : 'in the browser') + ' | ' + navigator.userAgent);
  return lines.join('\n');
}
SCREENS.testDone = function (arg, alive) {
  const rows = HEARING.map((c, i) => {
    const r = S.hearing[c.id] || {};
    const badge = r.skipped ? '<span class="badge meh">Skipped</span>' : r.pass ? '<span class="badge ok">Pass</span>' : (r.pass === false ? '<span class="badge bad">Fail</span>' : '<span class="badge meh">Not done</span>');
    return '<li><div><b>' + (i + 1) + '. ' + esc(c.title) + '</b><p class="muted small">' + esc(r.text || '') + '</p></div>' + badge + '</li>';
  }).join('');
  const all = HEARING.every((c) => S.hearing[c.id] && S.hearing[c.id].pass);
  app.innerHTML = bar('Hearing test results', 'home') +
    '<section class="card"><h2>' + (all ? 'I can hear you.' : 'Here’s how I did') + '</h2><ul class="results">' + rows + '</ul>' +
    '<p class="muted small">Copy these and paste them to Claude in the Piano chat. That’s how the ears get tuned to your piano.</p>' +
    '<div class="actions"><button class="btn primary" id="copy">Copy results for Claude</button></div>' +
    '<div class="actions"><button class="btn ghost" id="send">Send my last take</button><button class="btn ghost" id="redo">Redo a check</button></div>' +
    '<div class="actions"><button class="btn primary" id="lesson">Go to Lesson 1</button></div></section>';
  on('back', () => go('home'));
  on('copy', () => copyText(testReport()));
  on('send', shareTake);
  on('redo', () => go('test', 0));
  on('lesson', () => { unlock(); go('lesson'); });
  say(all ? 'All four passed. I can hear you.' : 'Here’s how I did. Copy the results for Claude.', alive);
};

/* ---------- Lesson 1 ---------- */
/* What to ask when a take didn't come out clean: what it heard, as a question, so you make the call. */
function askLine(g, ch) {
  const f = g.first || {};
  const prev = f.j > 0 && g.E ? letter(g.E[f.j - 1]) : null;
  if (g.kind === 'hunt') {
    if (g.status === 'unfinished') return 'I only caught ' + (g.hits || 0) + ' of your ' + letter(g.p) + '’s. Did you play all ' + g.n + '?';
    if (f.got != null) return 'I heard ' + letter(f.got) + ' in there. Did you hit a key that wasn’t ' + letter(g.p) + '?';
    return 'I couldn’t tell for sure. Was that clean?';
  }
  if (f.kind === 'sub') return 'I heard ' + letter(f.got) + ' where ' + letter(f.want) + ' goes. Did you miss that one?';
  if (f.kind === 'skip') return 'I didn’t catch ' + letter(f.want) + (prev ? ' after ' + prev : '') + '. Did you play it?';
  if (f.kind === 'extra') return 'I heard an extra ' + letter(f.got) + (f.j > 0 && g.E ? ' after ' + letter(g.E[f.j - 1]) : '') + '. Did you hit an extra key?';
  if (g.status === 'unfinished') return 'It sounded like you stopped after ' + (prev || 'a few notes') + '. Did you play it all the way through?';
  if (g.status === 'few') return 'I only caught a few notes. Was that clean?';
  return 'I couldn’t tell for sure. Was that clean?';
}
function chunkState(id) {
  if (!S.chunks[id]) S.chunks[id] = { streak: 0, tries: 0, misses: {}, guide: false };
  return S.chunks[id];
}
function demoSteps(ch) {
  if (ch.kind === 'hunt') return ch.demo.map((n, k) => ({ n, lab: [ch.labels[k]], cls: [ch.cls] }));
  return ch.E.map((m, k) => {
    if (ch.hand === 'B') return { n: [ch.left[k], m], lab: [ch.leftFingers[k], ch.fingers[k]], cls: ['lh', 'rh'] };
    return { n: [m], lab: [ch.fingers[k]], cls: [ch.hand === 'L' ? 'lh' : 'rh'] };
  });
}
async function demo(ch, kb, alive, from, to) {
  await unlock();
  const steps = demoSteps(ch).slice(from || 0, to == null ? undefined : to);
  kb.clear();
  const c = audioCtx();
  const { times, end } = playSteps(steps.map((s) => ({ n: s.n })), ch.bpm || 80, 0.35);
  for (let k = 0; k < steps.length; k++) {
    const dt = times[k].t - c.currentTime;
    if (dt > 0) await wait(dt * 1000);
    if (!alive()) return;
    kb.clear();
    steps[k].n.forEach((m, q) => kb.light(m, steps[k].cls[q], steps[k].lab[q]));
  }
  await wait(Math.max(0, (end - c.currentTime) * 1000));
  if (alive()) kb.clear();
}
function guide(ch, kb) {
  kb.clear();
  demoSteps(ch).forEach((s) => s.n.forEach((m, q) => kb.light(m, s.cls[q], s.lab[q])));
}
function streakDots(n) {
  return [0, 1, 2].map((k) => '<i class="' + (k < n ? 'on' : '') + '"></i>').join('') + '<span class="muted small">' + Math.min(n, 3) + ' of 3 clean in a row</span>';
}

SCREENS.lesson = function (arg, alive) {
  if (!S.cardSeen) { mapCard(alive); return; }
  const i = arg != null ? arg : LESSON1.chunks.findIndex((c) => { const s = S.chunks[c.id]; return !(s && (s.lockedOn || s.learned)); });
  if (i < 0) { lessonDone(alive); return; }
  chunkScreen(i, alive);
};
function mapCard(alive) {
  const cd = LESSON1.card;
  app.innerHTML = bar(LESSON1.title, 'home') +
    '<section class="card lesson"><h2>' + esc(cd.title) + '</h2>' + cd.lines.map((l) => '<p>' + esc(l) + '</p>').join('') +
    '<div class="kbwrap" id="kb"></div><div class="actions"><button class="btn primary big" id="got">Got it</button></div></section>';
  const kb = keyboard($('#kb'), cd.kb[0], cd.kb[1], { letters: 'none' });
  cd.marks.forEach(([m, lab, cls]) => kb.light(m, cls, lab));
  on('back', () => go('home'));
  say('Black keys come in groups of two and three. They’re your map. C is just left of the two, and D is right between them.', alive);
  on('got', () => { S.cardSeen = true; save(); unlock(); go('lesson'); });
}
function chunkScreen(i, alive) {
  const ch = LESSON1.chunks[i];
  const N = LESSON1.chunks.length;
  const st = chunkState(ch.id);
  app.innerHTML = bar((i + 1) + ' of ' + N + ' · ' + ch.title, 'home') +
    '<section class="card lesson"><p class="why">' + esc(ch.why) + '</p>' +
    '<div class="kbwrap" id="kb"></div>' +
    '<p class="task">' + esc(ch.task) + '</p>' +
    '<div class="streak" id="streak">' + streakDots(st.streak) + '</div>' +
    '<div class="stage" id="stage"></div><div id="res"></div>' +
    '<div class="actions" id="acts"><button class="btn ghost" id="watch">Watch again</button><button class="btn primary big" id="turn">My turn</button></div>' +
    '<p class="muted small center hint">No sound? Turn off silent mode and turn the volume up.</p></section>';
  const kb = keyboard($('#kb'), ch.kb[0], ch.kb[1], { letters: 'c' });
  on('back', () => go('home'));
  const acts = $('#acts');
  const res = $('#res');
  const stage = $('#stage');
  let busy = false;
  const lock = async (fn) => { if (busy) return; busy = true; try { await fn(); } finally { busy = false; } };
  // why, then watch, straight away
  (async () => {
    acts.classList.add('dim');
    await say(ch.why, alive);
    if (!alive()) return;
    await demo(ch, kb, alive);
    if (alive()) { acts.classList.remove('dim'); if (st.guide) guide(ch, kb); }
  })();
  on('watch', () => lock(async () => { hush(); res.innerHTML = ''; await demo(ch, kb, alive); if (alive() && st.guide) guide(ch, kb); }));
  on('turn', () => lock(() => takeTurn()));
  async function takeTurn() {
    hush();
    unlock();
    acts.hidden = true;
    res.innerHTML = '';
    if (st.guide) guide(ch, kb); else kb.clear();
    const r = await runTake(stage, { expect: ch.kind === 'hunt' ? ch.n : ch.E.length, bpm: ch.bpm }, alive);
    if (!alive()) return;
    if (!r) { acts.hidden = false; return; }
    const g = ch.kind === 'hunt' ? gradeHunt(r.an, ch.p, ch.n) : gradeSeq(r.an, ch.E, ch.fingers);
    if (window.__pcLast && g.marks) window.__pcLast.marks = g.marks.map((mk) => noteName(mk.want) + (mk.ok ? '+' : '-') + mk.how + (mk.ev != null ? mk.ev : '')).join(' ');
    st.tries = (st.tries || 0) + 1;
    logIt({ k: 'take', chunk: ch.id, status: g.status, heard: fullNames(r.an.notes) });
    if (g.clean) { countClean(); return; }
    if (g.status === 'nothing') {
      // nothing heard is a mic problem, not a playing problem: don't ask, don't count it
      res.innerHTML = resultBox(g) + '<div class="actions"><button class="btn primary big" id="again">Try again</button></div>';
      say(g.text, alive);
      on('again', () => lock(() => takeTurn()));
      return;
    }
    // Ask, don't accuse: show what was heard and let you make the call.
    res.innerHTML = '<div class="result ask"><div class="chips">' + chipsFor(g) + '</div><p class="verdict">' + esc(askLine(g, ch)) + '</p>' +
      '<div class="actions"><button class="btn ghost" id="aMiss">I missed it</button><button class="btn primary" id="aClean">It was clean</button></div>' +
      '<p class="muted tiny center">Be honest. It only helps if you are.</p></div>';
    say(askLine(g, ch), alive);
    on('aClean', () => {
      logIt({ k: 'override', chunk: ch.id, heard: fullNames(r.an.notes), said: g.text });
      toast('Counted. That take helps me tune my ears to your piano.');
      countClean();
    });
    on('aMiss', () => { hush(); showFix(); });

    function countClean() {
      st.streak = (st.streak || 0) + 1;
      st.misses = {};
      if (st.guide) st.guide = false;
      save();
      $('#streak').innerHTML = streakDots(st.streak);
      if (st.streak >= 3) { lockIn(); return; }
      kb.clear();
      res.innerHTML = '<div class="result good"><div class="chips">' + (g.clean ? chipsFor(g) : '') + '</div><p class="verdict">Clean. ' + st.streak + ' of 3.</p></div>' +
        '<div class="actions"><button class="btn primary big" id="again">Again</button></div>';
      say('Clean. ' + st.streak + ' of 3.', alive);
      on('again', () => lock(() => takeTurn()));
    }
    function showFix() {
      st.streak = 0;
      const spot = g.first && g.first.j != null ? String(g.first.j) : (g.status || 'x');
      st.misses[spot] = (st.misses[spot] || 0) + 1;
      save();
      $('#streak').innerHTML = streakDots(st.streak);
      const n = st.misses[spot];
      // show the fix on the keys: the right key in your hand's colour, the one you hit in red
      if (g.first && g.first.want != null && ch.kind !== 'hunt') {
        kb.clear();
        const j0 = g.first.j;
        if (g.first.kind === 'sub' && g.first.got != null) {
          const got = kb.has(g.first.got) ? g.first.got : g.first.got - 12 * Math.round((g.first.got - g.first.want) / 12);
          if (kb.has(got) && got !== g.first.want) kb.light(got, 'bad', '✕');
        }
        kb.light(g.first.want, ch.hand === 'L' ? 'lh' : 'rh', ch.fingers && j0 != null ? ch.fingers[j0] : '');
      }
      let extra = '';
      if (n >= 3 && !st.guide) { st.guide = true; save(); extra = '<p class="muted small">New way: this time the keys stay lit while you play.</p>'; }
      res.innerHTML = resultBox(g, extra) +
        '<div class="actions"><button class="btn ghost" id="spot">Show me that spot</button><button class="btn primary big" id="again">Try again</button></div>' +
        '<div class="row center"><button class="link" id="send">Send this take to Claude</button></div>';
      on('again', () => lock(() => takeTurn()));
      on('send', shareTake);
      const j = g.first && g.first.j != null ? g.first.j : null;
      const spotDemo = async () => {
        if (j == null || ch.kind === 'hunt') await demo(ch, kb, alive);
        else {
          const len = ch.E.length;
          await demo(ch, kb, alive, Math.max(0, j - 2), Math.min(len, j + 2));
          if (!alive()) return;
          await wait(400);
          await demo(ch, kb, alive);
        }
        if (alive() && st.guide) guide(ch, kb);
      };
      on('spot', () => lock(spotDemo));
      (async () => {
        await say(g.text, alive);
        if (!alive()) return;
        if (n === 2) await lock(spotDemo); // a second miss at the same spot gets a fresh demo, not more talk
      })();
    }
  }
  function lockIn() {
    st.lockedOn = todayStr();
    st.guide = false;
    save();
    logIt({ k: 'locked', chunk: ch.id });
    const next = LESSON1.chunks[i + 1];
    res.innerHTML = '<div class="result good"><p class="verdict">Locked in: 3 clean in a row.</p><p class="muted small">Tomorrow you’ll play it once, cold, to prove it stuck.</p></div>' +
      '<div class="actions"><button class="btn primary big" id="nx">' + (next ? 'Next: ' + esc(next.title) : 'Finish') + '</button></div>';
    acts.hidden = true;
    say('Locked in. Three clean in a row.', alive);
    on('nx', () => { unlock(); go('lesson', next ? i + 1 : undefined); });
  }
}
function lessonDone(alive) {
  app.innerHTML = bar(LESSON1.title, 'home') +
    '<section class="card"><h2>Lesson 1 is locked in.</h2><p>Tomorrow starts with a cold check: each piece once, no warm-up. That’s the real test of whether it stuck.</p>' +
    '<div class="actions"><button class="btn ghost" id="redo">Practice a piece again</button><button class="btn primary" id="home">Home</button></div></section>';
  on('back', () => go('home'));
  on('home', () => go('home'));
  on('redo', () => go('pick'));
  say('Lesson one is locked in. Tomorrow starts with a cold check.', alive);
}
SCREENS.pick = function () {
  app.innerHTML = bar('Practice a piece', 'home') + '<section class="card"><ul class="results">' +
    LESSON1.chunks.map((c, i) => '<li><b>' + esc(c.title) + '</b><button class="btn ghost" data-i="' + i + '">Practice</button></li>').join('') + '</ul></section>';
  on('back', () => go('home'));
  app.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { unlock(); chunkScreen(+b.dataset.i, (() => { const my = ++token; current = ['lesson', +b.dataset.i]; return () => my === token; })()); }));
};

/* ---------- cold check ---------- */
function coldDue() {
  const t = todayStr();
  return LESSON1.chunks.filter((c) => { const s = S.chunks[c.id]; return s && s.lockedOn && s.lockedOn < t && !s.learned && s.coldOn !== t; });
}
SCREENS.cold = function (arg, alive) {
  const due = coldDue();
  if (!due.length) { go('home'); return; }
  const ch = due[0];
  const st = chunkState(ch.id);
  app.innerHTML = bar('Cold check · ' + due.length + ' left', 'home') +
    '<section class="card"><h2>' + esc(ch.title) + '</h2><p class="why">One try. No demo, no warm-up. This is how we know it stuck.</p><p class="task">' + esc(ch.task) + '</p>' +
    '<div class="stage" id="stage"></div><div id="res"></div><div class="actions" id="acts"><button class="btn primary big" id="go">Go</button></div></section>';
  on('back', () => go('home'));
  on('go', async () => {
    unlock();
    $('#acts').hidden = true;
    const r = await runTake($('#stage'), { expect: ch.kind === 'hunt' ? ch.n : ch.E.length, bpm: ch.bpm }, alive);
    if (!alive()) return;
    if (!r) { $('#acts').hidden = false; return; }
    const g = ch.kind === 'hunt' ? gradeHunt(r.an, ch.p, ch.n) : gradeSeq(r.an, ch.E, ch.fingers);
    logIt({ k: 'cold', chunk: ch.id, status: g.status, heard: fullNames(r.an.notes) });
    const finish = (clean, howHeard) => {
      st.coldOn = todayStr();
      if (clean) { st.learned = true; } else { st.lockedOn = null; st.streak = 0; }
      save();
      $('#res').innerHTML = '<div class="result ' + (clean ? 'good' : 'fix') + '"><div class="chips">' + chipsFor(g) + '</div><p class="verdict">' + (clean ? 'It stuck. That one’s yours.' : 'Didn’t stick yet, and that’s normal. It’s back on today’s list.') + '</p>' + (howHeard || '') + '</div>' +
        '<div class="actions"><button class="btn primary big" id="nx">' + (coldDue().length ? 'Next' : 'Done') + '</button></div>';
      say(clean ? 'It stuck.' : 'Not yet. It goes back on the list.', alive);
      on('nx', () => go(coldDue().length ? 'cold' : 'home'));
    };
    if (g.clean) { finish(true); return; }
    if (g.status === 'nothing') {
      $('#res').innerHTML = resultBox(g) + '<div class="actions"><button class="btn primary big" id="again2">Try again</button></div>';
      on('again2', () => go('cold'));
      return;
    }
    $('#res').innerHTML = '<div class="result ask"><div class="chips">' + chipsFor(g) + '</div><p class="verdict">' + esc(askLine(g, ch)) + '</p>' +
      '<div class="actions"><button class="btn ghost" id="aMiss">I missed it</button><button class="btn primary" id="aClean">It was clean</button></div>' +
      '<p class="muted tiny center">Be honest. It only helps if you are.</p></div>';
    say(askLine(g, ch), alive);
    on('aClean', () => { logIt({ k: 'override', chunk: ch.id, cold: true, heard: fullNames(r.an.notes), said: g.text }); finish(true); });
    on('aMiss', () => finish(false));
  });
};

/* ---------- free play ---------- */
SCREENS.listen = function (arg, alive) {
  app.innerHTML = bar('Free play', 'home') +
    '<section class="card"><div class="now" id="now">–</div><div class="kbwrap" id="kb"></div><div class="meter"><i id="lvl"></i></div>' +
    '<div class="chips" id="hist"></div><p class="muted small">One note at a time works best. Two keys at once show as one note for now.</p>' +
    '<div class="stage" id="stage"></div><div class="actions"><button class="btn primary big" id="startL">Start listening</button></div></section>';
  on('back', () => go('home'));
  const kb = keyboard($('#kb'), 48, 84, { letters: 'c' });
  on('startL', async () => {
    const btn = $('#startL');
    if (mic.on) { mic.close(); btn.textContent = 'Start listening'; return; }
    try { await unlock(); await mic.open(S.micId); } catch (e) { micError($('#stage'), e); return; }
    if (mic.label && S.micLabel !== mic.label) { S.micLabel = mic.label; save(); }
    btn.textContent = 'Stop';
    await wait(700);
    const floorDb = mic.floorDb();
    let lastAbs = -1;
    const hist = $('#hist');
    while (alive() && mic.on) {
      const lvl = $('#lvl');
      if (lvl) lvl.style.width = Math.max(0, Math.min(100, (mic.level + 70) * 1.7)) + '%';
      const { x, start } = mic.recentAudio(3);
      const an = hearNotes(x, mic.sr, { floorDb });
      const len = x.length / mic.sr;
      an.notes.forEach((n) => {
        const abs = start / mic.sr + n.t;
        if (n.t > len - 0.35 || abs <= lastAbs + 0.09) return;
        lastAbs = abs;
        $('#now').textContent = letter(n.m);
        kb.clear();
        if (kb.has(n.m)) kb.light(n.m, 'on', letter(n.m));
        hist.insertAdjacentHTML('afterbegin', '<span class="chip ok">' + letter(n.m) + '</span>');
        while (hist.children.length > 24) hist.lastChild.remove();
      });
      await wait(450);
    }
  });
};

/* ---------- settings ---------- */
SCREENS.settings = function (arg, alive) {
  app.innerHTML = bar('Settings', 'home') +
    '<section class="card"><div class="row between"><div><h3>Coach’s voice</h3><p class="muted small">Reads the why and the fixes out loud.</p></div><button class="btn ghost" id="voice">' + (S.voice ? 'On' : 'Off') + '</button></div></section>' +
    '<section class="card"><h3>Microphone</h3><p class="muted small">Last used: ' + esc(S.micLabel || 'not yet') + '</p><select id="mics"><option value="">Automatic: the iPhone’s own mic</option></select><button class="link" id="loadMics">Show all mics</button></section>' +
    '<section class="card"><h3>Speaker check</h3><div class="actions"><button class="btn ghost" id="spk">Play a chord</button></div></section>' +
    '<section class="card"><h3>For Claude</h3><div class="actions"><button class="btn ghost" id="copyLog">Copy my progress</button><button class="btn ghost" id="send">Send my last take</button></div></section>' +
    '<section class="card"><h3>Start over</h3><button class="btn ghost danger" id="reset">Reset all progress</button></section>' +
    '<p class="muted small center">Piano Coach test version ' + VERSION + '</p>';
  on('back', () => go('home'));
  on('voice', () => { S.voice = !S.voice; save(); $('#voice').textContent = S.voice ? 'On' : 'Off'; if (S.voice) say('Voice on.'); else hush(); });
  const sel = $('#mics');
  const fill = async () => {
    const ms = await listMics();
    sel.innerHTML = '<option value="">Automatic: the iPhone’s own mic</option>' + ms.filter((m) => m.deviceId && m.deviceId !== 'default').map((m) => '<option value="' + esc(m.deviceId) + '">' + esc(m.label || 'Mic') + '</option>').join('');
    sel.value = S.micId || '';
  };
  fill();
  sel.addEventListener('change', () => { S.micId = sel.value; save(); toast('Mic saved.'); });
  on('loadMics', async () => { try { await mic.open(''); mic.close(); } catch (e) { toast('Allow the mic first.'); } fill(); });
  on('spk', async () => { await unlock(); const c = audioCtx(); [60, 64, 67, 72].forEach((m) => playNote(m, c.currentTime + 0.05, 1.2)); });
  on('copyLog', () => copyText(JSON.stringify({ v: VERSION, chunks: S.chunks, hearing: S.hearing, log: S.log.slice(-60), mic: S.micLabel, ua: navigator.userAgent })));
  on('send', shareTake);
  let armed = false;
  on('reset', () => {
    const b = $('#reset');
    if (!armed) { armed = true; b.textContent = 'Tap again to erase everything'; setTimeout(() => { armed = false; if (b.isConnected) b.textContent = 'Reset all progress'; }, 4000); return; }
    const keep = { voice: S.voice, micId: S.micId };
    S = Object.assign(fresh(), keep);
    save();
    toast('Progress reset.');
    go('home');
  });
};

go('home');
