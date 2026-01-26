import { KvStore } from "./kvStore";
import { MemoryStore } from "./memoryStore";
import type { CacheStore } from "./types";

const hasKvEnv = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

export const createCacheStore = (): CacheStore => {
  if (hasKvEnv()) {
    return new KvStore();
  }
  return new MemoryStore();
};

export type { CacheStore };
