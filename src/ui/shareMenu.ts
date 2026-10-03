/** Megosztás / export: PDF riport, GeoJSON (WGS84 / EOV), KML – natív megosztás-lappal. */
import { h, svg } from './dom';
import { icons } from './icons';
import { dialog, toast } from './feedback';
import { saveAndShare } from '../native/files';
import { exportFileName, toGeoJson, toKml } from '../report/export';
import type { Parcel } from '../types';

export async function shareMenu(p: Parcel, makePdf: () => Promise<void>): Promise<void> {
  const picked = await dialog({
    title: 'Megosztás és export',
    body: (close) => {
      const choice = (value: string, icon: string, title: string, sub: string, disabled = false) =>
        h(
          'button',
          {
            class: 'list-item',
            style: 'width:100%;text-align:left;font:inherit;color:inherit;cursor:pointer',
            disabled,
            onclick: () => close(value),
          },
          svg(icon),
          h('div', { class: 'grow' }, h('div', { class: 'title' }, title), h('div', { class: 'sub' }, sub)),
        );
      return h(
        'div',
        null,
        choice(
          'pdf',
          icons.pdf,
          'PDF riport',
          p.analysis ? 'Térkép, mutatók, lámpák, metszet, fotók, források' : 'Előbb futtasd az elemzést',
          !p.analysis,
        ),
        choice(
          'geojson',
          icons.export,
          'GeoJSON (WGS84)',
          'Webes térképekhez, GIS-hez; elemzési összegzéssel',
        ),
        choice(
          'geojson-eov',
          icons.export,
          'GeoJSON (EOV, EPSG:23700)',
          'Földmérő / tervező szoftverekhez, méterben',
        ),
        choice('kml', icons.export, 'KML', 'Google Earth, Google Térkép; fotópontokkal'),
      );
    },
    actions: [{ label: 'Mégse', value: 'cancel', kind: 'ghost' }],
  });
  try {
    if (picked === 'pdf') await makePdf();
    else if (picked === 'geojson')
      await saveAndShare(
        exportFileName(p, 'geojson'),
        JSON.stringify(toGeoJson(p, 'wgs84'), null, 1),
        'application/geo+json',
        'Telek (GeoJSON)',
      );
    else if (picked === 'geojson-eov')
      await saveAndShare(
        exportFileName(p, 'eov.geojson'),
        JSON.stringify(toGeoJson(p, 'eov'), null, 1),
        'application/geo+json',
        'Telek (GeoJSON, EOV)',
      );
    else if (picked === 'kml')
      await saveAndShare(
        exportFileName(p, 'kml'),
        toKml(p),
        'application/vnd.google-earth.kml+xml',
        'Telek (KML)',
      );
  } catch (err) {
    toast(
      `Az exportálás nem sikerült: ${err instanceof Error ? err.message : String(err)}. Ellenőrizd a szabad tárhelyet.`,
      'error',
      7000,
    );
  }
}
