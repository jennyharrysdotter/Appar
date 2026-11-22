// Färgmatematik: sRGB <-> OKLab / OKLCH och färgskillnad (ΔE i OKLab, skala 0–100).

export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const h = value.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(h)) return '#' + h.toLowerCase();
  if (/^[0-9a-fA-F]{3}$/.test(h)) return '#' + h.split('').map(c => c + c).join('').toLowerCase();
  return null;
}

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function hexToOklab(hex) {
  const h = normalizeHex(hex);
  if (!h) return null;
  const [r, g, b] = [1, 3, 5].map(i => toLinear(parseInt(h.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return '#' + rgb.map(v => Math.round(Math.min(1, Math.max(0, toGamma(v))) * 255).toString(16).padStart(2, '0')).join('');
}

export const toOklch = ([L, a, b]) => [L, Math.hypot(a, b), Math.atan2(b, a)];
export const fromOklch = ([L, C, h]) => [L, C * Math.cos(h), C * Math.sin(h)];

/** Perceptuell färgskillnad i OKLab, multiplicerad med 100 (≈ 1 = knappt märkbar, 10+ = tydlig skillnad). */
export const deltaE = (p, q) => 100 * Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);

/**
 * Ideal mellanfärg mellan p och q vid t (0–1).
 * 'direct' = rak linje i OKLab (kortaste perceptuella vägen).
 * 'vivid'  = via färghjulet i OKLCH (kortaste hue-bågen), ger mer mättade mellansteg.
 */
export function interpolate(p, q, t, mode = 'direct') {
  if (mode !== 'vivid') return [0, 1, 2].map(i => p[i] + (q[i] - p[i]) * t);
  const [L1, C1, h1] = toOklch(p);
  const [L2, C2, h2] = toOklch(q);
  const grey = 0.02;
  let hA = h1, hB = h2;
  if (C1 < grey) hA = h2; // gråskala saknar kulör – låna den andra färgens kulör
  if (C2 < grey) hB = h1;
  let dh = hB - hA;
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return fromOklch([L1 + (L2 - L1) * t, C1 + (C2 - C1) * t, hA + dh * t]);
}

/** Läsbar textfärg (mörk/ljus) ovanpå en färgruta. */
export function inkFor(hex) {
  const lab = hexToOklab(hex);
  return lab && lab[0] > 0.68 ? '#1d1b1a' : '#ffffff';
}
