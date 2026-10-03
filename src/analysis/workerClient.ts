/** Web Worker kliens: a DEM-feldolgozás nem fagyasztja a UI-t. Worker hiányában szálon belül fut. */
import type { WorkerRequest, WorkerResponse } from './workerHandlers';

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: WorkerResponse) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!worker) {
    worker = new Worker(new URL('./dem.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (
      e: MessageEvent<{ id: number; ok: boolean; res?: WorkerResponse; error?: string }>,
    ) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.ok && e.data.res) p.resolve(e.data.res);
      else p.reject(new Error(e.data.error ?? 'Ismeretlen worker-hiba'));
    };
    worker.onerror = (e) => {
      for (const p of pending.values()) p.reject(new Error(`Worker hiba: ${e.message}`));
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

export async function runInWorker<T extends WorkerResponse['type']>(
  req: WorkerRequest,
): Promise<Extract<WorkerResponse, { type: T }>> {
  const w = getWorker();
  if (!w) {
    const { handle } = await import('./workerHandlers');
    return handle(req) as Extract<WorkerResponse, { type: T }>;
  }
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve: resolve as (r: WorkerResponse) => void, reject });
    w.postMessage({ id, req });
  });
}
