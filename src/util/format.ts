/** Magyar számformázás (tizedesvessző, ezres szóköz) */
const nf = (digits: number) =>
  new Intl.NumberFormat('hu-HU', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmtNum(v: number, digits = 0): string {
  return nf(digits).format(v);
}

export function fmtArea(m2: number): string {
  if (m2 >= 10000) return `${fmtNum(m2 / 10000, 2)} ha (${fmtNum(m2)} m²)`;
  return `${fmtNum(m2)} m²`;
}

export function fmtLen(m: number): string {
  if (m >= 1000) return `${fmtNum(m / 1000, 2)} km`;
  return `${fmtNum(m, m < 10 ? 1 : 0)} m`;
}

export function fmtDist(m: number | null, radius?: number): string {
  if (m === null) return radius ? `nincs ${fmtLen(radius)}-en belül` : 'nincs adat';
  if (m === 0) return 'érinti / keresztezi';
  return fmtLen(m);
}

export function fmtPct(v: number, digits = 1): string {
  return `${fmtNum(v, digits)} %`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' });
}

export function fmtEov(p: [number, number]): string {
  return `Y ${fmtNum(p[0], 1)} · X ${fmtNum(p[1], 1)}`;
}

export function fmtWgs(p: [number, number]): string {
  return `${p[1].toFixed(6)}° É, ${p[0].toFixed(6)}° K`;
}

export const ASPECT_NAMES: Record<string, string> = {
  É: 'északi',
  ÉK: 'északkeleti',
  K: 'keleti',
  DK: 'délkeleti',
  D: 'déli',
  DNy: 'délnyugati',
  Ny: 'nyugati',
  ÉNy: 'északnyugati',
  sík: 'sík (nincs jellemző kitettség)',
};
