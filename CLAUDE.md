# Teleklátó – fejlesztői útmutató (CLAUDE.md)

## Cél
Androidra telepíthető (APK) térinformatikai **telek-előszűrő** app. A felhasználó telket jelöl ki
(rajzolás, GPS-bejárás, import, koordináta/cím), az app elemzi (domborzat, lejtés, kitettség,
Natura 2000, árvíz, közelség, napelem-hozam), szabályalapú lámpákkal pontoz, és PDF riportot készít.
Célközönség: ingatlanfejlesztők, építészirodák, napelemes cégek, földmérők. **A UI nyelve magyar.**

Az eredmény *előszűrés*: nem helyettesíti a tulajdoni lapot és a helyi építési szabályzatot.

## Tech stack és döntések
| Terület | Választás | Indok |
|---|---|---|
| Build | Vite + TypeScript 6 (strict) | gyors dev, natív ESM, Worker-támogatás |
| UI | **Vanilla TS** + saját mini komponens-helperek (`src/ui/dom.ts`) és egy kis eseménytároló (`src/state/store.ts`) | 3 képernyő, a nehéz munka a MapLibre-ben és Workerben fut; egy keretrendszer csak méretet és absztrakciót adna a térkép-életciklus fölé. jQuery tilos. |
| Térkép | MapLibre GL JS | nyílt, vektoros, canvas → PDF kép |
| Rajzolás | **saját csúcsszerkesztő** (`src/map/editor.ts`) a terra-draw helyett | érintőképernyőn explicit gombok (pont hozzáadása, visszavonás, lezárás) és csúcshúzás kell; ugyanaz a szerkesztő szolgálja ki a GPS-bejárást, a koordináta-bevitelt és a metszetvonalat, közös visszavonási veremmel. A terra-draw egérközpontú (hover-előnézet, első pontra kattintó lezárás), és ~150 kB plusz. |
| Geometria | Turf.js (bbox, metszés), saját síkbeli függvények EOV-ban (`src/analysis/planar.ts`) | a Turf gömbi/WGS84 méter-számításai helyett **minden méteres számítás EOV-ban** |
| Vetítés | proj4, EPSG:23700 (EOV) ↔ EPSG:4326 | |
| Raszter | geotiff.js, COG range request, natív HTTP kliensen át (CORS) | |
| Natív | Capacitor 8 + Geolocation, Camera, Filesystem, Share, Preferences, Network, App, SplashScreen, StatusBar, CapacitorHttp, @capacitor-community/sqlite | |
| PDF | jsPDF + beágyazott Barlow TTF (ő/ű miatt kötelező) | |
| Teszt | Vitest | |
| Lint | ESLint (typescript-eslint) + Prettier | |

## Könyvtárszerkezet
```
src/
  main.ts              belépési pont, képernyők, navigáció
  config.ts            végpontok, attribúciók, User-Agent, alapértékek
  types.ts             közös domain-típusok (Parcel, AnalysisResult, …)
  state/               store (pub/sub), beállítások
  map/                 MapLibre init, stílusok, rétegek, rajzolás (terra-draw), markerek
  analysis/            pipeline, planar geometria, EOV, DEM-feldolgozás (worker), pontozás
  services/            külső adatforrások egységes interfésszel (DataService<TReq,TRes>)
  demo/                demó mód: procedurális terep, rétegek, mintatelkek
  storage/             SQLite (natív) / IndexedDB (web) repository, cache
  ui/                  képernyők, bottom sheet, dialógusok, komponensek, stílus
  report/              PDF, metszetdiagram, export (GeoJSON/KML)
  import/              GeoJSON, KML, DXF, koordináta-parser
  native/              Capacitor-csomagolók (http, geolocation, camera, share…)
scripts/               build-idejű adatelőkészítés (Natura GeoJSON), ikonok, sandbox SDK
tests/                 Vitest
android/               Capacitor Android projekt (generált + testreszabott)
```

## Konvenciók
- TS strict, nincs `any` (kivéve típusozatlan külső lib határán, kommenttel).
- Minden külső forrás: `src/services/<forrás>.ts`, `DataService` interfész: `id`, `label`,
  `attribution`, `fetch(req, ctx)` → `ServiceResult<T>` (`ok` | `unavailable` | `error` + magyar,
  konkrét üzenet és teendő). **Soha nem gyártunk hamis adatot élő módban.**
- Cache: `src/storage/cache.ts` (kulcs = forrás + kerekített bbox/paraméterek, TTL forrásonként).
- CORS-korlátos API-k (PVGIS, Nominatim, Overpass, Copernicus S3, JRC) a `native/http.ts`-en
  keresztül (natívon CapacitorHttp, böngészőben fetch).
- Koordináták: belső tárolás WGS84 `[lon, lat]` (GeoJSON), számítás előtt EOV-ba vetítés
  (`[x=Y kelet, y=X észak]` méterben).
- A demó mód mindig látható jelzést kap (UI szalag + riport vízjel).
- UI szövegek magyarul, hibaüzenet: *mi nem sikerült + mit tehet a felhasználó*.
- Stílus: CSS változók (`src/ui/styles/tokens.css`), light/dark, mobil-first, safe-area,
  min. 44 px érintési cél. Betűk: Barlow / Barlow Semi Condensed helyben csomagolva.
- Nehéz raszterfeldolgozás Web Workerben (`src/analysis/dem.worker.ts`).
- Commit üzenetek: magyar vagy angol, rövid, fázisra hivatkozva.

## Parancsok
```
npm run dev          # böngészős fejlesztés (demó mód offline is)
npm run build        # tsc + vite build → dist/
npm test             # vitest
npm run lint         # eslint + prettier --check
npx cap sync android # web → android
npm run android:debug  # build + sync + gradlew assembleDebug
```
Sandbox (dl.google.com nélküli) környezetben az SDK: `scripts/ci/bootstrap-android-sdk-sandbox.sh`.
A Google Maven (dl.google.com) ott sem érhető el, ezért az APK-t a GitHub Actions
(`.github/workflows/android.yml`) építi; az artifact neve `teleklato-debug-apk`.

## Fázisok
1. Projektváz, CLAUDE.md, PLAN.md, Capacitor Android build üres térképpel.
2. Demó mód: szimulált terep, rajzolás, teljes elemzés és riport offline.
3. Élő adatforrások egyenként (DEM, Overpass, Natura, PVGIS, árvíz, geokódolás), tesztelve.
4. GPS-bejárás, fotók, importok.
5. Projektek, összehasonlítás, beállítható szabályok.
6. PDF riport, export, megosztás.
7. Csiszolás, tesztek, release APK, README.

Minden fázis végén: `npm run lint && npm test && npm run build && npm run android:debug`,
majd PLAN.md frissítése.
