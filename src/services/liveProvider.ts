/** Élő adatszolgáltató – a 3. fázisban kerül bekötésre. */
import type { DataProvider } from '../analysis/provider';
import { SOURCES } from '../config';
import type { SourceInfo, SourceOutcome } from '../types';

const pending = <T>(source: SourceInfo): SourceOutcome<T> => ({
  status: 'unavailable',
  reason: 'Az élő adatforrás még nincs bekötve. Kapcsold be a Demó módot a Beállításokban.',
  source,
});

export function createLiveProvider(): DataProvider {
  return {
    mode: 'live',
    terrain: async () => pending(SOURCES.dem),
    natura: async () => pending(SOURCES.natura),
    flood: async () => pending(SOURCES.flood),
    proximity: async () => pending(SOURCES.overpass),
    pv: async () => pending(SOURCES.pvgis),
    attributions: () => [],
  };
}
