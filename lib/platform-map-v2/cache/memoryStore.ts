import type { CacheStore } from "./types";

type CacheEntry = {
  value: string;
  expiresAt: number;
};

const globalKey = "__pmv2_cache_store__";

const getStore = () => {
  const globalAny = globalThis as typeof globalThis & { [key: string]: Map<string, CacheEntry> };
  if (!globalAny[globalKey]) {
    globalAny[globalKey] = new Map<string, CacheEntry>();
  }
  return globalAny[globalKey];
};

export class MemoryStore implements CacheStore {
  async get<T>(key: string): Promise<T | null> {
    const store = getStore();
    const entry = store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    try {
      return JSON.parse(entry.value) as T;
    } catch (error) {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const store = getStore();
    store.set(key, {
      value: JSON.stringify(value),
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }
}
