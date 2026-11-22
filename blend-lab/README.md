# Ohuhu Blend Lab

En personlig, mobilanpassad webbapp för att hitta färgövergångar med **mina egna** Ohuhu Honolulu-markers (Honolulu 168 + Midtones 48).

## Version 0.1 innehåller

- **Pennregister** – 215 färgkoder + färglös blender (0), med kontroll av antal och dubbletter.
- **Blend Lab** – välj start- och slutpenna, 3–10 pennor, via färghjulet (OKLCH, standard) eller direkt väg (OKLab). Byt eller lås pennor och räkna om.
- **My Markers** – sök på kod, filtrera på familj och färgstatus, redigera HEX och källa, lägg till pennor, importera och exportera JSON/CSV.
- **Hämta community-färgvärden** – importerar HEX-värden från MysticSparkleWings kalkylark och märker dem som *Extern*.
- Engelska som standardspråk, svenska som tillval.

## Principer

- Appen föreslår bara pennor som finns i registret.
- Färgvärden hittas aldrig på. Pennor utan värde visas men används inte i beräkningar.
- Varje färgvärde har en källa: `official`, `external` eller `swatch` (eget färgprov).
- Blendern (`0`) räknas aldrig som en färg.
- Allt är digitalt beräknat och säger inget om hur bläcket blandas på papper.

## Struktur

```
index.html            Appens skal
css/style.css         Utseende
js/app.js             Vyer och händelser
js/blend.js           Blend-motorn (ideal övergång + beam search över hela sekvensen)
js/color.js           sRGB ↔ OKLab/OKLCH, ΔE
js/registry.js        Pennregister, lokala ändringar, import/export, community-import
js/i18n.js            Engelska/svenska texter
data/pens.json        Grundregistret – lägg till nya pennor här
manifest.webmanifest  PWA-manifest
sw.js                 Service worker (nätet först, cache offline)
icon-*.png            Appikoner
```

Appen har inget byggsteg och inga beroenden. Den är vanlig HTML, CSS och JavaScript-moduler, så den kan redigeras direkt i GitHub från mobilen. Alla sökvägar är relativa och fungerar därför under `användare.github.io/projektnamn/`.

## Färgdata

Ohuhu publicerar inga HEX-värden. Värdena i `data/pens.json` är uppmätta från foton av min egen handifyllda nyanskarta (OHUHU 216 | NYANSSKALOR):

- två bildserier i dagsljus, vitbalanserade mot papperet (linjärt ljus) och sammanvägda i OKLab
- medianskillnaden mellan serierna är ΔE 1,8; 22 pennor skilde mer än ΔE 6 och är märkta `uncertain: true` (mest mörka gröna, blå och lila)
- källa `swatch` (eget prov) och en anteckning per penna; `group` = nyansgruppen i kartan

## Var data sparas

- `data/pens.json` är grundregistret: koder, familjer, nyansgrupper och färgvärden.
- Dina ändringar (HEX-värden, namn, egna pennor) sparas i webbläsarens localStorage på telefonen. Använd **Export JSON** som säkerhetskopia.

## Publicering och installation

Appen ligger i mappen `blend-lab/` i repot Appar och publiceras med GitHub Pages: https://jennyharrysdotter.github.io/Appar/blend-lab/

Den är en PWA (manifest + service worker) och kan installeras på hemskärmen via Chrome → ⋮ → *Lägg till på startskärmen / Installera app*. Höj `CACHE`-versionen i `sw.js` när filer ändras.

## Testa lokalt (dator, valfritt)

```
python3 -m http.server -d . 8000
```
