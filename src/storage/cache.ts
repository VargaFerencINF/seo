/**
 * Tartós kulcs–érték gyorsítótár a külső adatokhoz (IndexedDB; ha nincs, memória).
 * A WebView IndexedDB-je az app adatkönyvtárában él, így a cache offline is elérhető.
 */
const DB_NAME = 'teleklato-cache';
const STORE = 'entries';

interface Entry {
  key: string;
  value: unknown;
  storedAt: number;
  expiresAt: number;
}

const memory = new Map<string, Entry>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

async function tx<T>(
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await openDb();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
}

export interface CacheHit<T> {
  value: T;
  storedAt: number;
  expired: boolean;
}

/** Olvasás; a lejárt bejegyzést is visszaadja (offline tartaléknak), `expired` jelzéssel. */
export async function cacheGet<T>(key: string): Promise<CacheHit<T> | null> {
  const e = memory.get(key) ?? ((await tx('readonly', (s) => s.get(key) as IDBRequest<Entry>)) || undefined);
  if (!e) return null;
  memory.set(key, e);
  return { value: e.value as T, storedAt: e.storedAt, expired: Date.now() > e.expiresAt };
}

export async function cacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const e: Entry = { key, value, storedAt: Date.now(), expiresAt: Date.now() + ttlMs };
  memory.set(key, e);
  await tx('readwrite', (s) => s.put(e));
}

export async function cacheClear(): Promise<void> {
  memory.clear();
  await tx('readwrite', (s) => s.clear());
}

export async function cacheStats(): Promise<{ count: number }> {
  const n = await tx('readonly', (s) => s.count());
  return { count: n ?? memory.size };
}

/** Teszteléshez */
export function cacheResetMemory(): void {
  memory.clear();
}

/** Koordináták kerekítése cache-kulcshoz (~1 m) */
export function keyNum(v: number, digits = 5): string {
  return v.toFixed(digits);
}
