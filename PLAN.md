# Teleklátó – terv és állapot (PLAN.md)

Jelmagyarázat: ✅ kész · 🔄 folyamatban · ⏳ hátra van · ⚠️ korlátozás / döntés kell

## Adatforrás-ellenőrzés (2026-10-03)
A fejlesztői konténer hálózata szűrt, ezért a valódi próbahívások a CI-ben futnak
(`scripts/check-sources.mjs`, GitHub Actions „Adatforrások” job). Ahol egy forrás nem elérhető,
az app kezelt hibaállapotot mutat („Nem elérhető adat”), hamis adatot soha.

| Forrás | Végpont | Próbahívás (CI) | Megjegyzés |
|---|---|---|---|
| Háttértérkép | OpenFreeMap `tiles.openfreemap.org/styles/liberty` | ✅ 111 réteg, CORS `*` | ingyenes, kulcs nélkül, kereskedelmi célra is; OSM-attribúció; futásidőben zsályazöldre színezve |
| Ortofotó | Lechner INSPIRE WMS `…/geoserver/OI.2022/wms` | ✅ réteg: `OrthoimageCoverage2022`, Fees/AccessConstraints: NONE; **csak WMS 1.3.0 GetMap működik** (1.1.1 → ServiceException); nincs CORS | natív HTTP-protokollon (`nhttps://`) töltjük |
| Domborzat | Copernicus DEM GLO-30 COG (AWS) | ✅ 3600×3600 px/fok, 1024² csempe, Gödöllő ~207 m; **nincs CORS** | natív range request |
| Közelség | Overpass API | ✅ CORS `*` | 1 párhuzamos kérés, 1,5 s köz, 429-re visszalépés, cache 30 nap |
| Natura 2000 | EEA ArcGIS REST, 3 poligonréteg (SCI/SAC, SPA, mindkettő); mezők: SITECODE, SITENAME, MS, SITETYPE | ✅ CORS tükrözött | build-időben HU kivonat: **525 terület, 4,9 MB** (`npm run data:natura`, CI-ben automatikus) |
| Árvíz | JRC EFAS RP100 `Europe_RP100_filled_depth.tif` | ✅ 110162×51992 px, 256² csempe, nodata −9999, ablakolvasás ~0,6 s; **nincs CORS** | natív range request |
| Napelem | PVGIS 5.3 PVcalc | ✅ Gödöllő: 5° dél 1076, optimális (39°) 1232 kWh/kWp, SARAH3; **nincs CORS** | küszöbök ehhez kalibrálva |
| Geokódolás | Nominatim | ✅ CORS `*` | 1 kérés/s, User-Agent, nincs autocomplete, cache |

## Fázis 1 – Projektváz, Android build üres térképpel ✅
- [x] CLAUDE.md, PLAN.md
- [x] Vite + TS strict, ESLint + Prettier, Vitest
- [x] Alap UI-keret: alsó navigáció (Térkép / Projektek / Beállítások), téma, betűk
- [x] MapLibre térkép (OpenFreeMap, offline esetén üres zsályazöld háttér + üzenet)
- [x] Capacitor 8 Android projekt (hu.teleklato.app, „Teleklátó”), minimális engedélyek
- [x] Debug APK build – GitHub Actions (a fejlesztői konténerből a Google Maven nem érhető el)

## Fázis 2 – Demó mód ✅
- [x] procedurális domborzat (EOV-ban definiált függvény), patak, utak, falu, 22 kV-os vezeték, Natura poligon, ártér
- [x] demó alaptérkép: domborzatárnyékolás + szintvonalak (Workerben), HTML-feliratok (glyph-szerver nélkül)
- [x] 3 mintatelek: zöld (Napos domboldal), piros (Ártéri rét), sárga (Vezeték alatti északi lejtő)
- [x] saját csúcsszerkesztő (pont, visszavonás, csúcshúzás, beszúrás felezőponttal, lezárás) – terra-draw helyett, lásd CLAUDE.md
- [x] elemzési pipeline (async, folyamatjelző, lépésenkénti hibakezelés), DEM Web Workerben
- [x] terület/kerület/középpont EOV-ban, magasság, lejtés, kitettség (Horn), metszet (átló + felhasználói vonal)
- [x] overlay % (pontos poligonvágás), közelség, szimulált PV, pontozás lámpákkal
- [x] bottom sheet eredmények, PDF riport (Barlow TTF, térképkép méretléccel, metszet, lámpák, DEMÓ vízjel)
- [x] Vitest: 51 teszt (planar, terrain, scoring, demó pipeline, EOV)

## Fázis 3 – Élő adatforrások ✅
- [x] egységes `DataService` + IndexedDB gyorsítótár (lejárt cache offline tartalék) + kérésütemező
- [x] Copernicus DEM: COG ablakolvasás natív range requesttel, csempe-mozaik, Workerben EOV-rácsra mintavételezve
- [x] Overpass: utak (gyalogutak nélkül), légvezeték/földkábel feszültséggel, vízfolyások, épületek (1 km)
- [x] Natura 2000: csomagolt HU kivonat (offline) → élő EEA ArcGIS (rétegfelderítés, mind a 3 réteg)
- [x] JRC árvíz RP100: ablakolvasás, átfedés % + max. vízmélység
- [x] PVGIS: terep szerinti + optimális dőlés, magyar hibaüzenetek (pl. tenger → nem elérhető)
- [x] Nominatim keresőmező (demó módban helyi keresés), Lechner ortofotó réteg
- [x] tesztek: szintetikus GeoTIFF range requesttel, mockolt szolgáltatások, élő pipeline + offline cache
- [x] CI próbahívások minden forrásra (lásd fenti táblázat)

## Fázis 4 – GPS-bejárás, fotók, importok ✅
- [x] engedélykérés előtti magyarázó képernyő (hely, kamera); megtagadásnál konkrét teendő
- [x] saját pozíció gomb (követés, pontossági kör)
- [x] GPS-bejárás: pontrögzítés gombnyomásra (több fix súlyozott átlaga), automatikus pontrögzítés 5/10/20/50 m-enként,
      pontosság kijelzése színkóddal, gyenge jelnél megerősítés; a pontok utólag húzhatók
- [x] terepi fotó: kamera, GPS-pozíció + iránytű-irány, bélyegkép, app-tárhely; térképi jelölő irány-nyíllal, megtekintés,
      megjegyzés, törlés; demó módban / 2 km-nél távolabbi felvételnél a telek középpontjához csatolva
- [x] import: GeoJSON (EPSG:23700 felismerés), KML, DXF (zárt LWPOLYLINE, EOV, tengelycsere-felismerés)
- [x] Android megosztás/megnyitás intent (saját `SharedFilePlugin`, GeoJSON/KML/DXF MIME-típusok)
- [x] koordináta-bevitel: WGS84 (tizedes / fok-perc-másodperc) vagy EOV, sorrend-felismerés; 1 pont → odaugrás
- [x] tesztek: koordináta-parser, GeoJSON/KML/DXF import, GPS-segédfüggvények
## Fázis 5 – Projektek (SQLite), összehasonlítás, szerkeszthető szabályok ✅
- [x] tárolás: SQLite (@capacitor-community/sqlite) Androidon, IndexedDB böngészőben, közös repository-interfész
- [x] mentés névvel, megjegyzéssel, címkékkel; geometria, elemzés, fotók, metszetvonal, dátumok
- [x] Projektek: lista (lámpa, terület, dátum, fotók, címkék), ékezetfüggetlen keresés, szerkesztés, törlés megerősítéssel
- [x] 2–3 telek összehasonlítása: mutatók + szempontonkénti lámpák, legjobb érték kiemelése
- [x] Beállítások: szerkeszthető küszöbök (11 szempont, be/ki), profilok (Általános, Napelempark, Lakóépület),
      JSON export/import (cég saját szabályrendszere), légvezeték-keresztezés lámpája
- [x] szabályváltozáskor a nyitott és a megnyitott mentett telkek azonnal újrapontozódnak (hálózat nélkül)
- [x] riport fejléce: cégnév, logó; GPS- és PV-paraméterek; gyorsítótár ürítése; adatforrások és licencek
- [x] javítva: a panel fejlécének gombjai (pointer capture), a félig nyitott panel tartalma görgethető
## Fázis 6 – PDF riport, export (GeoJSON/KML), Share ✅
- [x] PDF: fejléc cégnévvel és logóval, DEMÓ jelölés és vízjel, fekvő térképkép méretléccel, északjellel és számozott
      fotópontokkal, összesített ítélet, mutatótáblázat, lámpák indoklással, metszetdiagram(ok), részletek, kimaradt lépések,
      töréspontok EOV-ban, terepi fotók, adatforrások, jogi nyilatkozat, oldalszámozás
- [x] export: GeoJSON (WGS84), GeoJSON (EOV, EPSG:23700), KML – elemzési összegzéssel, fotópontokkal, metszetvonallal
- [x] megosztás: natív Share-lap (Android), böngészőben letöltés; export a Projektek menüből is
- [x] tesztek: export visszaimportálással (területegyezés), KML XML-érvényesség, PDF-előállítás beágyazott betűvel
## Fázis 7 – Csiszolás, ikon/splash, release APK, README ✅
- [x] adaptív app ikon és splash (világos/sötét) az arculattal – SVG mesterfájlok: `assets/`
- [x] Capacitor 8 SystemBars: safe-area CSS-változók, sávstílus téma és demó szerint
- [x] Android vissza gomb (dialógus → szerkesztés → képernyő → panel → háttérbe)
- [x] első indításkori üdvözlés módválasztással, globális hibakezelő, koppintással zárható üzenetek
- [x] kódfelosztás: PDF, importálók, élő szolgáltatások lusta betöltése (fő csomag 2,1 → 1,36 MB)
- [x] release APK a CI-ben (aláírás GitHub Secrets-ből; titkok nélkül aláíratlan) – ellenőrizve
- [x] README: előfeltételek, build, emulátor, aláírt release, telepítés telefonra, hibaelhárítás
- [x] 106 Vitest teszt, ESLint + Prettier tiszta

## Döntésre vár
- Release aláíró kulcs: a CI-titkok (`ANDROID_KEYSTORE_*`) megadása után aláírt release APK készül.
- A `hu.teleklato.app` csomagnév végleges-e (Play Áruházhoz később nem módosítható).
- Szükség esetén a GitHub Actions helyett helyi build: a fejlesztői konténerből a Google Maven nem érhető el.
