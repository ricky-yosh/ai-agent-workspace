import { describe, it, expect, beforeEach } from "vitest";
import { fnv1a, FileContentCache, fileContentCache } from "./cache";

// ---------------------------------------------------------------------------
// FNV-1a hash
// ---------------------------------------------------------------------------

describe("fnv1a", () => {
  it("returns a hex string", () => {
    const hash = fnv1a("hello");
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic — same input always yields the same hash", () => {
    const a = fnv1a("deterministic-input");
    const b = fnv1a("deterministic-input");
    expect(a).toBe(b);
  });

  it("produces different hashes for different inputs", () => {
    const a = fnv1a("foo");
    const b = fnv1a("bar");
    expect(a).not.toBe(b);
  });

  it("handles empty string", () => {
    const hash = fnv1a("");
    expect(typeof hash).toBe("string");
    expect(hash.length).toBeGreaterThan(0);
  });

  it("handles unicode characters", () => {
    const hash = fnv1a("\u00e9\u00e8\u00ea"); // éèê
    expect(typeof hash).toBe("string");
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it("produces consistent known values", () => {
    // FNV-1a 32-bit of "a" should be 0xe40c292c
    expect(fnv1a("a")).toBe("e40c292c");
  });
});

// ---------------------------------------------------------------------------
// FileContentCache — construction
// ---------------------------------------------------------------------------

describe("FileContentCache — construction", () => {
  it("creates with default max size 100", () => {
    const cache = new FileContentCache();
    expect(cache.size).toBe(0);
  });

  it("creates with custom max size", () => {
    const cache = new FileContentCache(5);
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FileContentCache — makeKey
// ---------------------------------------------------------------------------

describe("FileContentCache.makeKey", () => {
  it("combines path and hash with colon separator", () => {
    expect(FileContentCache.makeKey("src/main.ts", "abc123")).toBe(
      "src/main.ts:abc123",
    );
  });

  it("is unique for different paths with same hash", () => {
    const k1 = FileContentCache.makeKey("a.ts", "hash");
    const k2 = FileContentCache.makeKey("b.ts", "hash");
    expect(k1).not.toBe(k2);
  });

  it("is unique for same path with different hashes", () => {
    const k1 = FileContentCache.makeKey("a.ts", "h1");
    const k2 = FileContentCache.makeKey("a.ts", "h2");
    expect(k1).not.toBe(k2);
  });
});

// ---------------------------------------------------------------------------
// FileContentCache — store & retrieve
// ---------------------------------------------------------------------------

describe("FileContentCache — store & retrieve", () => {
  let cache: FileContentCache;

  beforeEach(() => {
    cache = new FileContentCache();
  });

  it("retrieves a stored entry", () => {
    cache.set("a.ts", "hash1", "content a", 10);
    const entry = cache.get("a.ts", "hash1");
    expect(entry).toBeDefined();
    expect(entry!.content).toBe("content a");
    expect(entry!.size).toBe(10);
  });

  it("returns undefined for a cache miss", () => {
    const entry = cache.get("missing.ts", "nohash");
    expect(entry).toBeUndefined();
  });

  it("stores multiple entries", () => {
    cache.set("a.ts", "h1", "alpha", 5);
    cache.set("b.ts", "h2", "beta", 4);
    cache.set("c.ts", "h3", "gamma", 5);
    expect(cache.size).toBe(3);
    expect(cache.get("a.ts", "h1")!.content).toBe("alpha");
    expect(cache.get("b.ts", "h2")!.content).toBe("beta");
    expect(cache.get("c.ts", "h3")!.content).toBe("gamma");
  });

  it("has() returns true for existing entries", () => {
    cache.set("a.ts", "h1", "x", 1);
    expect(cache.has("a.ts", "h1")).toBe(true);
  });

  it("has() returns false for missing entries", () => {
    expect(cache.has("no.ts", "no")).toBe(false);
  });

  it("delete() removes an entry", () => {
    cache.set("a.ts", "h1", "x", 1);
    expect(cache.delete("a.ts", "h1")).toBe(true);
    expect(cache.size).toBe(0);
    expect(cache.get("a.ts", "h1")).toBeUndefined();
  });

  it("delete() returns false for missing entry", () => {
    expect(cache.delete("no.ts", "no")).toBe(false);
  });

  it("clear() empties the cache", () => {
    cache.set("a.ts", "h1", "x", 1);
    cache.set("b.ts", "h2", "y", 2);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// FileContentCache — same path, different content hash → separate entries
// ---------------------------------------------------------------------------

describe("FileContentCache — content change invalidation", () => {
  let cache: FileContentCache;

  beforeEach(() => {
    cache = new FileContentCache();
  });

  it("same file path with different content hash gets a separate entry", () => {
    cache.set("a.ts", "hash_v1", "old content", 11);
    cache.set("a.ts", "hash_v2", "new content", 11);

    expect(cache.size).toBe(2);
    expect(cache.get("a.ts", "hash_v1")!.content).toBe("old content");
    expect(cache.get("a.ts", "hash_v2")!.content).toBe("new content");
  });

  it("invalidatePath removes all versions of a file", () => {
    cache.set("a.ts", "h1", "v1", 1);
    cache.set("a.ts", "h2", "v2", 2);
    cache.set("b.ts", "h1", "b-content", 9);

    cache.invalidatePath("a.ts");

    expect(cache.size).toBe(1);
    expect(cache.has("a.ts", "h1")).toBe(false);
    expect(cache.has("a.ts", "h2")).toBe(false);
    expect(cache.has("b.ts", "h1")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// FileContentCache — LRU eviction
// ---------------------------------------------------------------------------

describe("FileContentCache — LRU eviction", () => {
  it("evicts the least-recently-used entry when full", () => {
    const cache = new FileContentCache(3);

    cache.set("a.ts", "h1", "alpha", 1);
    cache.set("b.ts", "h2", "beta", 2);
    cache.set("c.ts", "h3", "gamma", 3);

    // Cache is full (3 entries). Adding a 4th should evict "a.ts" (LRU).
    cache.set("d.ts", "h4", "delta", 4);

    expect(cache.size).toBe(3);
    expect(cache.has("a.ts", "h1")).toBe(false); // evicted
    expect(cache.has("b.ts", "h2")).toBe(true);
    expect(cache.has("c.ts", "h3")).toBe(true);
    expect(cache.has("d.ts", "h4")).toBe(true);
  });

  it("accessing an entry promotes it (prevents eviction)", () => {
    const cache = new FileContentCache(3);

    cache.set("a.ts", "h1", "alpha", 1);
    cache.set("b.ts", "h2", "beta", 2);
    cache.set("c.ts", "h3", "gamma", 3);

    // Access "a.ts" → promotes it to most-recently-used
    cache.get("a.ts", "h1");

    // Now "b.ts" is the LRU. Adding "d.ts" should evict "b.ts".
    cache.set("d.ts", "h4", "delta", 4);

    expect(cache.size).toBe(3);
    expect(cache.has("a.ts", "h1")).toBe(true); // promoted, not evicted
    expect(cache.has("b.ts", "h2")).toBe(false); // evicted
    expect(cache.has("c.ts", "h3")).toBe(true);
    expect(cache.has("d.ts", "h4")).toBe(true);
  });

  it("evicts in correct order through multiple insertions", () => {
    const cache = new FileContentCache(2);

    cache.set("a.ts", "h1", "alpha", 1);
    cache.set("b.ts", "h2", "beta", 2);

    // Evicts a
    cache.set("c.ts", "h3", "gamma", 3);
    expect(cache.has("a.ts", "h1")).toBe(false);
    expect(cache.has("b.ts", "h2")).toBe(true);
    expect(cache.has("c.ts", "h3")).toBe(true);

    // Evicts b
    cache.set("d.ts", "h4", "delta", 4);
    expect(cache.has("b.ts", "h2")).toBe(false);
    expect(cache.has("c.ts", "h3")).toBe(true);
    expect(cache.has("d.ts", "h4")).toBe(true);
  });

  it("re-inserting an existing key does not count as eviction", () => {
    const cache = new FileContentCache(2);

    cache.set("a.ts", "h1", "alpha", 1);
    cache.set("b.ts", "h2", "beta", 2);

    // Re-set "a.ts" with same key — should update in place, not evict
    cache.set("a.ts", "h1", "ALPHA UPDATED", 12);

    expect(cache.size).toBe(2);
    expect(cache.get("a.ts", "h1")!.content).toBe("ALPHA UPDATED");
    expect(cache.has("b.ts", "h2")).toBe(true);
  });

  it("evicts oldest even after many re-insertions", () => {
    const cache = new FileContentCache(2);

    cache.set("a.ts", "h1", "alpha", 1);
    cache.set("b.ts", "h2", "beta", 2);

    // Re-insert a (promotes it)
    cache.get("a.ts", "h1");
    cache.get("a.ts", "h1");

    // b is now LRU — evict b
    cache.set("c.ts", "h3", "gamma", 3);
    expect(cache.has("a.ts", "h1")).toBe(true);
    expect(cache.has("b.ts", "h2")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Singleton cache instance
// ---------------------------------------------------------------------------

describe("fileContentCache singleton", () => {
  it("is exported and functional", () => {
    fileContentCache.clear();
    fileContentCache.set("test.ts", "hash", "test-content", 12);
    expect(fileContentCache.get("test.ts", "hash")!.content).toBe("test-content");
    fileContentCache.clear();
  });
});
