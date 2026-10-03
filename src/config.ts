/** Központi konfiguráció: végpontok, attribúciók, alapértékek. */
import type { SourceInfo } from './types';

export const APP_NAME = 'Teleklátó';
export const APP_VERSION = '0.1.0';
export const APP_ID = 'hu.teleklato.app';
/** Nominatim / Overpass használati szabályzat: azonosítható kliens */
export const USER_AGENT = `Teleklato/${APP_VERSION} (Android; ${APP_ID})`;

export const ENDPOINTS = {
  basemapStyle: 'https://tiles.openfreemap.org/styles/liberty',
  orthoWms: 'https://inspire.lechnerkozpont.hu/geoserver/OI.2018/wms',
  copernicusDem: 'https://copernicus-dem-30m.s3.amazonaws.com',
  overpass: 'https://overpass-api.de/api/interpreter',
  naturaArcgis:
    'https://bio.discomap.eea.europa.eu/arcgis/rest/services/ProtectedSites/Natura2000Sites/MapServer',
  jrcFloodRp100:
    'https://jeodpp.jrc.ec.europa.eu/ftp/jrc-opendata/CEMS-EFAS/flood_hazard/Europe_RP100_filled_depth.tif',
  pvgis: 'https://re.jrc.ec.europa.eu/api/v5_3/PVcalc',
  nominatim: 'https://nominatim.openstreetmap.org',
} as const;

export const SOURCES = {
  basemap: {
    id: 'basemap',
    label: 'Háttértérkép (OpenFreeMap)',
    attribution: '© OpenFreeMap, © OpenMapTiles, adatok © OpenStreetMap közreműködők (ODbL)',
  },
  ortho: {
    id: 'ortho',
    label: 'Ortofotó (Lechner Tudásközpont)',
    attribution: 'Ortofotó © Lechner Tudásközpont (INSPIRE)',
  },
  dem: {
    id: 'dem',
    label: 'Domborzat (Copernicus DEM GLO-30)',
    attribution:
      'Produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved. The organisations in charge of the Copernicus programme by law or by delegation do not incur any liability for any use of the Copernicus WorldDEM-30.',
  },
  overpass: {
    id: 'overpass',
    label: 'Közelség (OpenStreetMap / Overpass API)',
    attribution: 'Adatok © OpenStreetMap közreműködők (ODbL), lekérdezés: Overpass API',
  },
  natura: {
    id: 'natura',
    label: 'Natura 2000 (EEA)',
    attribution: 'Natura 2000 adatbázis © Európai Környezetvédelmi Ügynökség (EEA)',
  },
  flood: {
    id: 'flood',
    label: 'Árvízveszély (JRC, 100 éves visszatérés)',
    attribution:
      'River flood hazard maps for Europe and the Mediterranean Basin © European Commission, Joint Research Centre (JRC)',
  },
  pvgis: {
    id: 'pvgis',
    label: 'Napelem-hozam (PVGIS 5.3)',
    attribution: 'PVGIS © European Union, 2001–2026 (Joint Research Centre)',
  },
  nominatim: {
    id: 'nominatim',
    label: 'Címkeresés (Nominatim)',
    attribution: 'Geokódolás: Nominatim, adatok © OpenStreetMap közreműködők (ODbL)',
  },
  demo: {
    id: 'demo',
    label: 'Demó (szimulált adatok)',
    attribution: 'DEMÓ MÓD – szimulált terep és rétegek, nem valós adat',
  },
} satisfies Record<string, SourceInfo>;

/** Közelség-keresés sugara (m) */
export const PROXIMITY_RADIUS_M = 2000;

/** Magyarország közelítő kiterjedése WGS84-ben (térkép kezdőnézet, validálás) */
export const HU_BOUNDS: [[number, number], [number, number]] = [
  [16.0, 45.7],
  [22.95, 48.6],
];
export const HU_CENTER: [number, number] = [19.5, 47.15];

export const LEGAL_NOTICE =
  'Ez a riport automatikus előszűrés eredménye nyilvános és szimulált adatforrások alapján. ' +
  'Nem helyettesíti a tulajdoni lapot, a helyi építési szabályzatot (HÉSZ), a szakhatósági ' +
  'állásfoglalásokat, a geodéziai felmérést és a talajmechanikai vizsgálatot. A pontosságért ' +
  'és teljességért a készítő nem vállal felelősséget.';
