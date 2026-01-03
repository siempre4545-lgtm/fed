/**
 * 인메모리 캐시 유틸리티
 * Express.js 환경에서 외부 API 호출 결과를 캐싱합니다.
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresAt: number;
}

class MemoryCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  private defaultTTL: number = 3600000; // 1시간 (밀리초)

  /**
   * 캐시에서 데이터 가져오기
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    // 만료 확인
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * 캐시에 데이터 저장
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const expiresAt = now + (ttl || this.defaultTTL);
    
    this.cache.set(key, {
      data,
      timestamp: now,
      expiresAt,
    });
  }

  /**
   * 캐시 삭제
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 만료된 항목 정리
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 전체 캐시 초기화
   */
  clear(): void {
    this.cache.clear();
  }
}

// 싱글톤 인스턴스
export const memoryCache = new MemoryCache();

// 주기적으로 만료된 항목 정리 (10분마다)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    memoryCache.cleanup();
  }, 600000); // 10분
}

/**
 * 타임아웃과 캐시를 지원하는 fetch 래퍼
 */
export async function cachedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options?: {
    ttl?: number; // 캐시 TTL (밀리초, 기본 1시간)
    timeout?: number; // 타임아웃 (밀리초, 기본 5초)
    useCache?: boolean; // 캐시 사용 여부 (기본 true)
  }
): Promise<T> {
  const {
    ttl = 3600000, // 1시간
    timeout = 5000, // 5초
    useCache = true,
  } = options || {};

  // 캐시에서 먼저 확인
  if (useCache) {
    const cached = memoryCache.get<T>(key);
    if (cached !== null) {
      console.log(`[Cache] Hit: ${key}`);
      return cached;
    }
  }

  console.log(`[Cache] Miss: ${key}, fetching...`);

  // 타임아웃과 함께 fetch 실행
  const fetchPromise = fetchFn();
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Fetch timeout for ${key} after ${timeout}ms`));
    }, timeout);
  });

  try {
    const result = await Promise.race([fetchPromise, timeoutPromise]);
    
    // 성공 시 캐시에 저장
    if (useCache) {
      memoryCache.set(key, result, ttl);
    }
    
    return result;
  } catch (error) {
    // 실패 시 최근 캐시 반환 (stale-while-revalidate)
    if (useCache) {
      const stale = memoryCache.get<T>(key);
      if (stale !== null) {
        console.warn(`[Cache] Fetch failed for ${key}, returning stale cache`);
        return stale;
      }
    }
    
    throw error;
  }
}

/**
 * 캐시 키 생성 헬퍼
 */
export function getCacheKey(prefix: string, ...parts: (string | number | undefined)[]): string {
  const validParts = parts.filter(p => p !== undefined && p !== null);
  return `${prefix}:${validParts.join(':')}`;
}

