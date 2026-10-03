/**
 * HTTP-kliens: natív platformon CapacitorHttp (megkerüli a CORS-t, beállítható User-Agent),
 * böngészőben fetch. Minden külső szolgáltatás ezen keresztül hív.
 */
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { USER_AGENT } from '../config';

export type ResponseKind = 'json' | 'text' | 'arraybuffer';

export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  /** POST törzs (form-urlencoded vagy text) */
  body?: string;
  responseType?: ResponseKind;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface HttpResult<T> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export type HttpErrorKind = 'offline' | 'timeout' | 'http' | 'network' | 'aborted' | 'parse';

export class HttpError extends Error {
  constructor(
    public kind: HttpErrorKind,
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Teszteléshez cserélhető implementáció */
export type HttpImpl = <T>(req: HttpRequest) => Promise<HttpResult<T>>;

let impl: HttpImpl | null = null;
export function setHttpImpl(fn: HttpImpl | null): void {
  impl = fn;
}

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

export function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64.replace(/\s+/g, ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

function lowerHeaders(h: Record<string, string> | Headers): Record<string, string> {
  const out: Record<string, string> = {};
  if (h instanceof Headers) h.forEach((v, k) => (out[k.toLowerCase()] = v));
  else for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = v;
  return out;
}

export async function http<T = unknown>(req: HttpRequest): Promise<HttpResult<T>> {
  if (impl) return impl<T>(req);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new HttpError('offline', 'Nincs hálózati kapcsolat.');
  }
  return isNative() ? nativeRequest<T>(req) : webRequest<T>(req);
}

async function nativeRequest<T>(req: HttpRequest): Promise<HttpResult<T>> {
  const type = req.responseType ?? 'json';
  const timeout = req.timeoutMs ?? 30000;
  const headers = { 'User-Agent': USER_AGENT, ...(req.headers ?? {}) };
  if (req.signal?.aborted) throw new HttpError('aborted', 'Megszakítva.');
  const call = CapacitorHttp.request({
    url: req.url,
    method: req.method ?? 'GET',
    headers,
    data: req.body,
    responseType: type === 'arraybuffer' ? 'arraybuffer' : type === 'text' ? 'text' : 'json',
    connectTimeout: timeout,
    readTimeout: timeout,
  });
  let res;
  try {
    res = await withAbort(call, req.signal, timeout + 5000);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    if (/timed? ?out|timeout/i.test(msg)) throw new HttpError('timeout', 'A szerver nem válaszolt időben.');
    if (/unable to resolve|UnknownHost|network|connect/i.test(msg))
      throw new HttpError('network', 'A szerver nem érhető el (hálózati hiba).');
    throw new HttpError('network', msg);
  }
  const hdrs = lowerHeaders(res.headers ?? {});
  if (res.status >= 400) throw new HttpError('http', `HTTP ${res.status}`, res.status);
  let data: unknown = res.data;
  if (type === 'arraybuffer' && typeof data === 'string') data = base64ToArrayBuffer(data);
  if (type === 'json' && typeof data === 'string') {
    try {
      data = JSON.parse(data);
    } catch {
      throw new HttpError('parse', 'A válasz nem értelmezhető JSON.');
    }
  }
  if (type === 'text' && typeof data !== 'string') data = JSON.stringify(data);
  return { status: res.status, data: data as T, headers: hdrs };
}

async function webRequest<T>(req: HttpRequest): Promise<HttpResult<T>> {
  const ctrl = new AbortController();
  const timeout = req.timeoutMs ?? 30000;
  const timer = setTimeout(
    () => ctrl.abort(new HttpError('timeout', 'A szerver nem válaszolt időben.')),
    timeout,
  );
  const onAbort = () => ctrl.abort(new HttpError('aborted', 'Megszakítva.'));
  req.signal?.addEventListener('abort', onAbort);
  try {
    const res = await fetch(req.url, {
      method: req.method ?? 'GET',
      headers: req.headers,
      body: req.body,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new HttpError('http', `HTTP ${res.status}`, res.status);
    const type = req.responseType ?? 'json';
    let data: unknown;
    if (type === 'arraybuffer') data = await res.arrayBuffer();
    else if (type === 'text') data = await res.text();
    else {
      try {
        data = await res.json();
      } catch {
        throw new HttpError('parse', 'A válasz nem értelmezhető JSON.');
      }
    }
    return { status: res.status, data: data as T, headers: lowerHeaders(res.headers) };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    const reason = ctrl.signal.reason;
    if (reason instanceof HttpError) throw reason;
    throw new HttpError(
      'network',
      'A szerver nem érhető el (hálózati vagy CORS hiba – böngészőben egyes források csak az Android appból hívhatók).',
    );
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onAbort);
  }
}

function withAbort<T>(p: Promise<T>, signal: AbortSignal | undefined, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new HttpError('timeout', 'A szerver nem válaszolt időben.')), ms);
    const onAbort = () => reject(new HttpError('aborted', 'Megszakítva.'));
    signal?.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, reject).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    });
  });
}

/** Felhasználóbarát magyar hibaüzenet + teendő */
export function describeHttpError(err: unknown, what: string): { message: string; hint: string } {
  if (err instanceof HttpError) {
    switch (err.kind) {
      case 'offline':
        return {
          message: `${what}: nincs hálózati kapcsolat.`,
          hint: 'Kapcsolj be mobilnetet vagy Wi-Fit, majd futtasd újra az elemzést.',
        };
      case 'timeout':
        return {
          message: `${what}: a szolgáltatás nem válaszolt időben.`,
          hint: 'Gyenge lehet a jel; próbáld újra később vagy jobb lefedettségű helyen.',
        };
      case 'http':
        if (err.status === 429)
          return {
            message: `${what}: a szolgáltatás átmenetileg korlátozza a kéréseket (429).`,
            hint: 'Várj 1–2 percet, majd próbáld újra.',
          };
        if (err.status >= 500)
          return {
            message: `${what}: a szolgáltatás szerverhibát adott (${err.status}).`,
            hint: 'A hiba a szolgáltatónál van; próbáld újra később.',
          };
        return {
          message: `${what}: a kérés sikertelen (${err.status}).`,
          hint: 'Ellenőrizd a telek geometriáját, vagy próbáld újra később.',
        };
      case 'parse':
        return { message: `${what}: váratlan válaszformátum.`, hint: 'Próbáld újra később.' };
      case 'aborted':
        return { message: `${what}: megszakítva.`, hint: 'Indítsd újra az elemzést.' };
      default:
        return {
          message: `${what}: ${err.message}`,
          hint: 'Ellenőrizd az internetkapcsolatot, majd próbáld újra.',
        };
    }
  }
  return {
    message: `${what}: ${err instanceof Error ? err.message : String(err)}`,
    hint: 'Próbáld újra; ha ismétlődik, jelezd a fejlesztőnek.',
  };
}
