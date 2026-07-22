/**
 * FNV-1a hash (32-bit) for content fingerprinting.
 *
 * Produces a deterministic hash from a UTF-8 string.  The implementation
 * follows the standard FNV-1a algorithm with the 32-bit FNV offset basis
 * and prime.
 */
export function fnv1a(input: string): string {
  let hash = 0x811c_9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x0100_0193); // FNV prime
  }
  // Convert to unsigned 32-bit hex string
  return (hash >>> 0).toString(16);
}

export interface CacheEntry {
  content: string;
  size: number;
}

/**
 * In-memory LRU cache for file contents keyed by `${filePath}:${contentHash}`.
 *
 * - Max 100 entries (configurable via `maxSize`).
 * - No persistence — cache is rebuilt from disk on app restart.
 * - Singleton: import `fileContentCache` from this module.
 */
export class FileContentCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxSize: number;

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  /**
   * Build a cache key from the file path and its content hash.
   */
  static makeKey(filePath: string, contentHash: string): string {
    return `${filePath}:${contentHash}`;
  }

  /**
   * Retrieve a cached entry. Returns `undefined` on miss.
   *
   * Accessing an existing entry moves it to the most-recently-used position.
   */
  get(filePath: string, contentHash: string): CacheEntry | undefined {
    const key = FileContentCache.makeKey(filePath, contentHash);
    const entry = this.cache.get(key);
    if (entry !== undefined) {
      // Move to end (most-recently-used) by re-inserting
      this.cache.delete(key);
      this.cache.set(key, entry);
    }
    return entry;
  }

  /**
   * Store a file content entry. Evicts the least-recently-used entry
   * (first item in the Map) when the cache is full.
   */
  set(filePath: string, contentHash: string, content: string, size: number): void {
    const key = FileContentCache.makeKey(filePath, contentHash);

    // If key already exists, delete first so re-insertion lands at the end
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Evict the least-recently-used entry (first item in insertion order)
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }

    this.cache.set(key, { content, size });
  }

  /**
   * Check whether a key exists in the cache (without promoting it).
   */
  has(filePath: string, contentHash: string): boolean {
    const key = FileContentCache.makeKey(filePath, contentHash);
    return this.cache.has(key);
  }

  /**
   * Remove a specific entry.
   */
  delete(filePath: string, contentHash: string): boolean {
    const key = FileContentCache.makeKey(filePath, contentHash);
    return this.cache.delete(key);
  }

  /**
   * Remove all entries for a given file path (all content hashes).
   * Useful when a file is known to have changed on disk.
   */
  invalidatePath(filePath: string): void {
    const prefix = `${filePath}:`;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Current number of entries in the cache.
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    this.cache.clear();
  }
}

/** Singleton cache instance shared across all viewer panels. */
export const fileContentCache = new FileContentCache();
