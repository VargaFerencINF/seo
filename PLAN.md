# Teleklátó – terv és állapot (PLAN.md)

Jelmagyarázat: ✅ kész · 🔄 folyamatban · ⏳ hátra van · ⚠️ korlátozás / döntés kell

## Adatforrás-ellenőrzés (2026-10-03)
A fejlesztői konténer hálózata szűrt; ahol próbahívás nem volt lehetséges, a dokumentáció alapján
dolgozunk, és az app kezelt hibaállapotot mutat („Nem elérhető adat”), hamis adatot soha.

| Forrás | Végpont | Ellenőrzés | Megjegyzés |
|---|---|---|---|
| Háttértérkép | OpenFreeMap `https://tiles.openfreemap.org/styles/liberty` | dokumentáció | ingyenes, API-kulcs nélkül, kereskedelmi célra is; OSM-attribúció kötelező. Stílust futásidőben zsályazöldre színezzük. |
| Ortofotó | Lechner INSPIRE WMS `https://inspire.lechnerkozpont.hu/geoserver/OI.2018/wms` | dokumentáció (INSPIRE Geoportal) | rétegnevet GetCapabilities-ből olvassuk, nem találjuk ki; ha nem érhető el, a réteg kikapcsol hibaüzenettel |
| Domborzat | Copernicus DEM GLO-30 COG, `copernicus-dem-30m.s3.amazonaws.com` | ✅ próbahívás: 206 Partial Content, **nincs CORS fejléc** → natív HTTP kliens | attribúció: „produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 …” |
| Közelség | Overpass API `https://overpass-api.de/api/interpreter` | dokumentáció | 2 párhuzamos slot/IP, ~10 000 kérés/nap; sorosítás + cache + 429 kezelés |
| Natura 2000 | EEA ArcGIS REST `bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Sites/MapServer` + build-idejű HU GeoJSON (`scripts/build-natura.mjs`) | dokumentáció | réteg-azonosítót a szolgáltatás leírásából olvassuk; a csomagolt GeoJSON-t a script tölti le (EEA GPKG) |
| Árvíz | JRC EFAS „River flood hazard maps for Europe” v3.1, `jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-EFAS/flood_hazard/Europe_RP100_filled_depth.tif` | dokumentáció | ~270 MB GeoTIFF, range request-tel ablak olvasása; ha nem megy: „Nem elérhető adat” |
| Napelem | PVGIS `https://re.jrc.ec.europa.eu/api/v5_3/PVcalc` | dokumentáció | AJAX/CORS tiltott → CapacitorHttp; aspect: 0 = dél, 90 = nyugat, −90 = kelet |
| Geokódolás | Nominatim `https://nominatim.openstreetmap.org/search` | dokumentáció | max 1 kérés/s, azonosító User-Agent, nincs autocomplete, cache |

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

## Fázis 3 – Élő adatforrások 🔄
DEM (COG), Overpass, Natura, PVGIS, árvíz, Nominatim – egyenként, mock-olt HTTP-vel tesztelve.

## Fázis 4 – GPS-bejárás, fotók, importok ⏳
## Fázis 5 – Projektek (SQLite), összehasonlítás, szerkeszthető szabályok ⏳
## Fázis 6 – PDF riport, export (GeoJSON/KML), Share ⏳
## Fázis 7 – Csiszolás, ikon/splash, release APK, README ⏳
