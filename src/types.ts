export interface SourceRecord<T> { source: string; locator: string; retrievedAt: string; revision?: string; upstreamSource?: string; cacheControl?: string; data: T }
export interface ClientOptions { userAgent: string; fetch?: typeof fetch; timeoutMs?: number; intervalMs?: number; retries?: number; maxResponseBytes?: number; now?: () => Date }
export function endpoint(value: string): URL {
  const url = new URL(value);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) || url.username || url.password || url.hash || url.search) throw new TypeError('Endpoint must use HTTPS or loopback HTTP without credentials/query/fragment');
  return url;
}
