import type { DataProvider } from './provider';
import { createDemoProvider } from '../demo/provider';

let demo: DataProvider | null = null;
let live: DataProvider | null = null;

/** Az élő szolgáltató (geotiff, Overpass stb.) csak első használatkor töltődik be. */
export async function getProvider(demoMode: boolean): Promise<DataProvider> {
  if (demoMode) return (demo ??= createDemoProvider());
  if (!live) {
    const { createLiveProvider } = await import('../services/liveProvider');
    live = createLiveProvider();
  }
  return live;
}
