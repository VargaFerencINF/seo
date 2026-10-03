/// <reference lib="webworker" />
import { handle, type WorkerRequest } from './workerHandlers';

self.onmessage = (e: MessageEvent<{ id: number; req: WorkerRequest }>) => {
  const { id, req } = e.data;
  try {
    const res = handle(req);
    const transfer: Transferable[] = res.type === 'demo-base' ? [res.image.rgba.buffer as ArrayBuffer] : [];
    (self as unknown as Worker).postMessage({ id, ok: true, res }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
