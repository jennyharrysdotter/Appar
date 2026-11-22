// Blend-motorn: väljer pennor ur registret som tillsammans ligger så nära en ideal övergång som möjligt.
import { deltaE, interpolate, oklabToHex } from './color.js';

// Vid matchning väger kulör och mättnad tyngre än ljushet (a/b skalas), så att t.ex. en grön
// övergång väljer gröna pennor i stället för grå med rätt ljushet. Visade ΔE-värden är vanliga OKLab-ΔE.
export const HUE_WEIGHT = 1.8;
const W = l => [l[0], l[1] * HUE_WEIGHT, l[2] * HUE_WEIGHT];
const dW = (p, q) => deltaE(W(p), W(q));

/**
 * @param {object} o
 * @param {Array}  o.pens     Pennor med giltigt färgvärde: { code, lab, ... } (blendern ska redan vara bortfiltrerad)
 * @param {number} o.n        Totalt antal pennor i övergången (inkl. start och slut)
 * @param {Object} o.anchors  { index: pen } – start (0), slut (n-1) och låsta pennor
 * @param {string} o.mode     'direct' | 'vivid'
 *
 * Metod: 1) Ideala målfärger räknas fram segment för segment mellan ankarna (start, låsta, slut).
 * 2) Hela sekvensen optimeras med beam search. Kostnaden är summan av
 *    (avvikelse från målfärgen)² + w · (stegstorlek − idealt steg)², så att både närhet till
 *    idealet och jämna steg mellan grannar vägs in. Ingen penna får användas två gånger.
 */
export function computeBlend({ pens, n, anchors, mode = 'direct', beamWidth = 400, candidatesPerStep = 45, w = 0.6 }) {
  const idx = Object.keys(anchors).map(Number).sort((a, b) => a - b);
  if (idx[0] !== 0 || idx[idx.length - 1] !== n - 1) throw new Error('Start och slut måste vara ankare');

  // 1. Ideala målfärger
  const targets = new Array(n);
  for (let s = 0; s < idx.length - 1; s++) {
    const a = idx[s], b = idx[s + 1];
    for (let i = a; i <= b; i++) targets[i] = interpolate(anchors[a].lab, anchors[b].lab, (i - a) / (b - a), mode);
  }
  const idealStep = [];
  for (let i = 0; i < n - 1; i++) idealStep.push(dW(targets[i], targets[i + 1]));

  // 2. Kandidater per fri position
  const anchorCodes = new Set(idx.map(i => anchors[i].code));
  const free = pens.filter(p => !anchorCodes.has(p.code));
  const candidates = targets.map((t, i) => {
    if (anchors[i]) return [{ pen: anchors[i], d: dW(anchors[i].lab, t) }];
    return free.map(pen => ({ pen, d: dW(pen.lab, t) })).sort((x, y) => x.d - y.d).slice(0, candidatesPerStep);
  });

  // 3. Beam search över hela sekvensen
  let beam = [{ seq: [anchors[0]], used: new Set([anchors[0].code]), cost: 0 }];
  for (let i = 1; i < n; i++) {
    const next = [];
    for (const st of beam) {
      const prev = st.seq[st.seq.length - 1];
      for (const c of candidates[i]) {
        if (!anchors[i] && st.used.has(c.pen.code)) continue;
        const step = dW(prev.lab, c.pen.lab);
        const cost = st.cost + c.d * c.d + w * (step - idealStep[i - 1]) ** 2;
        next.push({ st, pen: c.pen, cost });
      }
    }
    if (!next.length) return { error: 'notEnough' };
    next.sort((a, b) => a.cost - b.cost);
    beam = next.slice(0, beamWidth).map(x => {
      const used = new Set(x.st.used); used.add(x.pen.code);
      return { seq: [...x.st.seq, x.pen], used, cost: x.cost };
    });
  }
  const best = beam[0];

  const items = best.seq.map((pen, i) => ({
    pen, locked: !!anchors[i], target: targets[i], targetHex: oklabToHex(targets[i]), dist: deltaE(pen.lab, targets[i]),
  }));
  const steps = [];
  for (let i = 0; i < n - 1; i++) steps.push(deltaE(items[i].pen.lab, items[i + 1].pen.lab));
  const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
  const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length);
  const evenness = mean > 0 ? Math.max(0, 1 - sd / mean) : 1;
  return { items, steps, idealStep, evenness, maxDist: Math.max(...items.map(x => x.dist)) };
}

/** Alternativa pennor för position i, närmast målfärgen, exklusive pennor som redan används på andra platser. */
export function alternativesFor(result, i, pens, limit = 30) {
  const usedElsewhere = new Set(result.items.filter((_, j) => j !== i).map(x => x.pen.code));
  const t = result.items[i].target;
  return pens.filter(p => !usedElsewhere.has(p.code))
    .map(pen => ({ pen, w: dW(pen.lab, t), d: deltaE(pen.lab, t) }))
    .sort((a, b) => a.w - b.w)
    .slice(0, limit);
}
