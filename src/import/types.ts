import type { Polygon } from 'geojson';

export interface ImportResult {
  polygon: Polygon;
  name?: string;
  /** figyelmeztetések, információk a felhasználónak */
  notes: string[];
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}
