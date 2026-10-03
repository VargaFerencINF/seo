/**
 * Mentett telkek (projektek) tárolása.
 * - Android: SQLite (@capacitor-community/sqlite), `parcels` tábla
 * - Böngésző (fejlesztés): IndexedDB, azonos interfésszel
 * A sor ↔ objektum leképezés tiszta függvény (tesztelhető).
 */
import type { Lamp, Parcel } from '../types';
import { isNative } from '../native/http';

export interface ParcelSummary {
  id: string;
  name: string;
  note: string;
  tags: string[];
  mode: Parcel['mode'];
  source: Parcel['source'];
  areaM2: number | null;
  verdict: Lamp | null;
  updatedAt: string;
  createdAt: string;
  photoCount: number;
}

export interface ParcelRepository {
  list(): Promise<ParcelSummary[]>;
  get(id: string): Promise<Parcel | null>;
  save(p: Parcel): Promise<void>;
  remove(id: string): Promise<void>;
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS parcels (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  geometry TEXT NOT NULL,
  source TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  analysis TEXT,
  photos TEXT NOT NULL DEFAULT '[]',
  profile_line TEXT,
  verdict TEXT,
  area_m2 REAL,
  photo_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_parcels_updated ON parcels (updated_at DESC);
`;

export interface ParcelRow {
  id: string;
  name: string;
  note: string;
  tags: string;
  geometry: string;
  source: string;
  mode: string;
  created_at: string;
  updated_at: string;
  analysis: string | null;
  photos: string;
  profile_line: string | null;
  verdict: string | null;
  area_m2: number | null;
  photo_count: number;
}

export const ROW_COLUMNS: (keyof ParcelRow)[] = [
  'id',
  'name',
  'note',
  'tags',
  'geometry',
  'source',
  'mode',
  'created_at',
  'updated_at',
  'analysis',
  'photos',
  'profile_line',
  'verdict',
  'area_m2',
  'photo_count',
];

export function parcelToRow(p: Parcel): ParcelRow {
  return {
    id: p.id,
    name: p.name,
    note: p.note,
    tags: JSON.stringify(p.tags),
    geometry: JSON.stringify(p.geometry),
    source: p.source,
    mode: p.mode,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    analysis: p.analysis ? JSON.stringify(p.analysis) : null,
    photos: JSON.stringify(p.photos),
    profile_line: p.profileLine ? JSON.stringify(p.profileLine) : null,
    verdict: p.analysis?.score.overall ?? null,
    area_m2: p.analysis?.geometry.areaM2 ?? null,
    photo_count: p.photos.length,
  };
}

const parse = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export function rowToParcel(r: ParcelRow): Parcel {
  return {
    id: r.id,
    name: r.name,
    note: r.note ?? '',
    tags: parse<string[]>(r.tags, []),
    geometry: parse(r.geometry, { type: 'Polygon', coordinates: [] }),
    source: r.source as Parcel['source'],
    mode: r.mode as Parcel['mode'],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    analysis: parse(r.analysis, null),
    photos: parse(r.photos, []),
    profileLine: parse(r.profile_line, null),
  };
}

export function rowToSummary(
  r: Pick<
    ParcelRow,
    | 'id'
    | 'name'
    | 'note'
    | 'tags'
    | 'mode'
    | 'source'
    | 'area_m2'
    | 'verdict'
    | 'updated_at'
    | 'created_at'
    | 'photo_count'
  >,
): ParcelSummary {
  return {
    id: r.id,
    name: r.name,
    note: r.note ?? '',
    tags: parse<string[]>(r.tags, []),
    mode: r.mode as Parcel['mode'],
    source: r.source as Parcel['source'],
    areaM2: r.area_m2,
    verdict: (r.verdict as Lamp | null) ?? null,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
    photoCount: r.photo_count ?? 0,
  };
}

/** Keresés név, megjegyzés és címkék alapján (ékezet- és kisbetű-független) */
export function matchesQuery(s: ParcelSummary, q: string): boolean {
  const norm = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const needle = norm(q.trim());
  if (!needle) return true;
  return norm([s.name, s.note, ...s.tags].join(' ')).includes(needle);
}

// ------------------------------------------------------------------ SQLite (Android)

/** Minimális adatbázis-interfész (a plugin SQLiteDBConnection-jének részhalmaza) – teszthez mockolható */
export interface SqlDb {
  execute(statements: string): Promise<unknown>;
  run(statement: string, values?: unknown[]): Promise<unknown>;
  query(statement: string, values?: unknown[]): Promise<{ values?: unknown[] }>;
}

export class SqliteRepository implements ParcelRepository {
  private ready: Promise<SqlDb>;

  constructor(open: () => Promise<SqlDb>) {
    this.ready = open().then(async (db) => {
      await db.execute(SCHEMA);
      return db;
    });
  }

  async list(): Promise<ParcelSummary[]> {
    const db = await this.ready;
    const res = await db.query(
      'SELECT id, name, note, tags, mode, source, area_m2, verdict, updated_at, created_at, photo_count FROM parcels ORDER BY updated_at DESC',
    );
    return ((res.values ?? []) as ParcelRow[]).map(rowToSummary);
  }

  async get(id: string): Promise<Parcel | null> {
    const db = await this.ready;
    const res = await db.query('SELECT * FROM parcels WHERE id = ?', [id]);
    const row = (res.values ?? [])[0] as ParcelRow | undefined;
    return row ? rowToParcel(row) : null;
  }

  async save(p: Parcel): Promise<void> {
    const db = await this.ready;
    const row = parcelToRow(p);
    const cols = ROW_COLUMNS.join(', ');
    const marks = ROW_COLUMNS.map(() => '?').join(', ');
    await db.run(
      `INSERT OR REPLACE INTO parcels (${cols}) VALUES (${marks})`,
      ROW_COLUMNS.map((c) => row[c]),
    );
  }

  async remove(id: string): Promise<void> {
    const db = await this.ready;
    await db.run('DELETE FROM parcels WHERE id = ?', [id]);
  }
}

async function openNativeSqlite(): Promise<SqlDb> {
  const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
  const sqlite = new SQLiteConnection(CapacitorSQLite);
  const name = 'teleklato';
  await sqlite.checkConnectionsConsistency().catch(() => undefined);
  const exists = (await sqlite.isConnection(name, false)).result;
  const db = exists
    ? await sqlite.retrieveConnection(name, false)
    : await sqlite.createConnection(name, false, 'no-encryption', 1, false);
  await db.open();
  return db as unknown as SqlDb;
}

// ------------------------------------------------------------------ IndexedDB (böngésző)

export class IdbRepository implements ParcelRepository {
  private db: Promise<IDBDatabase>;

  constructor(name = 'teleklato-projects') {
    this.db = new Promise((resolve, reject) => {
      const req = indexedDB.open(name, 1);
      req.onupgradeneeded = () => req.result.createObjectStore('parcels', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB nem nyitható meg'));
    });
  }

  private async store(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db).transaction('parcels', mode).objectStore('parcels');
  }

  private req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error ?? new Error('IndexedDB hiba'));
    });
  }

  async list(): Promise<ParcelSummary[]> {
    const rows = await this.req((await this.store('readonly')).getAll() as IDBRequest<ParcelRow[]>);
    return rows.map(rowToSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<Parcel | null> {
    const row = await this.req((await this.store('readonly')).get(id) as IDBRequest<ParcelRow | undefined>);
    return row ? rowToParcel(row) : null;
  }

  async save(p: Parcel): Promise<void> {
    await this.req((await this.store('readwrite')).put(parcelToRow(p)));
  }

  async remove(id: string): Promise<void> {
    await this.req((await this.store('readwrite')).delete(id));
  }
}

// ------------------------------------------------------------------ memória (teszt)

export class MemoryRepository implements ParcelRepository {
  private rows = new Map<string, ParcelRow>();
  async list() {
    return [...this.rows.values()].map(rowToSummary).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string) {
    const r = this.rows.get(id);
    return r ? rowToParcel(r) : null;
  }
  async save(p: Parcel) {
    this.rows.set(p.id, parcelToRow(p));
  }
  async remove(id: string) {
    this.rows.delete(id);
  }
}

let repo: ParcelRepository | null = null;

export function getRepository(): ParcelRepository {
  if (!repo) {
    if (isNative()) repo = new SqliteRepository(openNativeSqlite);
    else if (typeof indexedDB !== 'undefined') repo = new IdbRepository();
    else repo = new MemoryRepository();
  }
  return repo;
}
