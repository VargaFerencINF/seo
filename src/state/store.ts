/** Kicsi, típusos pub/sub tároló. */
export type Listener<T> = (value: T, prev: T) => void;

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  patch(partial: Partial<T>): void;
  subscribe(fn: Listener<T>): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<Listener<T>>();
  const set: Store<T>['set'] = (next) => {
    const prev = value;
    value = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
    if (value !== prev) for (const fn of [...listeners]) fn(value, prev);
  };
  return {
    get: () => value,
    set,
    patch: (partial) => set((prev) => ({ ...prev, ...partial })),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Egyszerű eseménybusz */
export class Emitter<E extends Record<string, unknown>> {
  private map = new Map<keyof E, Set<(p: never) => void>>();
  on<K extends keyof E>(type: K, fn: (payload: E[K]) => void): () => void {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn as (p: never) => void);
    return () => set.delete(fn as (p: never) => void);
  }
  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const fn of [...(this.map.get(type) ?? [])]) (fn as (p: E[K]) => void)(payload);
  }
}
