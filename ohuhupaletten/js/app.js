import { t, getLang, setLang } from './i18n.js';
import * as R from './registry.js';
import { computeBlend, alternativesFor } from './blend.js';
import { generatePalette } from './palette.js';
import { normalizeHex } from './color.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = x => (Math.round(x * 10) / 10).toFixed(1);
const FAR = 10; // ΔE över detta = "ingen nära penna"

const BLEND_KEY = 'obl.blend.v1';
const PAL_KEY = 'obl.palette.v1';
const P = { type: 'random', mood: 'all', count: 4, anchor: null, locks: [], result: null };
try { Object.assign(P, JSON.parse(localStorage.getItem(PAL_KEY)) || {}); } catch {}
const savePal = () => { try { localStorage.setItem(PAL_KEY, JSON.stringify(P)); } catch {} };
const PTYPES = ['random', 'mono', 'analog', 'complement', 'triad'];
const PMOODS = ['all', 'vivid', 'muted', 'pastel', 'dark', 'earthy', 'grey'];
const APP_URL = 'https://jennyharrysdotter.github.io/Appar/ohuhupaletten/';
let installPrompt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (S.view === 'info') render(); });
addEventListener('appinstalled', () => { installPrompt = null; if (S.view === 'info') render(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches;
const inAppBrowser = () => /FBAN|FBAV|Instagram|Snapchat|Messenger|; wv\)/i.test(navigator.userAgent);
const S = {
  view: 'blend', start: null, end: null, n: 5, mode: 'vivid', locks: {}, result: null, error: null,
  m: { q: '', fam: '', grp: '', has: 'all' }, lastCommunity: null,
};
try { Object.assign(S, JSON.parse(localStorage.getItem(BLEND_KEY)) || {}); } catch {}
const saveBlend = () => { try { localStorage.setItem(BLEND_KEY, JSON.stringify({ start: S.start, end: S.end, n: S.n, mode: S.mode, locks: S.locks })); } catch {} };

function toast(msg, ms = 3200) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toast.h); toast.h = setTimeout(() => el.classList.remove('show'), ms);
}

const swStyle = p => (p?.isBlender ? '' : p?.hex ? `background:${p.hex}` : '');
const swClass = p => (p?.isBlender ? 'blendersw' : p?.hex ? '' : 'nohex');
const badge = p => (p.isBlender ? '' : `<span class="badge ${p.hex ? p.hexSource : 'none'}">${t('src' + (p.hex ? p.hexSource : 'none'))}${p.hex && p.uncertain ? ' ≈' : ''}</span>`);
const sub = p => p.name || p.group || '';
const info = k => `<button class="infobtn" data-act="help" data-k="${k}" aria-label="Förklaring">i</button>`;
// Sortering på kod: familj (bokstäver) i bokstavsordning, sedan nummer i stigande ordning.
// Vid samma nummer (t.ex. R015 och R15) kommer koden med inledande nolla först.
const codeKey = c => { const m = c.match(/^([A-Z]*)(\d*)$/) || [, c, '']; return [m[1], m[2] === '' ? -1 : parseInt(m[2], 10), m[2].length]; };
const byCode = (a, b) => { const x = codeKey(a.code), y = codeKey(b.code); return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : x[1] - y[1] || y[2] - x[2]; };

// ---------------- Beräkning ----------------
function recompute() {
  S.result = null; S.error = null;
  const s = R.getPen(S.start), e = R.getPen(S.end);
  if (!s?.lab || !e?.lab) { if (!s?.lab) S.start = null; if (!e?.lab) S.end = null; return; }
  if (s.code === e.code) { S.error = 'sameEnds'; return; }
  const anchors = { 0: s, [S.n - 1]: e };
  const seen = new Set([s.code, e.code]);
  for (const [k, code] of Object.entries(S.locks)) {
    const i = Number(k), p = R.getPen(code);
    if (i > 0 && i < S.n - 1 && p?.lab && !seen.has(code)) { anchors[i] = p; seen.add(code); } else delete S.locks[k];
  }
  const r = computeBlend({ pens: R.colorPens(), n: S.n, anchors, mode: S.mode });
  if (r.error) S.error = r.error; else S.result = r;
  saveBlend();
}

// ---------------- Vyer ----------------
function render() {
  document.documentElement.lang = getLang();
  $('#tagline').textContent = t('appTagline');
  document.querySelectorAll('[data-t]').forEach(el => (el.textContent = t(el.dataset.t)));
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.view === S.view));
  const main = $('#main');
  if (S.view === 'blend') main.innerHTML = viewBlend();
  if (S.view === 'palette') main.innerHTML = viewPalette();
  if (S.view === 'markers') { main.innerHTML = viewMarkers(); renderMarkerList(); }
  if (S.view === 'info') main.innerHTML = viewInfo();
}

function penButton(which) {
  const p = R.getPen(S[which]);
  if (!p) return `<button class="penbtn empty" data-act="pick" data-which="${which}"><div class="label">${t(which)}</div><div class="sw"></div><div class="nm">${t('choose')}</div></button>`;
  return `<button class="penbtn" data-act="pick" data-which="${which}"><div class="label">${t(which)}</div><div class="sw" style="${swStyle(p)}"></div>
    <div><div class="code">${esc(p.code)}</div><div class="nm">${esc(sub(p))}</div></div></button>`;
}

function viewBlend() {
  const usable = R.colorPens().length;
  if (!usable) {
    return `<div class="card empty"><div class="art"><i></i><i></i><i></i><i></i><i></i></div>
      <h2>${t('noColorsTitle')}</h2><p class="muted">${t('noColorsBody')}</p>
      <button class="btn primary" data-act="go" data-view="markers">${t('goMarkers')}</button></div>`;
  }
  let html = `<div class="card"><div class="ends">${penButton('start')}
      <button class="swapbtn" data-act="swapEnds" aria-label="${t('swapEnds')}">⇄</button>${penButton('end')}</div></div>
    <div class="card">
      <div class="ctrl"><div><div class="label" style="margin:0">${t('steps')}</div></div>
        <div class="stepper"><button data-act="n" data-d="-1" aria-label="Färre">−</button><span>${S.n}</span><button data-act="n" data-d="1" aria-label="Fler">+</button></div></div>
      <div class="label">${t('path')}</div>
      <div class="seg"><button data-act="mode" data-mode="direct" class="${S.mode === 'direct' ? 'on' : ''}">${t('pathDirect')}</button>
        <button data-act="mode" data-mode="vivid" class="${S.mode === 'vivid' ? 'on' : ''}">${t('pathVivid')}</button></div>
      <p class="small" style="margin:8px 2px 0">${t(S.mode === 'vivid' ? 'pathVividHint' : 'pathDirectHint')}</p>
    </div>`;

  if (S.error) return html + `<div class="note"><span>${t(S.error)}</span></div>`;
  if (!S.result) return html + `<div class="note info"><span>${t('pickBoth')}</span></div>`;

  const r = S.result;
  const anyExternal = r.items.some(x => x.pen.hexSource === 'external');
  const anyUncertain = r.items.some(x => x.pen.uncertain);
  const anyLocked = Object.keys(S.locks).length > 0;
  html += `<div class="card"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h2 style="margin:0;display:flex;align-items:center;gap:8px">${t('yourBlend')} ${info('result')}</h2>
      ${anyLocked ? `<button class="btn ghost" data-act="unlockAll">${t('unlockAll')}</button>` : ''}</div>
    <div class="band">${r.items.map(x => `<div style="background:${x.pen.hex}"></div>`).join('')}</div>
    <div class="ideal" title="Ideal övergång">${r.items.map(x => `<div style="background:${x.targetHex}"></div>`).join('')}</div>
    <div class="legend"><span>${t('bandLegend')}</span>${info('ideal')}</div>
    <div class="stats"><div class="stat"><b>${Math.round(r.evenness * 100)} %</b><span>${t('evenness')}</span>${info('evenness')}</div>
      <div class="stat"><b>ΔE ${fmt(r.steps.reduce((a, b) => a + b, 0) / r.steps.length)}</b><span>${t('avgStep')}</span>${info('step')}</div></div>
    <ul class="steplist">`;
  r.items.forEach((x, i) => {
    const end = i === 0 || i === S.n - 1;
    const locked = !!S.locks[i];
    html += `<li class="stepitem ${end ? '' : 'tap'}" ${end ? '' : `data-act="alts" data-i="${i}"`}>
      <div class="chip-sw" style="background:${x.pen.hex}">${end ? '' : `<i style="background:${x.targetHex}"></i>`}</div>
      <div class="txt"><div class="code">${esc(x.pen.code)}${x.pen.uncertain ? ' <span class="small">≈</span>' : ''}</div><div class="nm">${esc(sub(x.pen))}</div>
        ${end ? '' : `<div class="de ${x.dist > FAR ? 'far' : ''}">ΔE ${fmt(x.dist)} ${t('fromIdeal')}${x.dist > FAR ? ' ⚠' : ''}</div>`}</div>
      ${end ? `<span class="tag">${t(i === 0 ? 'start' : 'end')}</span>`
            : `<button class="lockbtn ${locked ? 'on' : ''}" data-act="lock" data-i="${i}">${locked ? '🔒' : t('lock')}</button>`}
    </li>`;
    if (i < S.n - 1) html += `<li class="gap">ΔE ${fmt(r.steps[i])}</li>`;
  });
  html += `</ul><p class="small" style="margin:10px 2px 0">${t('tapToSwap')}</p></div>`;
  if (r.maxDist > FAR) html += `<div class="note"><span>⚠ ${t('farWarn')}</span></div>`;
  html += `<div class="note"><span><b>${t('digital')}</b>${t('digitalLong')}${anyExternal ? ' ' + t('externalWarn') : ''}${anyUncertain ? ' ≈ ' + t('uncertain') : ''}</span></div>`;
  return html;
}

function rollPalette() {
  const pens = R.colorPens();
  if (!pens.length) return;
  const locks = P.locks.map(c => R.getPen(c)).filter(p => p?.lab);
  const anchor = P.anchor ? R.getPen(P.anchor) : null;
  const r = generatePalette({ pens, type: P.type, mood: P.mood, count: P.count, anchor: anchor?.lab ? anchor : null, locks });
  P.result = r.bases.map(b => ({ code: b.pen.code, shadows: b.shadows.map(x => x.code) }));
  savePal();
}

function viewPalette() {
  if (!R.colorPens().length) return viewBlend();
  const anc = P.anchor ? R.getPen(P.anchor) : null;
  let html = `<div class="card">
      <div class="label" style="display:flex;align-items:center;gap:8px">${t('palType')} ${info('ptype')}</div>
      <div class="chips wrap" style="padding-top:2px">${PTYPES.map(k => `<button data-act="pType" data-v="${k}" class="${P.type === k ? 'on' : ''}">${t('pt_' + k)}</button>`).join('')}</div>
      <p class="small" style="margin:4px 2px 12px">${t('pth_' + P.type)}</p>
      <div class="label">${t('palMood')}</div>
      <div class="chips wrap" style="padding-top:2px">${PMOODS.map(k => `<button data-act="pMood" data-v="${k}" class="${P.mood === k ? 'on' : ''}">${t('pm_' + k)}</button>`).join('')}</div>
      <div class="ctrl" style="margin:14px 0"><div class="label" style="margin:0">${t('palCount')}</div>
        <div class="stepper"><button data-act="pCount" data-d="-1" aria-label="Färre">−</button><span>${P.count}</span><button data-act="pCount" data-d="1" aria-label="Fler">+</button></div></div>
      <div class="label">${t('palAnchor')}</div>
      <div class="row">
        <button class="btn grow anchorbtn" data-act="pAnchor">${anc ? `<i style="background:${anc.hex}"></i><b>${esc(anc.code)}</b>` : t('palAnchorNone')}</button>
        ${anc ? `<button class="btn" data-act="pAnchorClear" aria-label="${t('palAnchorClear')}">✕</button>` : ''}</div>
    </div>
    <button class="btn primary big" data-act="pRoll">🎲 ${t(P.result ? 'palReroll' : 'palRoll')}</button>`;
  const res = (P.result || []).map(b => ({ pen: R.getPen(b.code), shadows: b.shadows.map(c => R.getPen(c)).filter(p => p?.hex) })).filter(b => b.pen?.hex);
  if (res.length) {
    html += `<div class="card"><h2 style="margin:0 0 10px;display:flex;align-items:center;gap:8px">${t('palResult')} ${info('pshadow')}</h2>
      <div class="band">${res.map(b => `<div style="background:${b.pen.hex}"></div>`).join('')}</div>
      <ul class="steplist">${res.map(b => {
        const locked = P.locks.includes(b.pen.code);
        return `<li class="palrow">
          <div class="stepitem"><div class="chip-sw" style="background:${b.pen.hex}"></div>
            <div class="txt"><div class="code">${esc(b.pen.code)}${b.pen.uncertain ? ' <span class="small">≈</span>' : ''}</div><div class="nm">${esc(sub(b.pen))}</div></div>
            <button class="lockbtn ${locked ? 'on' : ''}" data-act="pLock" data-code="${esc(b.pen.code)}">${locked ? '🔒' : t('lock')}</button></div>
          <div class="shadows"><span class="small">${t('palShadows')}</span>${b.shadows.length ? b.shadows.map(x => `<span class="sh"><i style="background:${x.hex}"></i>${esc(x.code)}</span>`).join('') : `<span class="small">${t('palNoShadow')}</span>`}</div>
        </li>`; }).join('')}</ul>
      <p class="small" style="margin:10px 2px 0">${t('palLockHint')}</p></div>
      <div class="note"><span><b>${t('digital')}</b>${t('digitalLong')}</span></div>`;
  }
  return html;
}

function viewMarkers() {
  const v = R.validate();
  const countOk = v.colors === R.EXPECTED.colors && v.blenders === R.EXPECTED.blenders;
  const fams = Object.keys(v.families).sort();
  const c = S.lastCommunity;
  return `<div class="card"><h2>${t('registry')}</h2>
      <div class="summary">
        <div class="stat"><b>${v.colors}</b><span>${t('colors')} + ${v.blenders} ${t('blender')}</span></div>
        <div class="stat"><b>${v.withHex}<span style="font-size:14px;color:var(--ink-3)"> / ${v.colors}</span></b><span>${t('withHex')}</span></div>
      </div>
      <div class="okline ${countOk ? 'ok' : 'bad'}">${v.colors} + ${v.blenders} (${R.EXPECTED.colors} + ${R.EXPECTED.blenders})</div>
      <div class="okline ${v.duplicates.length ? 'bad' : 'ok'}">${v.duplicates.length ? t('duplicates') + ': ' + v.duplicates.join(', ') : t('noDuplicates')}</div>
      <div class="row wrap" style="margin-top:10px;gap:6px">
        <span class="badge official">${t('srcofficial')} ${v.bySource.official}</span>
        <span class="badge external">${t('srcexternal')} ${v.bySource.external}</span>
        <span class="badge swatch">${t('srcswatch')} ${v.bySource.swatch}</span>
        <span class="badge none">${t('srcnone')} ${v.missing.length}</span></div>
      ${v.uncertain.length ? `<details><summary>≈ ${t('uncertainList')} (${v.uncertain.length})</summary><div class="codes">${v.uncertain.map(m => `<span>${esc(m)}</span>`).join('')}</div></details>` : ''}
      ${v.missing.length ? `<details><summary>${t('missingList')} (${v.missing.length})</summary><div class="codes">${v.missing.map(m => `<span>${esc(m)}</span>`).join('')}</div></details>` : ''}
    </div>
    <div class="card"><p class="muted" style="margin-top:0">${t('communityInfo')}</p>
      <button class="btn primary" data-act="community" style="width:100%">${t('fetchCommunity')}</button>
      ${c ? `<p class="muted" style="margin-bottom:0">${esc(t('communityDone', c))}${c.conflicts.length ? ' ⚠ ' + esc(c.conflicts.join(', ')) : ''}</p>` : ''}
    </div>
    <div class="card"><div class="tools">
      <button class="btn" data-act="add">＋ ${t('addMarker')}</button><button class="btn" data-act="import">${t('import')}</button>
      <button class="btn" data-act="exportJson">${t('exportJson')}</button><button class="btn" data-act="exportCsv">${t('exportCsv')}</button></div></div>
    <div class="card">
      <input class="search" id="mSearch" type="search" placeholder="${t('searchCode')}" value="${esc(S.m.q)}" autocomplete="off" autocapitalize="characters">
      <div class="chips">${[['all', 'all'], ['with', 'withValue'], ['missing', 'missingValue']].map(([k, l]) => `<button data-act="mHas" data-v="${k}" class="${S.m.has === k ? 'on' : ''}">${t(l)}</button>`).join('')}</div>
      <div class="chips"><button data-act="mGrp" data-v="" class="${!S.m.grp ? 'on' : ''}">${t('group')}: ${t('all')}</button>${v.groups.map(g => `<button data-act="mGrp" data-v="${esc(g)}" class="${S.m.grp === g ? 'on' : ''}">${esc(g)}</button>`).join('')}</div>
      <div class="chips"><button data-act="mFam" data-v="" class="${!S.m.fam ? 'on' : ''}">${t('all')}</button>${fams.map(f => `<button data-act="mFam" data-v="${esc(f)}" class="${S.m.fam === f ? 'on' : ''}">${esc(f)} <span style="opacity:.6">${v.families[f]}</span></button>`).join('')}<button data-act="mFam" data-v="Blender" class="${S.m.fam === 'Blender' ? 'on' : ''}">0</button></div>
      <ul class="plist" id="mList"></ul>
    </div>`;
}

const matches = (p, q) => !q || p.code.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q) || (p.group || '').toLowerCase().includes(q);

function renderMarkerList() {
  const q = S.m.q.trim().toLowerCase();
  const list = R.getPens().slice().sort((a, b) => (a.isBlender - b.isBlender) || byCode(a, b)).filter(p => matches(p, q)
    && (!S.m.fam || p.family === S.m.fam) && (!S.m.grp || p.group === S.m.grp)
    && (S.m.has === 'all' || (S.m.has === 'with' ? p.hex : !p.hex && !p.isBlender)));
  $('#mList').innerHTML = list.length ? list.map(p => `<li class="prow" data-act="edit" data-code="${esc(p.code)}">
      <div class="sw ${swClass(p)}" style="${swStyle(p)}"></div>
      <div class="txt"><div class="code">${esc(p.code)}</div><div class="nm">${esc(p.isBlender ? t('blenderNote') : [p.name, p.group, p.set].filter(Boolean).join(' · '))}</div></div>
      ${badge(p)}</li>`).join('') : `<li class="muted" style="padding:14px 4px">${t('noResults')}</li>`;
}

function viewInstall() {
  if (isStandalone()) return `<div class="card"><h2>${t('installTitle')}</h2><p class="muted" style="margin:0">✓ ${t('installDone')}</p></div>`;
  return `<div class="card" id="install"><h2>${t('installTitle')}</h2>
    ${inAppBrowser() ? `<div class="note" style="margin-top:0">${t('installOpenedInApp')}</div>` : ''}
    ${installPrompt ? `<button class="btn primary" data-act="install" style="width:100%;margin-bottom:12px">${t('installButton')}</button>` : ''}
    <ol class="steps">${t('installSteps').map(x => `<li>${esc(x)}</li>`).join('')}</ol>
    <p class="muted">${t('installTips')}</p>
    <div class="label" style="margin-top:12px">${t('installAddress')}</div>
    <div class="row"><code class="addr grow">${APP_URL}</code><button class="btn" data-act="copyLink">${t('copyLink')}</button></div>
  </div>`;
}

function viewInfo() {
  return viewInstall() + `<div class="card"><h2>${t('aboutTitle')}</h2>
      ${['about1', 'about2', 'aboutPath', 'about3', 'about4'].map(k => `<p class="muted">${t(k)}</p>`).join('')}</div>
    <div class="card"><h2>${t('dataTitle')}</h2><p class="muted">${t('dataBody')}</p>
      <p class="small">${esc(R.COMMUNITY_LABEL)}</p></div>
    <div class="card"><button class="btn danger" data-act="reset" style="width:100%">${t('resetData')}</button></div>
    <p class="small" style="text-align:center">Ohuhupaletten v0.2 · ${t('digital')}</p>`;
}

// ---------------- Sheets ----------------
const sheet = $('#sheet');
function openSheet(html, mount) {
  $('#sheetBody').innerHTML = html;
  if (!sheet.open) sheet.showModal();
  mount?.($('#sheetBody'));
}
const closeSheet = () => sheet.open && sheet.close();
sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });

function openPicker(which, onPick, current = S[which], title = `${t(which)} – ${t('choose')}`) {
  const pens = R.colorPens().slice().sort(byCode);
  const fams = [...new Set(pens.map(p => p.family))];
  let q = '', fam = '';
  openSheet(`<div class="sheet-head"><div class="row"><h3 class="grow">${title}</h3><button class="btn ghost" data-close>${t('close')}</button></div>
      <input class="search" id="pSearch" type="search" placeholder="${t('searchCode')}" autocomplete="off" autocapitalize="characters" style="margin-top:10px">
      <div class="chips" id="pFams"><button data-f="" class="on">${t('all')}</button>${fams.map(f => `<button data-f="${esc(f)}">${esc(f)}</button>`).join('')}</div></div>
    <div class="grid" id="pGrid"></div>`, body => {
    const draw = () => {
      const list = pens.filter(p => matches(p, q) && (!fam || p.family === fam));
      body.querySelector('#pGrid').innerHTML = list.length ? list.map(p => `<button class="tile ${current === p.code ? 'on' : ''}" data-code="${esc(p.code)}">
        <div class="sw" style="background:${p.hex}"></div><div class="code">${esc(p.code)}</div></button>`).join('') : `<p class="muted">${t('noResults')}</p>`;
    };
    draw();
    body.querySelector('#pSearch').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    body.querySelector('#pFams').addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return; fam = b.dataset.f;
      body.querySelectorAll('#pFams button').forEach(x => x.classList.toggle('on', x === b)); draw();
    });
    body.querySelector('#pGrid').addEventListener('click', e => {
      const b = e.target.closest('.tile'); if (!b) return;
      if (onPick) onPick(b.dataset.code); else { S[which] = b.dataset.code; S.locks = {}; recompute(); }
      closeSheet(); render();
    });
  });
}

function openAlternatives(i) {
  const r = S.result, cur = r.items[i];
  let q = '';
  openSheet(`<div class="sheet-head"><div class="row"><h3 class="grow">${t('alternatives')} · ${i + 1}/${S.n}</h3><button class="btn ghost" data-close>${t('close')}</button></div>
      <div class="row" style="margin-top:10px"><div class="chip-sw" style="background:${cur.targetHex};width:44px;height:44px"></div>
        <div class="grow"><div class="small">${t('idealHere')}</div><div style="font-weight:600">${cur.targetHex}</div></div></div>
      <input class="search" id="aSearch" type="search" placeholder="${t('searchCode')}" autocomplete="off" autocapitalize="characters" style="margin-top:10px"></div>
    <ul class="plist" id="aList"></ul>`, body => {
    const all = alternativesFor(r, i, R.colorPens(), 500);
    const draw = () => {
      const list = (q ? all.filter(a => matches(a.pen, q)) : all.slice(0, 30));
      body.querySelector('#aList').innerHTML = list.map(a => `<li class="prow" data-code="${esc(a.pen.code)}">
        <div class="sw" style="background:${a.pen.hex}${a.pen.code === cur.pen.code ? ';outline:3px solid var(--ink);outline-offset:2px' : ''}"></div>
        <div class="txt"><div class="code">${esc(a.pen.code)}</div><div class="nm">${esc(sub(a.pen))}</div></div>
        <span class="de ${a.d > FAR ? 'far' : ''}">ΔE ${fmt(a.d)}</span>${badge(a.pen)}</li>`).join('') || `<li class="muted">${t('noResults')}</li>`;
    };
    draw();
    body.querySelector('#aSearch').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); draw(); });
    body.querySelector('#aList').addEventListener('click', e => {
      const row = e.target.closest('.prow'); if (!row) return;
      S.locks[i] = row.dataset.code; recompute(); closeSheet(); render();
    });
  });
}

function openEditor(code) {
  const isNew = !code;
  const p = isNew ? { code: '', family: '', name: '', set: null, hex: null, hexSource: 'swatch', hexNote: '', isBlender: false, custom: true } : R.getPen(code);
  const sets = [['', t('setUnknown')], ['Honolulu 168', 'Honolulu 168'], ['Midtones 48', 'Midtones 48']];
  openSheet(`<div class="sheet-head"><div class="row"><h3 class="grow">${isNew ? t('addMarker') : t('editMarker')}</h3><button class="btn ghost" data-close>${t('close')}</button></div></div>
    <form id="ed" autocomplete="off">
      <label class="field"><span>${t('code')}</span><input name="code" value="${esc(p.code)}" ${isNew ? '' : 'readonly'} autocapitalize="characters"></label>
      <label class="field"><span>${t('name')}</span><input name="name" value="${esc(p.name || '')}"></label>
      <label class="field"><span>${t('group')}</span><input name="group" value="${esc(p.group || '')}"></label>
      <div class="row"><label class="field grow"><span>${t('family')}</span><input name="family" value="${esc(p.family || '')}" ${p.isBlender ? 'readonly' : ''} autocapitalize="characters"></label>
        <label class="field grow"><span>${t('set')}</span><select name="set">${sets.map(([v, l]) => `<option value="${v}" ${(p.set || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      ${p.isBlender ? `<p class="muted">${t('blenderNote')}</p>` : `
      <label class="field"><span>${t('hex')}</span><div class="hexrow"><input name="hex" value="${esc(p.hex || '')}" placeholder="#rrggbb" inputmode="text" autocapitalize="none">
        <input type="color" name="picker" value="${p.hex || '#ffffff'}"></div><div class="preview ${p.hex ? '' : 'nohex'}" id="prev" style="${p.hex ? 'background:' + p.hex : ''}"></div></label>
      ${p.uncertain && p.hex ? `<p class="note" style="margin:0">≈ ${t('uncertain')}</p>` : ''}
      <label class="field"><span>${t('source')}</span><select name="hexSource">${R.SOURCES.map(s => `<option value="${s}" ${(p.hexSource || 'swatch') === s ? 'selected' : ''}>${t('src' + s)}</option>`).join('')}</select></label>
      <label class="field"><span>${t('note')}</span><input name="hexNote" value="${esc(p.hexNote || '')}"></label>`}
      <div class="err" id="edErr"></div>
      <div class="row wrap"><button class="btn primary grow" type="submit">${t('save')}</button>
        ${!isNew && p.hex ? `<button class="btn" type="button" data-ed="clear">${t('clearValue')}</button>` : ''}
        ${!isNew && p.custom ? `<button class="btn danger" type="button" data-ed="delete">${t('delete')}</button>` : ''}</div>
    </form>`, body => {
    const f = body.querySelector('#ed');
    const prev = body.querySelector('#prev');
    const sync = hex => { if (!prev) return; const h = normalizeHex(hex); prev.className = 'preview' + (h ? '' : ' nohex'); prev.style.background = h || ''; };
    f.hex?.addEventListener('input', () => { const h = normalizeHex(f.hex.value); if (h) f.picker.value = h; sync(f.hex.value); });
    f.picker?.addEventListener('input', () => { f.hex.value = f.picker.value; sync(f.picker.value); });
    body.querySelector('[data-ed="clear"]')?.addEventListener('click', () => { R.updatePen(p.code, { hex: null }); after(); });
    body.querySelector('[data-ed="delete"]')?.addEventListener('click', () => { R.deletePen(p.code); after(); });
    f.addEventListener('submit', e => {
      e.preventDefault();
      const err = body.querySelector('#edErr');
      const raw = f.hex ? f.hex.value.trim() : '';
      if (raw && !normalizeHex(raw)) { err.textContent = t('invalidHex'); return; }
      const fields = { name: f.name.value.trim() || null, group: f.group.value.trim() || null, set: f.set.value || null, family: f.family.value.trim() || null };
      if (!p.isBlender) Object.assign(fields, { hex: raw || null, hexSource: raw ? f.hexSource.value : null, hexNote: f.hexNote.value.trim() || null, uncertain: normalizeHex(raw) === p.hex ? !!p.uncertain : false });
      if (isNew) {
        const res = R.addPen({ code: f.code.value, ...fields });
        if (res.error) { err.textContent = t(res.error === 'duplicate' ? 'duplicateCode' : 'emptyCode'); return; }
      } else R.updatePen(p.code, fields);
      after();
    });
  });
  function after() { closeSheet(); recompute(); render(); toast(t('saved')); }
}

// ---------------- Export / import ----------------
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const stamp = () => new Date().toISOString().slice(0, 10);

$('#fileInput').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = '';
  if (!file) return;
  try { const r = R.importText(await file.text()); recompute(); render(); toast(t('importDone', r), 6000); }
  catch (err) { toast('⚠ ' + err.message, 6000); }
});

// ---------------- Händelser ----------------
document.addEventListener('click', async e => {
  const tab = e.target.closest('.tabs [data-view]');
  if (tab) { S.view = tab.dataset.view; render(); scrollTo(0, 0); return; }
  if (e.target.closest('[data-close]')) { closeSheet(); return; }
  const el = e.target.closest('[data-act]');
  if (!el || sheet.contains(el)) return;
  const a = el.dataset.act;
  if (a === 'go') { S.view = el.dataset.view; render(); }
  if (a === 'pick') openPicker(el.dataset.which);
  if (a === 'swapEnds') { [S.start, S.end] = [S.end, S.start]; S.locks = {}; recompute(); render(); }
  if (a === 'n') { S.n = Math.min(10, Math.max(3, S.n + Number(el.dataset.d))); S.locks = {}; recompute(); render(); }
  if (a === 'mode') { S.mode = el.dataset.mode; recompute(); render(); }
  if (a === 'lock') {
    e.stopPropagation();
    const i = el.dataset.i;
    if (S.locks[i]) delete S.locks[i]; else S.locks[i] = S.result.items[i].pen.code;
    recompute(); render();
  } else if (a === 'alts') openAlternatives(Number(el.dataset.i));
  if (a === 'install' && installPrompt) { installPrompt.prompt(); installPrompt.userChoice.finally(() => { installPrompt = null; render(); }); }
  if (a === 'copyLink') { try { await navigator.clipboard.writeText(APP_URL); toast(t('copied')); } catch { toast(APP_URL, 6000); } }
  if (a === 'help') {
    e.stopPropagation();
    const [title, paras] = t('help')[el.dataset.k];
    openSheet(`<div class="sheet-head"><div class="row"><h3 class="grow">${title}</h3><button class="btn ghost" data-close>${t('close')}</button></div></div>
      ${paras.map(x => `<p class="muted" style="font-size:15px">${esc(x)}</p>`).join('')}`);
  }
  if (a === 'pType') { P.type = el.dataset.v; P.locks = []; rollPalette(); render(); }
  if (a === 'pMood') { P.mood = el.dataset.v; P.locks = []; rollPalette(); render(); }
  if (a === 'pCount') { P.count = Math.min(5, Math.max(3, P.count + Number(el.dataset.d))); P.locks = P.locks.slice(0, P.count); rollPalette(); render(); }
  if (a === 'pRoll') { rollPalette(); render(); }
  if (a === 'pLock') { const c = el.dataset.code; P.locks = P.locks.includes(c) ? P.locks.filter(x => x !== c) : [...P.locks, c].slice(0, P.count); savePal(); render(); }
  if (a === 'pAnchor') openPicker('palAnchor', code => { P.anchor = code; P.locks = []; rollPalette(); }, P.anchor, t('palAnchor'));
  if (a === 'pAnchorClear') { P.anchor = null; P.locks = []; rollPalette(); render(); }
  if (a === 'unlockAll') { S.locks = {}; recompute(); render(); }
  if (a === 'mHas') { S.m.has = el.dataset.v; render(); }
  if (a === 'mFam') { S.m.fam = el.dataset.v; render(); }
  if (a === 'mGrp') { S.m.grp = el.dataset.v; render(); }
  if (a === 'edit') openEditor(el.dataset.code);
  if (a === 'add') openEditor(null);
  if (a === 'import') $('#fileInput').click();
  if (a === 'exportJson') download(`ohuhu-pens-${stamp()}.json`, R.exportJSON(), 'application/json');
  if (a === 'exportCsv') download(`ohuhu-pens-${stamp()}.csv`, R.exportCSV(), 'text/csv');
  if (a === 'community') {
    el.disabled = true; el.textContent = t('fetching');
    try { S.lastCommunity = await R.importCommunity(); recompute(); }
    catch { toast(t('fetchFailed'), 6000); }
    render();
  }
  if (a === 'reset' && confirm(t('resetConfirm'))) { R.resetLocal(); S.lastCommunity = null; recompute(); render(); toast(t('resetDone')); }
});

document.addEventListener('input', e => {
  if (e.target.id === 'mSearch') { S.m.q = e.target.value; renderMarkerList(); }
});

// ---------------- Start ----------------
await R.loadRegistry();
setLang(getLang());
recompute();
render();
