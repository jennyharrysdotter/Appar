// Favoriter: sparade övergångar och paletter med egna namn (lagras lokalt i webbläsaren).
const KEY = 'obl.favs.v1';
let favs = [];
try { favs = JSON.parse(localStorage.getItem(KEY)) || []; } catch { favs = []; }
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(favs)); } catch {} };

export const getFavs = () => favs.slice().sort((a, b) => b.created.localeCompare(a.created));
export const getFav = id => favs.find(f => f.id === id);

export function addFav(fav) {
  const f = { ...fav, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: new Date().toISOString() };
  favs.push(f); save(); return f;
}
export function renameFav(id, name) { const f = getFav(id); if (f) { f.name = name; save(); } }
export function deleteFav(id) { favs = favs.filter(f => f.id !== id); save(); }

export function exportFavs() {
  return JSON.stringify({ app: 'Ohuhupaletten', type: 'favoriter', version: 1, exported: new Date().toISOString(), favorites: favs }, null, 1);
}

/** Importera säkerhetskopia. Favoriter med samma id hoppas över, så samma fil kan importeras flera gånger. */
export function importFavs(text) {
  const j = JSON.parse(text);
  const list = Array.isArray(j) ? j : j.favorites;
  if (!Array.isArray(list)) throw new Error('Filen innehåller inga favoriter');
  const ids = new Set(favs.map(f => f.id));
  let added = 0, skipped = 0;
  for (const f of list) {
    if (!f || !f.kind || !f.name || !(f.kind === 'blend' ? Array.isArray(f.codes) : Array.isArray(f.bases))) { skipped++; continue; }
    if (f.id && ids.has(f.id)) { skipped++; continue; }
    favs.push({ ...f, id: f.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 6), created: f.created || new Date().toISOString() });
    added++;
  }
  save();
  return { added, skipped };
}
