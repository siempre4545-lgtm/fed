type CacheEntry<T> = {
  ts: number;
  ttlMs: number;
  value: T;
};

const MEMORY_CACHE = new Map<string, CacheEntry<unknown>>();

export const getCached = <T>(key: string): T | null => {
  const entry = MEMORY_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > entry.ttlMs) {
    MEMORY_CACHE.delete(key);
    return null;
  }
  return entry.value as T;
};

export const setCached = <T>(key: string, value: T, ttlMs: number) => {
  MEMORY_CACHE.set(key, { ts: Date.now(), ttlMs, value });
};
