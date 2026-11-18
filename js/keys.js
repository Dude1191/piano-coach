/* Piano Coach keyboard: drawn the way you see it from the bench, low notes on the left. */
const WHITE = [0, 2, 4, 5, 7, 9, 11];
const NS = 'http://www.w3.org/2000/svg';
const LET = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];

function el(name, attrs) {
  const e = document.createElementNS(NS, name);
  Object.keys(attrs || {}).forEach((k) => e.setAttribute(k, attrs[k]));
  return e;
}

/* Draws keys lo..hi (MIDI) into host. Returns controls to light keys up. */
export function keyboard(host, lo, hi, opts) {
  opts = opts || {};
  while (WHITE.indexOf(((lo % 12) + 12) % 12) < 0) lo--;
  while (WHITE.indexOf(((hi % 12) + 12) % 12) < 0) hi++;
  const whites = [];
  for (let m = lo; m <= hi; m++) if (WHITE.indexOf(m % 12) >= 0) whites.push(m);
  const W = 30;
  const H = 128;
  const svg = el('svg', { viewBox: '0 0 ' + whites.length * W + ' ' + (H + 2), class: 'kb', role: 'img', 'aria-label': 'Piano keys' });
  const keys = {};
  const xOf = {};
  whites.forEach((m, i) => {
    xOf[m] = i * W;
    const r = el('rect', { x: i * W + 0.5, y: 0.5, width: W - 1, height: H, rx: 4, class: 'kw' });
    svg.appendChild(r);
    keys[m] = { rect: r, black: false, cx: i * W + W / 2, cy: H - 18 };
  });
  for (let m = lo; m <= hi; m++) {
    if (WHITE.indexOf(m % 12) >= 0) continue;
    const left = xOf[m - 1];
    if (left == null) continue;
    const x = left + W - 9.5;
    const r = el('rect', { x, y: 0.5, width: 19, height: 80, rx: 3, class: 'kb-black' });
    svg.appendChild(r);
    keys[m] = { rect: r, black: true, cx: x + 9.5, cy: 62 };
  }
  // letters on the white keys, and a dot on middle C
  const labels = el('g', { class: 'klabels' });
  whites.forEach((m) => {
    const k = keys[m];
    if (opts.letters === 'all' || (opts.letters === 'c' && m % 12 === 0)) {
      const t = el('text', { x: k.cx, y: H - 6, class: 'kl' });
      t.textContent = LET[m % 12] + (opts.octaves && m % 12 === 0 ? Math.floor(m / 12) - 1 : '');
      labels.appendChild(t);
    }
    if (m === 60 && opts.middleC !== false) labels.appendChild(el('circle', { cx: k.cx, cy: H - 26, r: 3, class: 'kmid' }));
  });
  svg.appendChild(labels);
  const marks = el('g', { class: 'kmarks' });
  svg.appendChild(marks);
  host.innerHTML = '';
  host.appendChild(svg);
  const lit = {};
  const api = {
    lo, hi,
    light(m, cls, label) {
      const k = keys[m];
      if (!k) return;
      api.unlight(m);
      k.rect.classList.add(cls || 'on');
      const g = el('g', { class: 'kmark' });
      if (label != null && label !== '') {
        g.appendChild(el('circle', { cx: k.cx, cy: k.cy, r: 11, class: 'kbadge ' + (cls || 'on') }));
        const t = el('text', { x: k.cx, y: k.cy + 4.5, class: 'kbadget' });
        t.textContent = label;
        g.appendChild(t);
      }
      marks.appendChild(g);
      lit[m] = { cls: cls || 'on', g };
    },
    unlight(m) {
      const k = keys[m];
      const l = lit[m];
      if (!k || !l) return;
      k.rect.classList.remove(l.cls);
      l.g.remove();
      delete lit[m];
    },
    clear() { Object.keys(lit).forEach((m) => api.unlight(+m)); },
    has(m) { return !!keys[m]; }
  };
  return api;
}
