/** Az aktuális munkamenet: kiválasztott telek, szerkesztési / elemzési állapot. */
import type { Polygon } from 'geojson';
import { createStore } from './store';
import type { DataMode, Parcel, ParcelSource, StepState } from '../types';
import { uid } from '../util/id';

export type MapMode = 'idle' | 'drawing' | 'profile' | 'walking' | 'analyzing' | 'ready';

export interface Session {
  parcel: Parcel | null;
  mode: MapMode;
  steps: StepState[];
  progress: number;
  /** a telek mentve van-e a projektek között (és nincs mentetlen módosítás) */
  saved: boolean;
}

export const session = createStore<Session>({
  parcel: null,
  mode: 'idle',
  steps: [],
  progress: 0,
  saved: false,
});

export function newParcel(geometry: Polygon, source: ParcelSource, mode: DataMode, name?: string): Parcel {
  const now = new Date().toISOString();
  return {
    id: uid(),
    name:
      name ??
      `Telek ${new Date().toLocaleDateString('hu-HU')} ${new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' })}`,
    note: '',
    tags: [],
    geometry,
    source,
    mode,
    createdAt: now,
    updatedAt: now,
    analysis: null,
    photos: [],
    profileLine: null,
  };
}

export function updateParcel(patch: Partial<Parcel>): void {
  const p = session.get().parcel;
  if (!p) return;
  session.patch({ parcel: { ...p, ...patch, updatedAt: new Date().toISOString() }, saved: false });
}
