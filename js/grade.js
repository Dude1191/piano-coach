/* Piano Coach grading.
   Rule one: quick to confirm, slow to accuse. A phone hears right notes far more reliably than
   it catches wrong ones, so before calling a note wrong it double-checks the audio for the note
   that was expected, and before calling a note skipped it searches the gap for it. */
import { pc, letter, evidence, searchGap } from './ears.js';

const ACCEPT = 0.6; // the expected note at least this clearly struck where another was heard: count it
const REACH = 8; // a stray sound more than this many keys outside the exercise isn't held against him

export const HINT = {
  0: 'C is just left of the two black keys.',
  1: 'C♯ is the left one of the two black keys.',
  2: 'D is right between the two black keys.',
  3: 'E♭ is the right one of the two black keys.',
  4: 'E is just right of the two black keys.',
  5: 'F is just left of the three black keys.',
  6: 'F♯ is the first of the three black keys.',
  7: 'G is in the first gap of the three black keys.',
  8: 'A♭ is the middle one of the three black keys.',
  9: 'A is in the second gap of the three black keys.',
  10: 'B♭ is the last of the three black keys.',
  11: 'B is just right of the three black keys.'
};

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* Lines up what was heard with what was expected. Stray notes before the start and after the
   end are nearly free, so a warm-up key or a bump at the end doesn't ruin a good take. */
function alignTake(H, E, outside) {
  const n = H.length;
  const m = E.length;
  const a = H.map((h) => pc(h.m));
  const b = E.map(pc);
  const LEAD = 0.15;
  const D = [];
  const P = [];
  for (let i = 0; i <= n; i++) { D.push(new Float64Array(m + 1)); P.push(new Int8Array(m + 1)); }
  for (let i = 1; i <= n; i++) { D[i][0] = i * LEAD; P[i][0] = 3; }
  for (let i = 0; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = Infinity;
      let p = 0;
      if (i) { const c = D[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1); if (c < best) { best = c; p = 0; } }
      if (i) {
        let cx = 1;
        if (i > 1 && a[i - 1] === a[i - 2]) cx = 0.1; // the same key twice, or one strike heard twice
        else if (outside(H[i - 1])) cx = 0.2;
        const c = D[i - 1][j] + cx;
        if (c < best) { best = c; p = 1; }
      }
      { const c = D[i][j - 1] + (j > 1 && b[j - 1] === b[j - 2] ? 0.3 : 1); if (c < best) { best = c; p = 2; } }
      D[i][j] = best;
      P[i][j] = p;
    }
  }
  // trailing strays after the last expected note are nearly free too
  let endI = n;
  let bestEnd = Infinity;
  for (let i = 0; i <= n; i++) { const c = D[i][m] + (n - i) * LEAD; if (c < bestEnd - 1e-9) { bestEnd = c; endI = i; } }
  const ops = [];
  for (let i = n; i > endI; i--) ops.push({ t: 'trail', i: i - 1 });
  let i = endI;
  let j = m;
  while (i > 0 || j > 0) {
    if (j === 0) { ops.push({ t: 'lead', i: i - 1 }); i--; continue; }
    const p = P[i][j];
    if (p === 0) { ops.push({ t: a[i - 1] === b[j - 1] ? 'm' : 's', i: i - 1, j: j - 1 }); i--; j--; }
    else if (p === 1) { ops.push({ t: 'x', i: i - 1, j }); i--; }
    else { ops.push({ t: 'd', i, j: j - 1 }); j--; }
  }
  ops.reverse();
  return ops;
}

/* Grades one take of a fixed sequence (pitch and order; the octave isn't held against him yet). */
export function gradeSeq(an, E, fingers) {
  fingers = fingers || [];
  const out = { kind: 'seq', E, marks: E.map((m) => ({ want: m, got: null, t: null, ok: false, how: '' })), extras: [], voice: 0, heard: an.notes || [] };
  if (an.quiet || !an.notes || !an.notes.length) {
    out.status = 'nothing';
    out.clean = false;
    out.text = 'I didn’t hear any notes. Stand the phone on the piano’s music stand and play each key firmly.';
    return out;
  }
  const H = an.notes;
  const lo = Math.min(...E) - REACH;
  const hi = Math.max(...E) + REACH;
  const outside = (n) => n.m < lo || n.m > hi;
  const ops = alignTake(H, E, outside);
  // fill in marks
  ops.forEach((o) => {
    if (o.t === 'm') Object.assign(out.marks[o.j], { got: H[o.i].m, t: H[o.i].t, ok: true, how: 'heard' });
    else if (o.t === 's') Object.assign(out.marks[o.j], { got: H[o.i].m, t: H[o.i].t, ok: false, how: 'sub' });
    else if (o.t === 'x') {
      if (outside(H[o.i])) out.voice++;
      else if (!(o.i > 0 && pc(H[o.i].m) === pc(H[o.i - 1].m))) out.extras.push({ after: o.j - 1, got: H[o.i].m, t: H[o.i].t });
    }
  });
  // slow to accuse, part 1: a "wrong" note where the expected one is clearly sounding counts
  out.marks.forEach((mk) => {
    if (mk.how !== 'sub') return;
    const ev = evidence(an, mk.t, mk.want);
    mk.ev = Math.round(ev * 100) / 100;
    if (ev >= ACCEPT) { mk.ok = true; mk.how = 'evidence'; }
  });
  // part 2: a "skipped" note gets searched for between its neighbours (or, at the end, between
  // the last note heard and the end of the take), in order, so each find narrows the next gap
  out.marks.forEach((mk, idx) => {
    if (mk.how !== '') return;
    let t0 = 0;
    for (let q = idx - 1; q >= 0; q--) if (out.marks[q].t != null) { t0 = out.marks[q].t; break; }
    let t1 = an.secs;
    for (let q = idx + 1; q < out.marks.length; q++) if (out.marks[q].t != null) { t1 = out.marks[q].t; break; }
    const f = searchGap(an, t0, t1, mk.want);
    if (f) Object.assign(mk, { got: f.m, t: f.t, ok: true, how: 'found' });
  });
  // what's left
  const unheardTail = (() => { let k = 0; for (let q = out.marks.length - 1; q >= 0 && out.marks[q].how === ''; q--) k++; return k; })();
  const firstBad = out.marks.findIndex((mk) => !mk.ok);
  const okCount = out.marks.filter((mk) => mk.ok).length;
  out.okCount = okCount;
  const fing = (j) => (fingers[j] ? ' (finger ' + fingers[j] + ')' : '');
  const prevName = (j) => (j > 0 ? letter(E[j - 1]) : null);
  if (okCount < Math.ceil(E.length / 3) && H.length < E.length / 2) {
    out.status = 'few';
    out.clean = false;
    out.text = 'I only caught ' + H.length + ' note' + (H.length === 1 ? '' : 's') + '. Play each key firmly, and keep the phone close to the piano.';
    return out;
  }
  if (firstBad < 0 && !out.extras.length) {
    out.status = 'clean';
    out.clean = true;
    out.text = 'Clean.';
    if (out.voice) out.note = 'I ignored ' + plural(out.voice, 'sound that wasn’t', 'sounds that weren’t') + ' part of it.';
    return out;
  }
  out.clean = false;
  // the first problem, in playing order
  const firstExtra = out.extras.length ? out.extras[0] : null;
  const extraFirst = firstExtra && (firstBad < 0 || firstExtra.after < firstBad);
  if (extraFirst) {
    const j = firstExtra.after;
    out.status = 'miss';
    out.first = { j: j + 1, kind: 'extra', got: firstExtra.got };
    out.text = 'There’s an extra ' + letter(firstExtra.got) + (j >= 0 ? ' after ' + letter(E[j]) : ' at the start') + '. One key per finger, then move on.';
    return out;
  }
  const mk = out.marks[firstBad];
  if (unheardTail > 0 && firstBad === E.length - unheardTail && unheardTail < E.length) {
    out.status = 'unfinished';
    out.first = { j: firstBad, kind: 'unfinished', want: mk.want };
    out.text = 'You stopped after ' + letter(E[firstBad - 1]) + '. Keep going all the way to the last ' + letter(E[E.length - 1]) + '.';
    return out;
  }
  out.status = 'miss';
  if (mk.how === 'sub') {
    out.first = { j: firstBad, kind: 'sub', want: mk.want, got: mk.got };
    out.text = 'Note ' + (firstBad + 1) + ' should be ' + letter(mk.want) + fing(firstBad) + '. I heard ' + letter(mk.got) + '. ' + HINT[pc(mk.want)];
  } else {
    out.first = { j: firstBad, kind: 'skip', want: mk.want };
    out.text = 'I didn’t catch ' + letter(mk.want) + fing(firstBad) + (prevName(firstBad) ? ' after ' + prevName(firstBad) : ' at the start') + '. If you played it, hit it a little firmer.';
  }
  return out;
}

/* Grades "play n different keys of pitch class p". */
export function gradeHunt(an, p, n) {
  const out = { kind: 'hunt', p, n, heard: an.notes || [] };
  if (an.quiet || !an.notes || !an.notes.length) {
    out.status = 'nothing';
    out.clean = false;
    out.text = 'I didn’t hear any notes. Stand the phone on the piano’s music stand and play each key firmly.';
    return out;
  }
  const hits = [];
  const wrong = [];
  let voice = 0;
  an.notes.forEach((nt) => {
    if (pc(nt.m) === p) { hits.push(nt); nt.ok = true; return; }
    const guess = nt.m - pc(nt.m) + p;
    const ev = Math.max(evidence(an, nt.t, guess), evidence(an, nt.t, guess + 12));
    if (ev >= ACCEPT) { hits.push(Object.assign({}, nt, { m: guess })); nt.ok = true; return; }
    nt.ok = false;
    wrong.push(nt);
  });
  out.hits = hits.length;
  out.voice = voice;
  const distinct = new Set(hits.map((h) => h.m)).size;
  if (wrong.length) {
    out.status = 'miss';
    out.clean = false;
    out.first = { kind: 'sub', want: p, got: wrong[0].m };
    out.text = 'I heard ' + letter(wrong[0].m) + '. ' + HINT[p];
    return out;
  }
  if (hits.length < n) {
    out.status = 'unfinished';
    out.clean = false;
    out.text = 'I heard ' + hits.length + ' ' + letter(p) + (hits.length === 1 ? '' : '’s') + '. Play ' + n + ', each one a different ' + letter(p) + ', low to high.';
    return out;
  }
  if (distinct < 2) {
    out.status = 'miss';
    out.clean = false;
    out.text = 'Those sounded like the same ' + letter(p) + '. Use ' + n + ' different ones, low to high.';
    return out;
  }
  out.status = 'clean';
  out.clean = true;
  out.text = 'Clean.';
  return out;
}
