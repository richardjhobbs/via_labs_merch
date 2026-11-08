'use client';
// Landing "works with" switchboard: an exchange board where the agent patches one tool through to another.
// Each scene plugs in a new cord pair in its own colour; cords stay in place and carry pulses, then the board clears.
// Tool names and live/on-request status come from the connector catalogue; the board is drawn as one SVG, imperatively.
import { useEffect, useRef } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { CONNECTORS } from '@/lib/connectors/catalog';

const BANKS: string[][] = [['gmail', 'm365', 'sheets', 'upload'], ['whatsapp', 'wecom', 'zalo', 'telegram'], ['centric', 'topo', 'bamboorose', 'backbone'], ['odoo', 'sap-b1', 'infor', 'apparelmagic'], ['inspectorio', 'sedex', 'amfori', 'osh'], ['maersk', 'kn', 'dsv', 'flexport']];
const BANK_KEYS = ['email', 'chat', 'product', 'erp', 'quality', 'logistics'] as const;
const EVENTS: [string, string, 'ok' | 'checked' | 'wait'][] = [
  ['whatsapp', 'centric', 'ok'], ['gmail', 'sheets', 'ok'], ['wecom', 'maersk', 'checked'], ['topo', 'gmail', 'wait'],
  ['upload', 'odoo', 'ok'], ['sap-b1', 'whatsapp', 'ok'], ['sedex', 'm365', 'wait'], ['zalo', 'inspectorio', 'ok'],
];
// Cloth-braid cord colours: body, highlight, dark sleeve
const CORDS = [
  ['#B8352B', '#E06A5C', '#6E1C16'], ['#D69B2E', '#F2C76A', '#7A5615'], ['#2F5DA8', '#6B93D6', '#1A3563'], ['#2E7D4F', '#62B285', '#18452B'],
  ['#E4DAC4', '#FFFFFF', '#8E8470'], ['#D0652A', '#F09A63', '#7A3712'], ['#2A8C8C', '#5FC2C2', '#165050'], ['#7E4373', '#B479A8', '#462340'],
];
const COLUMN = [3, 4, 2, 5, 1, 6, 0, 7];
const T_EVENT = 7000, T_HOLD = 5000;

type Pt = { x: number; y: number };
type Cord = { g: SVGGElement; paths: SVGPathElement[]; len: number; body: SVGPathElement; pg: SVGGElement; dg: SVGGElement; pulses: SVGCircleElement[]; dir: number };
type Api = { toggle: () => void; next: () => void; clear: () => void };

// The board reads its strings once when it is drawn, so a language change remounts it (and restarts the scenes).
export function Switchboard() {
  return <Board key={useLocale()} />;
}

function Board() {
  const t = useTranslations('switchboard');
  const svgRef = useRef<SVGSVGElement>(null);
  const infoRef = useRef<HTMLDivElement>(null);
  const whenRef = useRef<HTMLSpanElement>(null);
  const swRef = useRef<HTMLElement>(null);
  const lineRef = useRef<HTMLSpanElement>(null);
  const statusRef = useRef<HTMLSpanElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const playRef = useRef<HTMLButtonElement>(null);
  const api = useRef<Api | null>(null);

  const tools = BANKS.flat().map((id) => {
    const c = CONNECTORS.find((x) => x.id === id);
    return { id, name: c?.name ?? id, live: c?.status === 'stage1', bank: BANKS.findIndex((b) => b.includes(id)) };
  });
  // Strings are read once into a plain object so the drawing code can run outside React renders.
  const S = useRef({
    banks: BANK_KEYS.map((k) => t(`banks.${k}`)),
    events: EVENTS.map((_, i) => t(`events.e${i + 1}`)),
    final: { ok: [t('status.filed'), t('status.updated'), '', '', t('status.saved'), t('status.sent'), '', t('status.booked')], checked: t('status.checked'), wait: t('status.wait') },
    reading: t('status.reading'), drafting: t('status.drafting'), control: t('status.control'),
    hold: t('hold'), live: t('live'), connections: t('connections'), count: t.raw('count') as string,
    liveToday: t('liveToday'), onRequest: t('onRequest'), hint: t('hint'), hintBody: t('hintBody'),
    does: Object.fromEntries(tools.map((x) => [x.id, t(`tools.${x.id.replace('-', '')}`)])),
    pause: t('pause'), play: t('play'), aria: t('aria'),
  }).current;

  useEffect(() => {
    const svg = svgRef.current!, info = infoRef.current!;
    const NS = 'http://www.w3.org/2000/svg';
    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, parent?: Element): SVGElementTagNameMap[K] => {
      const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, String(attrs[k])); if (parent) parent.appendChild(e); return e;
    };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let pos: Record<string, Pt> = {}, lamps: Record<string, SVGCircleElement> = {}, holes: { a: Pt; b: Pt }[] = [];
    let cordLayer: SVGGElement, plugLayer: SVGGElement, pulseLayer: SVGGElement, built: { a: Cord; b: Cord }[] = [];
    let ev = 0, tm = 0, playing = !reduce, clock = 9 * 60 + 14, hover: string | null = null, last = performance.now(), holding = false, raf = 0;

    const finalOf = (i: number) => { const k = EVENTS[i][2]; return k === 'ok' ? S.final.ok[i] : S.final[k]; };
    const nameOf = (id: string) => tools.find((x) => x.id === id)!.name;

    function layout() {
      const narrow = svg.parentElement!.clientWidth < 640;
      const cols = narrow ? 2 : 6, colW = narrow ? 300 : 160, W = narrow ? 600 : 1000, rowH = 84;
      pos = {}; const catPos: { x: number; y: number; label: string }[] = [];
      let y0 = 64; const bankTop: number[] = [];
      if (narrow) for (let r = 0; r < 3; r++) { bankTop.push(y0); y0 += 76 + Math.max(BANKS[r * 2].length, BANKS[r * 2 + 1].length) * rowH; }
      BANKS.forEach((ids, i) => {
        const col = i % cols, top = narrow ? bankTop[Math.floor(i / 2)] : 64;
        const x = W / 2 - (cols * colW) / 2 + colW / 2 + col * colW;
        catPos.push({ x, y: top, label: S.banks[i] });
        ids.forEach((id, r) => { pos[id] = { x, y: top + 74 + r * rowH }; });
      });
      const panelH = narrow ? y0 + 10 : 64 + 74 + 4 * rowH - 18;
      return { narrow, W, panelH, catPos, plateW: narrow ? 148 : 136 };
    }

    function renderInfo() {
      const tl = hover ? tools.find((x) => x.id === hover) : null;
      info.replaceChildren();
      const p = (cls: string, text: string) => { const e = document.createElement('p'); e.className = cls; e.textContent = text; info.appendChild(e); return e; };
      if (tl) { p('sb-st' + (tl.live ? ' live' : ''), tl.live ? S.liveToday : S.onRequest); p('sb-nm', tl.name); p('sb-p', S.does[tl.id]); return; }
      p('sb-st', S.hint); p('sb-p', S.hintBody);
      const lg = document.createElement('div'); lg.className = 'sb-legend';
      for (const [cls, text] of [['on', S.liveToday], ['off', S.onRequest]]) { const s = document.createElement('span'); const i = document.createElement('i'); i.className = 'sb-chip ' + cls; s.append(i, text); lg.appendChild(s); }
      info.appendChild(lg);
    }

    function draw() {
      const L = layout();
      const deskY = L.panelH + 26, deskH = 128, H = deskY + deskH;
      svg.setAttribute('viewBox', `0 0 ${L.W} ${H}`);
      svg.replaceChildren();
      const defs = el('defs', {}, svg);
      defs.innerHTML = `
        <linearGradient id="sb-brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F0D28A"/><stop offset=".45" stop-color="#B8892F"/><stop offset="1" stop-color="#6E4E17"/></linearGradient>
        <radialGradient id="sb-hole" cx=".5" cy=".4" r=".6"><stop offset="0" stop-color="#000"/><stop offset=".8" stop-color="#0B0806"/><stop offset="1" stop-color="#2A2018"/></radialGradient>
        <linearGradient id="sb-field" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#211913"/><stop offset="1" stop-color="#150F0B"/></linearGradient>
        <linearGradient id="sb-desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6A4325"/><stop offset=".08" stop-color="#4E2F18"/><stop offset="1" stop-color="#2E1B0E"/></linearGradient>
        <linearGradient id="sb-plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F1E9D6"/><stop offset="1" stop-color="#D9CDB2"/></linearGradient>
        <linearGradient id="sb-plateoff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3E3730"/><stop offset="1" stop-color="#2E2924"/></linearGradient>
        <radialGradient id="sb-lampoff" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#5A4E42"/><stop offset="1" stop-color="#1E1813"/></radialGradient>
        <filter id="sb-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.006 0.16" numOctaves="3" seed="7"/><feColorMatrix values="0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0 0  1.4 0 0 0 -0.45"/></filter>
        <filter id="sb-speck" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="2"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 0.9  0 0 0 0 0.8  0 0 0 0.06 0"/></filter>
        <filter id="sb-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="3.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <filter id="sb-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.2"/></filter>`;
      // Cabinet: walnut frame, bakelite jack field, keyshelf
      el('rect', { x: 0, y: 0, width: L.W, height: H, fill: '#3B2414' }, svg);
      el('rect', { x: 0, y: 0, width: L.W, height: H, filter: 'url(#sb-grain)' }, svg);
      el('rect', { x: 16, y: 16, width: L.W - 32, height: L.panelH - 8, rx: 6, fill: 'url(#sb-field)', stroke: '#0A0705', 'stroke-width': 2 }, svg);
      el('rect', { x: 16, y: 16, width: L.W - 32, height: L.panelH - 8, rx: 6, filter: 'url(#sb-speck)' }, svg);
      for (const [x, y] of [[30, 30], [L.W - 30, 30], [30, L.panelH - 6], [L.W - 30, L.panelH - 6]]) {
        el('circle', { cx: x, cy: y, r: 4, fill: 'url(#sb-brass)' }, svg);
        el('line', { x1: x - 2.5, y1: y - 2.5, x2: x + 2.5, y2: y + 2.5, stroke: '#5A3F12', 'stroke-width': 1 }, svg);
      }
      // Bank headers and designation strips sit in a layer above the cords, so cords pass behind them.
      const plates = el('g', { 'pointer-events': 'none' });
      for (const cp of L.catPos) {
        el('rect', { x: cp.x - L.plateW / 2 - 6, y: cp.y - 9, width: L.plateW + 12, height: 20, rx: 2, fill: 'url(#sb-brass)' }, plates);
        el('text', { x: cp.x, y: cp.y + 5, 'text-anchor': 'middle', fill: '#2A1D0A', style: 'font: 600 10px var(--mono); letter-spacing: .12em' }, plates).textContent = cp.label.toUpperCase();
      }
      lamps = {};
      for (const tl of tools) {
        const p = pos[tl.id];
        const g = el('g', { class: 'sb-jack', tabindex: 0, role: 'button', 'aria-label': `${tl.name}: ${tl.live ? S.liveToday : S.onRequest}` }, svg);
        el('rect', { x: p.x - L.plateW / 2, y: p.y - 44, width: L.plateW, height: 22, rx: 2, fill: tl.live ? 'url(#sb-plate)' : 'url(#sb-plateoff)', stroke: tl.live ? '#8E7F62' : '#8A8073', 'stroke-dasharray': tl.live ? 'none' : '3 2', 'stroke-width': 1 }, plates);
        el('text', { x: p.x, y: p.y - 28.5, 'text-anchor': 'middle', fill: tl.live ? '#231A12' : '#B7AD9E', style: 'font: 600 11.5px var(--sans)' }, plates).textContent = tl.name;
        el('rect', { x: p.x - L.plateW / 2, y: p.y - 46, width: L.plateW, height: 64, fill: 'transparent' }, g);
        el('circle', { cx: p.x, cy: p.y, r: 16, fill: '#0A0705' }, g);
        el('circle', { class: 'sb-bezel', cx: p.x, cy: p.y, r: 14, fill: 'none', stroke: 'url(#sb-brass)', 'stroke-width': 5 }, g);
        el('circle', { cx: p.x, cy: p.y, r: 10, fill: 'url(#sb-hole)' }, g);
        el('circle', { cx: p.x - 46, cy: p.y, r: 7, fill: '#0A0705' }, g);
        lamps[tl.id] = el('circle', { cx: p.x - 46, cy: p.y, r: 5.5, fill: 'url(#sb-lampoff)' }, g);
        const show = () => { hover = tl.id; renderInfo(); }, hide = () => { if (hover === tl.id) { hover = null; renderInfo(); } };
        g.addEventListener('mouseenter', show); g.addEventListener('mouseleave', hide); g.addEventListener('focus', show); g.addEventListener('blur', hide);
        const pick = () => { const i = EVENTS.findIndex((e) => e[0] === tl.id || e[1] === tl.id); hover = tl.id; renderInfo(); if (i >= 0) jump(i); };
        g.addEventListener('click', pick);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      }
      // Keyshelf: eight cord pairs, rear row FROM, front row TO, the VIA Merch mark in the middle
      el('rect', { x: 0, y: deskY - 10, width: L.W, height: 10, fill: '#24160C' }, svg);
      el('rect', { x: 0, y: deskY, width: L.W, height: deskH, fill: 'url(#sb-desk)' }, svg);
      el('rect', { x: 0, y: deskY, width: L.W, height: deskH, filter: 'url(#sb-grain)', opacity: 0.8 }, svg);
      el('rect', { x: 0, y: deskY, width: L.W, height: 2, fill: '#8A5E38' }, svg);
      const mid = L.W / 2, half = L.narrow ? 66 : 90, gap = L.narrow ? 48 : 58;
      holes = [];
      for (let k = 0; k < 8; k++) {
        const x = k < 4 ? mid - half - (3 - k) * gap - gap / 2 : mid + half + (k - 4) * gap + gap / 2;
        holes.push({ a: { x, y: deskY + 38 }, b: { x, y: deskY + 86 } });
        for (const h of [holes[k].a, holes[k].b]) { el('circle', { cx: h.x, cy: h.y, r: 11, fill: 'url(#sb-brass)' }, svg); el('circle', { cx: h.x, cy: h.y, r: 7.5, fill: 'url(#sb-hole)' }, svg); }
      }
      const lab = (y: number, s: string) => { el('text', { x: holes[0].a.x - 22, y, 'text-anchor': 'end', fill: '#C9A266', style: 'font: 500 9px var(--mono); letter-spacing: .14em' }, svg).textContent = s; };
      lab(deskY + 41, 'FROM'); lab(deskY + 89, 'TO');
      el('rect', { x: mid - half + 12, y: deskY + 16, width: 2 * half - 24, height: deskH - 32, rx: 4, fill: '#1A110A', stroke: 'url(#sb-brass)', 'stroke-width': 1.5 }, svg);
      const bw = 2 * half - 48;
      el('image', { href: '/via-merch-white.png', x: mid - bw / 2, y: deskY + 26, width: bw, height: deskH - 52 }, svg);
      cordLayer = el('g', {}, svg); plugLayer = el('g', {}, svg); pulseLayer = el('g', {}, svg);
      svg.appendChild(plates);
      built = []; frame();
    }

    // A cord leaves the keyshelf hole upward, then hangs in a soft droop up to the jack.
    function cordD(from: Pt, to: Pt, k: number) {
      const rise = from.y - to.y, j = ((k % 3) - 1) * 14;
      return `M${from.x} ${from.y}C${from.x + j} ${from.y - 70 - k * 3} ${to.x - j * 0.5} ${to.y + rise * 0.62 + 30} ${to.x} ${to.y + 24}`;
    }

    function buildCord(i: number, which: 'a' | 'b'): Cord {
      const col = CORDS[i], h = holes[COLUMN[i]];
      const from = h[which], jack = pos[which === 'a' ? EVENTS[i][0] : EVENTS[i][1]];
      const d = cordD(from, jack, i * 2 + (which === 'a' ? 0 : 1));
      const g = el('g', {}, cordLayer);
      const shadow = el('path', { d, fill: 'none', stroke: '#000', 'stroke-opacity': 0.45, 'stroke-width': 9, 'stroke-linecap': 'round', transform: 'translate(3 6)', filter: 'url(#sb-soft)' }, g);
      const body = el('path', { d, fill: 'none', stroke: col[0], 'stroke-width': 7, 'stroke-linecap': 'round' }, g);
      const edge = el('path', { d, fill: 'none', stroke: col[2], 'stroke-opacity': 0.55, 'stroke-width': 2, 'stroke-linecap': 'round', transform: 'translate(1.6 1.6)' }, g);
      const hi = el('path', { d, fill: 'none', stroke: col[1], 'stroke-opacity': 0.7, 'stroke-width': 1.6, 'stroke-linecap': 'round', transform: 'translate(-1.4 -1.4)' }, g);
      const len = body.getTotalLength(), paths = [shadow, body, edge, hi];
      paths.forEach((p) => p.setAttribute('stroke-dasharray', `${len} ${len}`));
      const pg = el('g', { opacity: 0 }, plugLayer);
      el('rect', { x: jack.x - 7, y: jack.y + 6, width: 14, height: 22, rx: 3, fill: col[2] }, pg);
      el('rect', { x: jack.x - 7, y: jack.y + 6, width: 5, height: 22, rx: 2, fill: col[0], opacity: 0.7 }, pg);
      el('rect', { x: jack.x - 8, y: jack.y - 2, width: 16, height: 9, rx: 2, fill: 'url(#sb-brass)' }, pg);
      el('circle', { cx: jack.x, cy: jack.y - 1, r: 5, fill: 'url(#sb-brass)', stroke: '#5A3F12', 'stroke-width': 1 }, pg);
      const dg = el('g', {}, plugLayer);
      el('circle', { cx: from.x, cy: from.y, r: 8, fill: col[2] }, dg);
      el('circle', { cx: from.x - 1.5, cy: from.y - 1.5, r: 5, fill: col[0] }, dg);
      const pulses = [0, 1, 2].map(() => el('circle', { r: 3.2, fill: '#FFF6DC', filter: 'url(#sb-glow)', opacity: 0 }, pulseLayer));
      return { g, paths, len, body, pg, dg, pulses, dir: which === 'a' ? -1 : 1 };
    }
    const ensure = (i: number) => (built[i] ??= { a: buildCord(i, 'a'), b: buildCord(i, 'b') });
    const clearBoard = () => { cordLayer.replaceChildren(); plugLayer.replaceChildren(); pulseLayer.replaceChildren(); built = []; };

    function setGrow(c: Cord, p: number) {
      c.paths.forEach((x) => x.setAttribute('stroke-dashoffset', String(c.len * (1 - p))));
      c.dg.style.opacity = p > 0 ? '1' : '0'; c.pg.setAttribute('opacity', p >= 1 ? '1' : '0'); c.g.style.opacity = p > 0 ? '1' : '0';
    }
    // Pulses: a brisk triple on the active pair, a slow single tick on every earlier connection.
    function setPulses(c: Cord, now: number, active: boolean, phase: number) {
      c.pulses.forEach((dot, n) => {
        if (reduce || (!active && n > 0)) { dot.setAttribute('opacity', '0'); return; }
        const f = active ? (now / 1300 + n / 3 + phase) % 1 : (now / 3600 + phase) % 1;
        const pt = c.body.getPointAtLength((c.dir < 0 ? 1 - f : f) * c.len);
        dot.setAttribute('cx', String(pt.x)); dot.setAttribute('cy', String(pt.y));
        dot.setAttribute('opacity', String((active ? 1 : 0.55) * Math.min(1, Math.sin(f * Math.PI) * 3)));
      });
    }
    const hidePulses = (c: Cord) => c.pulses.forEach((d) => d.setAttribute('opacity', '0'));
    const hhmm = () => `${String(Math.floor(clock / 60)).padStart(2, '0')}:${String(clock % 60).padStart(2, '0')}`;

    function frame() {
      const now = performance.now(), grow = (x: number) => (reduce ? 1 : Math.max(0, Math.min(1, x)));
      const lit: Record<string, string> = {};
      for (let i = 0; i <= ev; i++) {
        const c = ensure(i), cur = i === ev && !holding;
        const pa = cur ? grow(tm / 800) : 1, pb = cur ? grow((tm - 800) / 800) : 1;
        setGrow(c.a, pa); setGrow(c.b, pb);
        if (!cur || tm > 1700) { setPulses(c.a, now, cur || holding, i * 0.13); setPulses(c.b, now, cur || holding, i * 0.13 + 0.5); }
        else { hidePulses(c.a); hidePulses(c.b); }
        if (!cur || pa >= 1) lit[EVENTS[i][0]] = CORDS[i][1];
        if (!cur || pb >= 1) lit[EVENTS[i][1]] = CORDS[i][1];
      }
      for (const tl of tools) { const on = lit[tl.id]; lamps[tl.id].setAttribute('fill', on || 'url(#sb-lampoff)'); lamps[tl.id].setAttribute('filter', on ? 'url(#sb-glow)' : 'none'); }
      const [src, dst] = EVENTS[ev], text = S.events[ev], final = finalOf(ev);
      lineRef.current!.textContent = holding ? S.hold : text.slice(0, reduce ? text.length : Math.max(0, Math.floor((tm - 1700) / 16)));
      whenRef.current!.textContent = holding ? `${hhmm()}  ·  ${EVENTS.length} ${S.live}` : `${hhmm()}  ·  ${nameOf(src).toUpperCase()}  →  ${nameOf(dst).toUpperCase()}`;
      swRef.current!.style.background = holding ? `linear-gradient(90deg,${CORDS.map((c) => c[0]).join(',')})` : CORDS[ev][0];
      const status = holding ? S.control : reduce ? final : tm < 1700 ? S.reading : tm < 4600 ? S.drafting : final;
      const done = holding || reduce || tm >= 4600, k = EVENTS[ev][2];
      statusRef.current!.textContent = status;
      statusRef.current!.className = 'sb-status' + (done ? (holding || k !== 'wait' ? ' ok' : ' wait') : '');
      countRef.current!.textContent = S.count.replace('{n}', String(ev + 1)).replace('{total}', String(EVENTS.length));
    }

    const syncPlay = () => { playRef.current!.textContent = playing ? S.pause : S.play; };
    function jump(i: number) { if (i < ev || holding) clearBoard(); holding = false; ev = i; tm = 0; playing = true; syncPlay(); frame(); }
    function advance() {
      if (holding) { holding = false; clearBoard(); ev = 0; tm = 0; clock += 9; return; }
      if (ev === EVENTS.length - 1) { holding = true; tm = 0; clock += 4; return; }
      ev++; tm = 0; clock += 7;
    }
    function tick(now: number) {
      const dt = Math.min(100, now - last); last = now;
      if (playing) { tm += dt; if (tm >= (holding ? T_HOLD : T_EVENT)) advance(); }
      frame(); raf = requestAnimationFrame(tick);
    }
    api.current = {
      toggle: () => { playing = !playing; syncPlay(); },
      next: () => { advance(); frame(); },
      clear: () => { clearBoard(); holding = false; ev = 0; tm = 0; frame(); },
    };
    let rw = 0;
    const onResize = () => { clearTimeout(rw); rw = window.setTimeout(draw, 150); };
    addEventListener('resize', onResize);
    renderInfo(); draw(); syncPlay(); raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', onResize); clearTimeout(rw); };
  // The board reads its strings once; it does not redraw on re-render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="sb">
      <div className="sb-board">
        <svg ref={svgRef} role="img" aria-label={S.aria} />
        <div className="sb-log">
          <div className="sb-txt">
            <p className="sb-when"><i className="sb-sw" ref={swRef} /><span ref={whenRef} /></p>
            <p className="sb-line"><span ref={lineRef} /><span className="sb-caret" aria-hidden="true" /></p>
          </div>
          <span className="sb-status" ref={statusRef} />
        </div>
      </div>
      <div className="sb-bar">
        <div className="sb-info" ref={infoRef} aria-live="polite" />
        <div className="sb-side">
          <span className="sb-count" ref={countRef} />
          <div className="sb-controls">
            <button type="button" className="sb-ctl" ref={playRef} onClick={() => api.current?.toggle()}>{S.pause}</button>
            <button type="button" className="sb-ctl" onClick={() => api.current?.next()}>{t('next')}</button>
            <button type="button" className="sb-ctl" onClick={() => api.current?.clear()}>{t('clear')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Every connector in the catalogue, scrolling under the board on the same dark ground.
export function ConnectorBanner({ label }: { label: string }) {
  const items = CONNECTORS.filter((c) => c.id !== 'via-agent' && c.id !== 'forward');   // forwarding is a route, not a product
  const row = (hidden: boolean) => (
    <ul className="sb-marquee-row" aria-hidden={hidden || undefined}>
      {items.map((c) => (
        <li key={c.id} className={'sb-chip-item' + (c.status === 'stage1' ? ' live' : '')}>
          <span className="sb-logo">
            {c.logo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={c.logo} alt="" width={16} height={16} />
              : <b>{c.name.slice(0, 1)}</b>}
          </span>
          {c.name}
        </li>
      ))}
    </ul>
  );
  return (
    <div className="sb-marquee" role="region" aria-label={label}>
      <div className="sb-marquee-track">{row(false)}{row(true)}</div>
    </div>
  );
}
