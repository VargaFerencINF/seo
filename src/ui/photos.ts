/** Terepi fotók: készítés (GPS + irány), térképi jelölők, megtekintés, törlés. */
import { Marker } from 'maplibre-gl';
import { h } from './dom';
import { capturePhoto, cameraPermission, deletePhotoFile, photoSrc } from '../native/camera';
import { currentFix, requestLocation } from '../native/geo';
import { currentHeading, startCompass } from '../native/compass';
import { explainCamera, explainLocation } from './permissions';
import { confirmDialog, dialog, toast } from './feedback';
import { session, updateParcel } from '../state/session';
import type { Photo } from '../types';
import type { MapScreen } from './screens/mapScreen';
import { uid } from '../util/id';
import { computeGeometry } from '../analysis/geometry';
import { toEov } from '../analysis/eov';
import { dist } from '../analysis/planar';
import { fmtDate, fmtNum } from '../util/format';

export class PhotoManager {
  private markers: Marker[] = [];

  constructor(private screen: MapScreen) {
    session.subscribe((s, prev) => {
      if (s.parcel?.photos !== prev.parcel?.photos || s.parcel?.id !== prev.parcel?.id) this.renderMarkers();
    });
  }

  async take(): Promise<void> {
    const parcel = session.get().parcel;
    if (!parcel) return;
    if (!(await explainCamera())) return;
    const perm = await cameraPermission();
    if (perm === 'denied') {
      toast(
        'A kamera nincs engedélyezve. Engedélyezd: Beállítások → Alkalmazások → Teleklátó → Engedélyek → Kamera.',
        'error',
        8000,
      );
      return;
    }
    startCompass();
    // a pozíciót a fotózással párhuzamosan kérjük, hogy a felvétel helyét rögzítsük
    const located = (async () => {
      if (!(await explainLocation())) return null;
      await requestLocation();
      try {
        return await currentFix(12000);
      } catch {
        return null;
      }
    })();
    const id = uid();
    let img;
    try {
      img = await capturePhoto(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(msg)) return;
      toast(
        `A fotó nem készült el: ${msg}. Ellenőrizd a kamera-engedélyt és a szabad tárhelyet.`,
        'error',
        7000,
      );
      return;
    }
    if (!img) return;
    const heading = currentHeading();
    let fix = await located;
    const c = computeGeometry(parcel.geometry).centroidWgs;
    let note = fix ? '' : 'GPS-pozíció nélkül – a telek középpontjához csatolva';
    if (fix) {
      const d = dist(toEov([fix.lon, fix.lat]), toEov(c));
      if (parcel.mode === 'demo' || d > 2000) {
        note =
          parcel.mode === 'demo'
            ? 'Demó: a valódi GPS-pozíció helyett a telek középpontjához csatolva'
            : `A felvétel helye ${fmtNum(d / 1000, 1)} km-re van a telektől – a telek középpontjához csatolva`;
        fix = null;
      }
    }
    const photo: Photo = {
      id,
      parcelId: parcel.id,
      createdAt: new Date().toISOString(),
      lon: fix?.lon ?? c[0],
      lat: fix?.lat ?? c[1],
      accuracyM: fix?.accuracyM ?? null,
      headingDeg: heading,
      uri: img.uri,
      thumb: img.thumb,
      note,
    };
    updateParcel({ photos: [...(session.get().parcel?.photos ?? []), photo] });
    toast(fix ? `Fotó csatolva (±${fmtNum(fix.accuracyM, 0)} m)` : `Fotó csatolva. ${note}.`, 'info', 5000);
  }

  /** Bélyegkép-sáv a telek paneljén */
  strip(): HTMLElement | null {
    const p = session.get().parcel;
    if (!p?.photos.length) return null;
    return h(
      'div',
      { class: 'card' },
      h('h2', null, `Terepi fotók (${p.photos.length})`),
      h(
        'div',
        { style: 'display:flex;gap:8px;overflow-x:auto;padding-bottom:4px' },
        p.photos.map((ph) =>
          h('button', {
            style: `flex:none;width:88px;height:66px;border-radius:8px;border:0;background:center/cover url("${ph.thumb}");cursor:pointer`,
            'aria-label': `Fotó megnyitása, ${fmtDate(ph.createdAt)}`,
            onclick: () => void this.view(ph),
          }),
        ),
      ),
    );
  }

  renderMarkers(): void {
    for (const m of this.markers) m.remove();
    this.markers = [];
    const p = session.get().parcel;
    if (!p) return;
    for (const ph of p.photos) {
      const el = h(
        'button',
        {
          class: 'photo-marker',
          style: `background-image:url("${ph.thumb}")`,
          'aria-label': `Fotó, ${fmtDate(ph.createdAt)}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            void this.view(ph);
          },
        },
        ph.headingDeg !== null
          ? h('div', { class: 'dir', style: `transform: rotate(${ph.headingDeg}deg)` })
          : null,
      );
      this.markers.push(new Marker({ element: el }).setLngLat([ph.lon, ph.lat]).addTo(this.screen.view.map));
    }
  }

  async view(ph: Photo): Promise<void> {
    const note = h('textarea', {
      'aria-label': 'Megjegyzés',
      placeholder: 'Megjegyzés a fotóhoz…',
    }) as HTMLTextAreaElement;
    note.value = ph.note;
    const v = await dialog({
      title: 'Terepi fotó',
      body: h(
        'div',
        null,
        h('img', {
          src: photoSrc(ph.uri),
          alt: 'Terepi fotó',
          style: 'width:100%;border-radius:10px;margin-bottom:8px',
        }),
        h(
          'p',
          { class: 'muted', style: 'font-size:13px' },
          `${fmtDate(ph.createdAt)} · ${ph.lat.toFixed(6)}, ${ph.lon.toFixed(6)}`,
          ph.accuracyM !== null ? ` · ±${fmtNum(ph.accuracyM, 0)} m` : '',
          ph.headingDeg !== null ? ` · irány ${ph.headingDeg}°` : '',
        ),
        h('div', { class: 'field' }, note),
      ),
      actions: [
        { label: 'Törlés', value: 'delete', kind: 'danger' },
        { label: 'Bezárás', value: 'close', kind: 'primary' },
      ],
      dismissValue: 'close',
    });
    const parcel = session.get().parcel;
    if (!parcel) return;
    if (v === 'delete') {
      if (!(await confirmDialog('Fotó törlése', 'Biztosan törlöd ezt a fotót?', 'Törlés', true))) return;
      await deletePhotoFile(ph.uri);
      updateParcel({ photos: parcel.photos.filter((x) => x.id !== ph.id) });
      return;
    }
    if (note.value !== ph.note)
      updateParcel({ photos: parcel.photos.map((x) => (x.id === ph.id ? { ...x, note: note.value } : x)) });
  }
}
