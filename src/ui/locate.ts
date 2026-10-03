/** „Saját pozíció” gomb: követés be/ki, első fixnél odaugrik. */
import { h, svg } from './dom';
import { icons } from './icons';
import { describeGeoError, requestLocation, watchFixes } from '../native/geo';
import { explainLocation } from './permissions';
import { toast } from './feedback';
import type { MapView } from '../map/mapView';
import type { PositionLayer } from '../map/positionLayer';

export function locateButton(
  view: MapView,
  position: PositionLayer,
  isBusy: () => boolean,
): HTMLButtonElement {
  let stop: (() => void) | null = null;
  let first = true;
  const btn = h(
    'button',
    { class: 'map-fab', 'aria-label': 'Saját pozíció', 'aria-pressed': 'false' },
    svg(icons.locate),
  );
  const off = () => {
    stop?.();
    stop = null;
    if (!isBusy()) position.set(null);
    btn.setAttribute('aria-pressed', 'false');
    btn.classList.remove('locating');
  };
  btn.addEventListener('click', async () => {
    if (stop) return off();
    if (!(await explainLocation())) return;
    if ((await requestLocation()) === 'denied') {
      toast(describeGeoError('permission denied'), 'error', 8000);
      return;
    }
    first = true;
    btn.setAttribute('aria-pressed', 'true');
    btn.classList.add('locating');
    try {
      stop = await watchFixes(
        (f) => {
          position.set(f);
          btn.classList.remove('locating');
          if (first) view.map.flyTo({ center: [f.lon, f.lat], zoom: Math.max(view.map.getZoom(), 16.5) });
          first = false;
        },
        (msg) => {
          toast(msg, 'error', 7000);
          off();
        },
      );
    } catch (err) {
      toast(describeGeoError(err), 'error', 7000);
      off();
    }
  });
  return btn;
}
