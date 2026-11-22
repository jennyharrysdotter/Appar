// Pennregistret: grundregister (data/pens.json) + dina lokala ändringar (localStorage).
import { normalizeHex, hexToOklab } from './color.js';

const OVERRIDES_KEY = 'obl.overrides.v1'; // { code: { name, hex, hexSource, hexNote, set, family } }
const ADDED_KEY = 'obl.added.v1';         // [ pen ] – pennor du lagt till själv

export const SOURCES = ['official', 'external', 'swatch'];
export const EXPECTED = { colors: 215, blenders: 1 };
export const COMMUNITY_CSV =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vTXyBuMZShW6A_T96cn-InrAbiv2ef9C4aEuVBewjqaaSaZ5Y8irlKwE3sKHwf4jA/pub?output=csv';
export const COMMUNITY_LABEL = 'MysticSparkleWings – BIG Ohuhu Spreadsheet (community, ungefärliga värden)';

const read = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* lagring otillgänglig */ } };

let base = [];
let overrides = {};
let added = [];
let pens = [];

export async function loadRegistry() {
  try {
    const res = await fetch('data/pens.json', { cache: 'no-cache' });
    base = await res.json();
  } catch {
    base = [];
  }
  overrides = read(OVERRIDES_KEY, {});
  added = read(ADDED_KEY, []);
  rebuild();
  return pens;
}

function decorate(p) {
  const hex = normalizeHex(p.hex);
  return { ...p, hex, lab: hex && !p.isBlender ? hexToOklab(hex) : null };
}

function rebuild() {
  const baseCodes = new Set(base.map(p => p.code));
  pens = [...base.map(p => ({ ...p, custom: false })), ...added.filter(p => !baseCodes.has(p.code)).map(p => ({ ...p, custom: true }))]
    .sort((a, b) => (a.chartOrder ?? 9999) - (b.chartOrder ?? 9999))
    .map(p => {
      const o = overrides[p.code];
      // Officiella värden i grundregistret går före externa värden som sparats lokalt.
      if (o && !(o.hexSource === 'external' && p.hexSource === 'official')) return decorate({ ...p, ...o });
      if (o) return decorate({ ...p, ...o, hex: p.hex, hexSource: p.hexSource, hexNote: p.hexNote });
      return decorate(p);
    });
}

export const getPens = () => pens;
export const getPen = code => pens.find(p => p.code === code);
/** Pennor som får användas i färgberäkningar: giltigt färgvärde och inte blendern. */
export const colorPens = () => pens.filter(p => p.lab && !p.isBlender);

export function updatePen(code, fields) {
  const clean = { ...fields };
  if ('hex' in clean) {
    clean.hex = normalizeHex(clean.hex);
    if (!clean.hex) { clean.hexSource = null; clean.hexNote = clean.hexNote || null; }
    if (!('uncertain' in clean)) clean.uncertain = false; // nytt värde från dig = inte längre markerat som osäkert
  }
  const a = added.find(p => p.code === code);
  if (a) Object.assign(a, clean), write(ADDED_KEY, added);
  else overrides[code] = { ...(overrides[code] || {}), ...clean }, write(OVERRIDES_KEY, overrides);
  rebuild();
}

export function addPen(pen) {
  const code = (pen.code || '').trim();
  if (!code) return { error: 'emptyCode' };
  if (pens.some(p => p.code === code)) return { error: 'duplicate' };
  added.push({ code, family: pen.family || familyOf(code), group: pen.group || null, chartOrder: 9999, name: pen.name || null, set: pen.set || null,
    hex: normalizeHex(pen.hex), hexSource: normalizeHex(pen.hex) ? pen.hexSource || 'swatch' : null, hexNote: pen.hexNote || null, isBlender: false });
  write(ADDED_KEY, added);
  rebuild();
  return { ok: true };
}

export function deletePen(code) {
  added = added.filter(p => p.code !== code);
  delete overrides[code];
  write(ADDED_KEY, added); write(OVERRIDES_KEY, overrides);
  rebuild();
}

export function resetLocal() {
  overrides = {}; added = [];
  write(OVERRIDES_KEY, overrides); write(ADDED_KEY, added);
  rebuild();
}

export const familyOf = code => (code.match(/^[A-Z]+/) || ['?'])[0];

/** Kontroll av registret: antal, dubbletter, färgvärden per källa. */
export function validate() {
  const seen = new Map();
  for (const p of pens) seen.set(p.code, (seen.get(p.code) || 0) + 1);
  const duplicates = [...seen].filter(([, n]) => n > 1).map(([c]) => c);
  const colors = pens.filter(p => !p.isBlender);
  const blenders = pens.filter(p => p.isBlender);
  const bySource = { official: 0, external: 0, swatch: 0 };
  colors.forEach(p => { if (p.hex && bySource[p.hexSource] !== undefined) bySource[p.hexSource]++; });
  const families = {};
  colors.forEach(p => { families[p.family] = (families[p.family] || 0) + 1; });
  const groups = [...new Set(pens.map(p => p.group).filter(Boolean))];
  return {
    groups, uncertain: colors.filter(p => p.hex && p.uncertain).map(p => p.code),
    colors: colors.length, blenders: blenders.length, duplicates, families, bySource,
    withHex: colors.filter(p => p.hex).length,
    missing: colors.filter(p => !p.hex).map(p => p.code),
  };
}

// ---------- CSV ----------
export function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',' || ch === ';') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim() !== ''));
}

const csvCell = v => (v == null ? '' : /[",;\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const FIELDS = ['code', 'family', 'group', 'name', 'set', 'hex', 'hexSource', 'hexNote', 'uncertain', 'isBlender', 'chartOrder'];

export function exportJSON() {
  return JSON.stringify(pens.map(p => Object.fromEntries(FIELDS.map(f => [f, p[f] ?? null]))), null, 1);
}
export function exportCSV() {
  return [FIELDS.join(','), ...pens.map(p => FIELDS.map(f => csvCell(p[f])).join(','))].join('\n');
}

/** Importera JSON eller CSV (samma kolumner som exporten). Matchar på exakt pennkod. */
export function importText(text) {
  let list;
  const t = text.trim();
  if (t.startsWith('[') || t.startsWith('{')) {
    const j = JSON.parse(t);
    list = Array.isArray(j) ? j : j.pens;
  } else {
    const rows = parseCSV(t);
    const head = rows[0].map(h => h.trim());
    if (!head.includes('code')) throw new Error('CSV saknar kolumnen "code"');
    list = rows.slice(1).map(r => Object.fromEntries(head.map((h, i) => [h, (r[i] ?? '').trim() || null])));
  }
  const seen = new Set(); const dupInFile = []; let updated = 0, addedCount = 0; const invalidHex = [];
  for (const raw of list) {
    const code = String(raw.code ?? '').trim();
    if (!code) continue;
    if (seen.has(code)) { dupInFile.push(code); continue; }
    seen.add(code);
    if (raw.hex && !normalizeHex(raw.hex)) invalidHex.push(code);
    const hex = normalizeHex(raw.hex);
    const fields = { name: raw.name ?? null, group: raw.group ?? null, set: raw.set ?? null, hex, hexSource: hex ? (SOURCES.includes(raw.hexSource) ? raw.hexSource : 'swatch') : null, hexNote: raw.hexNote ?? null };
    if (getPen(code)) { updatePen(code, fields); updated++; }
    else { const r = addPen({ code, family: raw.family, ...fields }); if (r.ok) addedCount++; }
  }
  return { updated, added: addedCount, dupInFile, invalidHex };
}

/**
 * Hämtar community-kalkylarket i webbläsaren och kopplar HEX + namn till exakt samma (nya) Ohuhu-kod.
 * Skriver aldrig över egna färgprov eller officiella värden.
 */
export async function importCommunity() {
  const res = await fetch(COMMUNITY_CSV);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const rows = parseCSV(await res.text());
  const head = rows[0].map(h => h.trim().toLowerCase());
  const iCode = head.indexOf('new code'), iName = head.indexOf('new name'), iHex = head.indexOf('hex');
  if (iCode < 0 || iHex < 0) throw new Error('Okänt kolumnformat i källan');
  const map = new Map(); const conflicts = [];
  for (const r of rows.slice(1)) {
    const code = (r[iCode] || '').trim();
    const hex = normalizeHex(r[iHex] || '');
    if (!code || !hex) continue;
    if (map.has(code) && map.get(code).hex !== hex) conflicts.push(code);
    if (!map.has(code)) map.set(code, { hex, name: (r[iName] || '').trim() || null });
  }
  let matched = 0, skipped = 0;
  const date = new Date().toISOString().slice(0, 10);
  for (const p of pens.filter(p => !p.isBlender)) {
    const m = map.get(p.code);
    if (!m) continue;
    if (p.hex && p.hexSource !== 'external') { skipped++; if (!p.name && m.name) updatePen(p.code, { name: m.name }); continue; }
    updatePen(p.code, { hex: m.hex, hexSource: 'external', hexNote: `${COMMUNITY_LABEL}, ${date}`, name: p.name || m.name });
    matched++;
  }
  const v = validate();
  return { matched, skipped, conflicts, missing: v.missing, sourceRows: map.size };
}
