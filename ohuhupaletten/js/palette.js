// Palettmotorn: slumpar fram harmoniska grundfärger ur dina pennor och föreslår skuggpennor till varje.
import { deltaE, toOklch } from './color.js';

const deg = r => ((r * 180) / Math.PI + 360) % 360;
const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const wrap = h => ((h % 360) + 360) % 360;
const pickRandom = (list, rnd) => list[Math.floor(rnd() * list.length)];

/** Lägg till L, C, h (grader) på pennorna. */
export const withLch = pens => pens.map(p => { const [L, C, h] = toOklch(p.lab); return { ...p, L, C, h: deg(h) }; });

const GREY = 0.03; // under detta räknas pennan som grå (saknar tydlig färgton)

export const MOODS = {
  all: () => true,
  vivid: p => p.C >= 0.11 && p.L >= 0.45 && p.L <= 0.9,
  muted: p => p.C >= 0.025 && p.C < 0.095 && p.L >= 0.35 && p.L <= 0.85,
  pastel: p => p.L >= 0.82 && p.C >= 0.025 && p.C < 0.12,
  dark: p => p.L < 0.5 && p.C >= 0.02,
  earthy: p => p.h >= 30 && p.h <= 110 && p.C >= 0.025 && p.C < 0.14 && p.L >= 0.35 && p.L <= 0.8,
  grey: p => p.C < GREY,
};

// Målkulörer (förskjutning i grader från startfärgen) och hur långt ifrån en penna får ligga.
const HARMONY = {
  mono: { offsets: [0, 0, 0, 0, 0], window: 22 },
  analog: { offsets: [0, 30, -30, 60, -60], window: 16 },
  complement: { offsets: [0, 180, 25, 205, -25], window: 20 },
  triad: { offsets: [0, 120, 240, 20, 140], window: 22 },
};

/**
 * @param {object} o
 * @param {Array} o.pens    pennor med lab (blendern borttagen)
 * @param {string} o.type   'random' | 'mono' | 'analog' | 'complement' | 'triad'
 * @param {string} o.mood   nyckel i MOODS
 * @param {number} o.count  antal grundfärger (3–5)
 * @param {object} o.anchor valfri startpenna
 * @param {Array}  o.locks  låsta grundfärger (pennor) som ska ligga kvar
 */
export function generatePalette({ pens, type = 'random', mood = 'all', count = 4, anchor = null, locks = [], rnd = Math.random }) {
  const all = withLch(pens);
  const byCode = new Map(all.map(p => [p.code, p]));
  const lockedList = locks.map(p => byCode.get(p.code)).filter(Boolean).slice(0, count);
  const lockedPens = Object.fromEntries(lockedList.map((p, i) => [i, p]));
  const used = new Set(lockedList.map(p => p.code));
  const moodOk = MOODS[mood] || MOODS.all;
  const harmonic = type !== 'random' && mood !== 'grey';
  let pool = all.filter(moodOk);
  if (harmonic) pool = pool.filter(p => p.C >= GREY);
  if (!pool.length) pool = all;

  // Startfärg: vald penna, annars första låsta, annars slump ur stämningen
  let start = anchor ? byCode.get(anchor.code) : null;
  if (!start) start = lockedList[0] || pickRandom(pool, rnd);
  const bases = new Array(count).fill(null);
  for (const [i, p] of Object.entries(lockedPens)) bases[i] = p;
  if (!lockedList.some(p => p.code === start.code)) {
    const free = bases.findIndex(b => !b);
    if (free >= 0) { bases[free] = start; used.add(start.code); }
  }

  const h0 = start.h;
  const minDist = type === 'mono' ? 7 : 14;
  const farEnough = p => bases.every(b => !b || deltaE(b.lab, p.lab) >= minDist);

  for (let i = 0; i < count; i++) {
    if (bases[i]) continue;
    let cands = [];
    if (harmonic) {
      const { offsets, window } = HARMONY[type];
      const target = wrap(h0 + offsets[i % offsets.length]);
      // vidga fönstret stegvis om inget passar; till sist ignoreras stämningen
      for (const f of [1, 1.6, 2.4]) {
        cands = pool.filter(p => !used.has(p.code) && hueDiff(p.h, target) <= window * f && farEnough(p));
        if (cands.length) break;
      }
      if (!cands.length) cands = all.filter(p => !used.has(p.code) && p.C >= GREY && hueDiff(p.h, target) <= window * 2.4 && farEnough(p));
      if (type === 'mono' && cands.length) {
        // sprid ljusheten: välj bland kandidaterna som ligger längst från redan valda i ljushet
        const Ls = bases.filter(Boolean).map(b => b.L);
        const score = p => Math.min(...Ls.map(L => Math.abs(L - p.L)), 1);
        cands.sort((a, b) => score(b) - score(a));
        cands = cands.slice(0, Math.max(3, Math.ceil(cands.length / 3)));
      }
    } else {
      cands = pool.filter(p => !used.has(p.code) && farEnough(p));
    }
    if (!cands.length) cands = all.filter(p => !used.has(p.code));
    const pick = pickRandom(cands, rnd);
    bases[i] = pick; used.add(pick.code);
  }

  const order = type === 'mono' ? bases.map((b, i) => [b, i]).sort((x, y) => y[0].L - x[0].L).map(x => x[1]) : bases.map((_, i) => i);
  const result = order.map(i => ({ pen: bases[i], locked: !!lockedPens[i], shadows: [] }));
  // Skuggor: samma färgton, mörkare, något lägre mättnad. Ingen penna används två gånger i paletten.
  for (const r of result) r.shadows = shadowsFor(r.pen, all, used);
  return { bases: result, type, mood };
}

export function shadowsFor(base, all, used = new Set()) {
  const out = [];
  const chromatic = base.C >= GREY;
  const cands = all.filter(p => p.L < base.L - 0.04 && (chromatic ? hueDiff(p.h, base.h) <= 35 && p.C >= 0.015 : p.C < 0.05));
  for (const dL of [0.12, 0.24]) {
    const tL = base.L - dL, tC = base.C * 0.9;
    let best = null, bestD = Infinity;
    for (const p of cands) {
      if (used.has(p.code) || out.includes(p)) continue;
      const d = Math.abs(p.L - tL) * 100 + Math.abs(p.C - tC) * 100 + (chromatic ? hueDiff(p.h, base.h) * 0.35 : 0);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && (!out.length || best.L < out[out.length - 1].L)) { out.push(best); used.add(best.code); }
  }
  return out;
}
