import { kv } from "@vercel/kv";
import type { CacheStore } from "./types";

export class KvStore implements CacheStore {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await kv.get<T>(key);
      return value ?? null;
    } catch (error) {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    try {
      await kv.set(key, value, { ex: ttlSeconds });
    } catch (error) {
      return;
    }
  }
}
