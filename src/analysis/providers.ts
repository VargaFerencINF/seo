import type { DataProvider } from './provider';
import { createDemoProvider } from '../demo/provider';
import { createLiveProvider } from '../services/liveProvider';

let demo: DataProvider | null = null;
let live: DataProvider | null = null;

export function getProvider(demoMode: boolean): DataProvider {
  if (demoMode) return (demo ??= createDemoProvider());
  return (live ??= createLiveProvider());
}
