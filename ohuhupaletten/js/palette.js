// Palettmotorn: slumpar fram harmoniska grundfärger ur dina pennor och föreslår skuggpennor till varje.
import { deltaE, toOklch, fromOklch, hexToOklab } from './color.js';

const deg = r => ((r * 180) / Math.PI + 360) % 360;
const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const wrap = h => ((h % 360) + 360) % 360;
const pickRandom = (list, rnd) => list[Math.floor(rnd() * list.length)];

/** Lägg till L, C, h (grader) på pennorna. */
export const withLch = pens => pens.map(p => { const [L, C, h] = toOklch(p.lab); return { ...p, L, C, h: deg(h) }; });

const GREY = 0.03;

// Färgriktningar: vilken färgton paletten ska hålla sig till (OKLCH-kulör i grader).
export const DIRECTIONS = {
  any: null,
  red: { c: 15, w: 28 }, orange: { c: 58, w: 18 }, yellow: { c: 97, w: 20 }, green: { c: 145, w: 32 },
  teal: { c: 195, w: 24 }, blue: { c: 245, w: 38 }, purple: { c: 312, w: 34 },
  brown: { brown: true }, grey: { grey: true },
};
export function inDir(p, dir, widen = 1) {
  const d = DIRECTIONS[dir];
  if (!d) return true;
  if (d.grey) return p.C < 0.035 * widen;
  if (d.brown) return p.h >= 25 && p.h <= 100 && p.L < 0.72 && p.C >= 0.02 && p.C < 0.14 * widen;
  return p.C >= 0.015 && hueDiff(p.h, d.c) <= d.w * widen;
}
/** Flytta en målfärg in i färgriktningen men behåll dess ljushet och (ungefärliga) mättnad. */
function steerTarget(lab, dir) {
  const d = DIRECTIONS[dir];
  if (!d) return lab;
  const [L, C, hr] = toOklch(lab); const h = deg(hr);
  if (d.grey) return fromOklch([L, 0.01, hr]);
  if (d.brown) return fromOklch([Math.min(L, 0.62), Math.min(Math.max(C, 0.05), 0.09), 60 * Math.PI / 180]);
  if (C >= 0.025 && hueDiff(h, d.c) <= d.w) return lab;
  return fromOklch([L, Math.max(C, 0.05), d.c * Math.PI / 180]);
}
/** Pennor inom riktningen; vidga stegvis om för få finns. */
function dirPool(pens, dir, need) {
  for (const wdn of [1, 1.4, 1.8]) { const r = pens.filter(p => inDir(p, dir, wdn)); if (r.length >= need) return r; }
  return pens.filter(p => inDir(p, dir, 2.5));
}

// Teman: typiska färger för årstider och högtider (målfärger – appen väljer dina närmaste pennor).
export const THEMES = {
  spring: { group: 'season', colors: ['#b8e0a0', '#d6e86a', '#f7e07a', '#f6c1d0', '#c9a7e0', '#a8d4f0', '#8fcf7a'] },
  summer: { group: 'season', colors: ['#2f8fd0', '#2bb8b0', '#f8c830', '#f47a7a', '#4caf50', '#e03a3a', '#86d0f0'] },
  autumn: { group: 'season', colors: ['#d4a020', '#e07a20', '#b4441e', '#7a2030', '#6e4a2a', '#707a30', '#c8903c'] },
  winter: { group: 'season', colors: ['#cfe6f2', '#6a8fb0', '#1e3060', '#c0c4c8', '#e8ecf0', '#4a3a70', '#2c4a5a'] },
  christmas: { group: 'holiday', colors: ['#c01c28', '#1e5a32', '#d4a830', '#e6e6e6', '#7a1c2a', '#8a5030', '#3e7a4a'] },
  easter: { group: 'holiday', colors: ['#f8e060', '#cdb4e8', '#bfe3a0', '#f6c6d6', '#f4e6c8', '#b0d8f0', '#f8b878'] },
  midsummer: { group: 'holiday', colors: ['#4a78d0', '#f2d040', '#7cc050', '#eeeeea', '#d8343c', '#b896d8', '#2e7a3a'] },
  halloween: { group: 'holiday', colors: ['#e8701a', '#1a1a1a', '#5a2a80', '#8ac030', '#4a2e1e', '#f0a030', '#7a1a1a'] },
  valentine: { group: 'holiday', colors: ['#d0202c', '#f48ab0', '#f8cdd8', '#7a1838', '#d02a7a', '#f6e0e4'] },
  newyear: { group: 'holiday', colors: ['#d4af37', '#c0c0c8', '#1a1a1a', '#e8d8b0', '#1a2450', '#8a8a96'] },
};

function themePalette(all, key, count, lockedList, rnd, dir = 'any') {
  const theme = THEMES[key] || THEMES.spring;
  const W = l => [l[0], l[1] * 1.8, l[2] * 1.8];
  const dW = (a, b) => deltaE(W(a), W(b));
  const used = new Set(lockedList.map(p => p.code));
  const bases = [...lockedList];
  // blanda temats färger och ta så många som behövs
  const pool = dir === 'any' ? all : dirPool(all, dir, count * 3);
  const slots = theme.colors.map(h => steerTarget(hexToOklab(h), dir)).map(v => [rnd(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  let i = 0;
  while (bases.length < count && i < slots.length * 2) {
    const target = slots[i % slots.length]; i++;
    const cands = pool.filter(p => !used.has(p.code) && bases.every(b => deltaE(b.lab, p.lab) >= (dir === 'any' ? 10 : 6)))
      .map(p => ({ p, d: dW(p.lab, target) })).sort((a, b) => a.d - b.d).slice(0, 4);
    if (!cands.length) continue;
    const pick = cands[Math.floor(rnd() * Math.min(cands.length, 3))].p;
    bases.push(pick); used.add(pick.code);
  }
  return { bases, used };
} // under detta räknas pennan som grå (saknar tydlig färgton)

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
export function generatePalette({ pens, type = 'random', mood = 'all', count = 4, anchor = null, locks = [], dir = 'any', rnd = Math.random }) {
  const all = withLch(pens);
  const byCode = new Map(all.map(p => [p.code, p]));
  if (type === 'theme') {
    const lockedT = locks.map(p => byCode.get(p.code)).filter(Boolean).slice(0, count);
    const { bases, used } = themePalette(all, mood, count, lockedT, rnd, dir);
    const lockedSet = new Set(lockedT.map(p => p.code));
    return { bases: bases.map(p => ({ pen: p, locked: lockedSet.has(p.code), shadows: shadowsFor(p, all, used) })), type, mood };
  }
  const lockedList = locks.map(p => byCode.get(p.code)).filter(Boolean).slice(0, count);
  const lockedPens = Object.fromEntries(lockedList.map((p, i) => [i, p]));
  const used = new Set(lockedList.map(p => p.code));
  const moodOk = MOODS[mood] || MOODS.all;
  const harmonic = type !== 'random' && mood !== 'grey';
  let pool = all.filter(moodOk);
  if (harmonic) pool = pool.filter(p => p.C >= GREY);
  if (dir !== 'any' && (type === 'random' || type === 'mono')) {
    const dp = dirPool(pool, dir, count * 2);
    pool = dp.length >= count ? dp : dirPool(all, dir, count * 2);
  }
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
  const minDist = type === 'mono' ? 7 : dir !== 'any' ? 8 : 14;
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
  const cands = all.filter(p => p.L < base.L - 0.04 && (chromatic ? hueDiff(p.h, base.h) <= 35 && p.C >= 0.015 : p.C < 0.04));
  for (const dL of [0.12, 0.24]) {
    const tL = base.L - dL, tC = base.C * 0.9;
    let best = null, bestD = Infinity;
    for (const p of cands) {
      if (used.has(p.code) || out.includes(p)) continue;
      const d = Math.abs(p.L - tL) * 100 + Math.abs(p.C - tC) * 100 + (chromatic ? hueDiff(p.h, base.h) * 0.35
        : (Math.abs(p.lab[1] - base.lab[1]) + Math.abs(p.lab[2] - base.lab[2])) * 400);
      if (d < bestD) { bestD = d; best = p; }
    }
    if (best && (!out.length || best.L < out[out.length - 1].L)) { out.push(best); used.add(best.code); }
  }
  return out;
}
