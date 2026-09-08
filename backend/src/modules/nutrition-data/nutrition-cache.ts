interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export interface CacheLookup<T> {
  hit: boolean;
  value: T | null;
}

/** Small in-process hot cache. Persistent provider cache is added in Phase 2. */
export class NutritionTtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly maxEntries = 500) {}

  lookup(key: string, now = Date.now()): CacheLookup<T> {
    const entry = this.entries.get(key);
    if (!entry) return { hit: false, value: null };
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return { hit: false, value: null };
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return { hit: true, value: entry.value };
  }

  get(key: string, now = Date.now()): T | null {
    return this.lookup(key, now).value;
  }

  set(key: string, value: T, ttlMs: number, now = Date.now()): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) return;
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: now + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}
