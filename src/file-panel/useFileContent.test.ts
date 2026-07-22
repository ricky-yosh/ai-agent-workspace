import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useFileContent } from "./useFileContent";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

const mockCacheGet = vi.fn();
const mockCacheSet = vi.fn();
vi.mock("./cache", () => ({
  fileContentCache: {
    get: (...args: unknown[]) => mockCacheGet(...args),
    set: (...args: unknown[]) => mockCacheSet(...args),
  },
  fnv1a: (input: string) => `hash-${input.length}`,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useFileContent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCacheGet.mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Null file path
  // -----------------------------------------------------------------------

  it("returns null content and no loading when filePath is null", () => {
    const { result } = renderHook(() => useFileContent("s1", null));
    expect(result.current.content).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.size).toBeNull();
  });

  it("does not invoke Tauri when filePath is null", () => {
    renderHook(() => useFileContent("s1", null));
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Successful load
  // -----------------------------------------------------------------------

  it("loads file content successfully", async () => {
    mockInvoke.mockResolvedValue({ content: "hello world", size: 11 });

    const { result } = renderHook(() => useFileContent("s1", "hello.txt"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.content).toBe("hello world");
    expect(result.current.size).toBe(11);
    expect(result.current.error).toBeNull();
  });

  it("invokes read_file with correct parameters", async () => {
    mockInvoke.mockResolvedValue({ content: "x", size: 1 });

    renderHook(() => useFileContent("s1", "src/main.ts"));

    await waitFor(() => {
      expect(mockInvoke).toHaveBeenCalledWith("read_file", {
        sessionId: "s1",
        filePath: "src/main.ts",
      });
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("sets error message when Tauri invoke fails", async () => {
    mockInvoke.mockRejectedValue("File not found");

    const { result } = renderHook(() => useFileContent("s1", "missing.txt"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("File not found");
    expect(result.current.content).toBeNull();
    expect(result.current.size).toBeNull();
  });

  it("stringifies non-string errors", async () => {
    mockInvoke.mockRejectedValue(new Error("something broke"));

    const { result } = renderHook(() => useFileContent("s1", "err.txt"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Error: something broke");
  });

  // -----------------------------------------------------------------------
  // Binary error detection
  // -----------------------------------------------------------------------

  it("detects binary file error from Tauri", async () => {
    mockInvoke.mockRejectedValue("Binary file detected: cannot display as text");

    const { result } = renderHook(() => useFileContent("s1", "image.png"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain("Binary file detected");
    expect(result.current.content).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Cache integration
  // -----------------------------------------------------------------------

  it("uses cached content when cache hit occurs", async () => {
    mockInvoke.mockResolvedValue({ content: "cached content", size: 13 });
    mockCacheGet.mockReturnValue({ content: "cached content", size: 13 });

    const { result } = renderHook(() => useFileContent("s1", "cached.txt"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.content).toBe("cached content");
    expect(mockCacheGet).toHaveBeenCalled();
    // Cache set should NOT be called when we get a cache hit
    expect(mockCacheSet).not.toHaveBeenCalled();
  });

  it("populates cache on cache miss", async () => {
    mockInvoke.mockResolvedValue({ content: "new content", size: 11 });
    mockCacheGet.mockReturnValue(undefined);

    const { result } = renderHook(() => useFileContent("s1", "new.txt"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.content).toBe("new content");
    expect(mockCacheSet).toHaveBeenCalledWith("new.txt", expect.any(String), "new content", 11);
  });

  // -----------------------------------------------------------------------
  // Stale request protection
  // -----------------------------------------------------------------------

  it("does not update state for stale requests", async () => {
    // First call resolves slowly, second call resolves quickly
    let resolveFirst: (v: unknown) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });
    mockInvoke.mockImplementationOnce(() => firstPromise);
    mockInvoke.mockResolvedValueOnce({ content: "second", size: 6 });

    const { result, rerender } = renderHook(
      ({ sessionId, filePath }) => useFileContent(sessionId, filePath),
      { initialProps: { sessionId: "s1", filePath: "fast.txt" } },
    );

    // Switch to a new file before first completes
    rerender({ sessionId: "s1", filePath: "slow.txt" });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // The second request's result should be used
    expect(result.current.content).toBe("second");

    // Now resolve the first (stale) request — should NOT update state
    act(() => {
      resolveFirst!({ content: "stale", size: 5 });
    });

    // Wait a tick for any potential state update
    await new Promise((r) => setTimeout(r, 10));
    expect(result.current.content).toBe("second");
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it("sets loading true during fetch", async () => {
    let resolvePromise: (v: unknown) => void;
    mockInvoke.mockImplementation(() => new Promise((resolve) => { resolvePromise = resolve; }));

    const { result } = renderHook(() => useFileContent("s1", "loading.txt"));

    // Initially loading should be true
    await waitFor(() => {
      expect(result.current.loading).toBe(true);
    });

    // Resolve the request
    act(() => {
      resolvePromise!({ content: "done", size: 4 });
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // State reset when filePath changes to null
  // -----------------------------------------------------------------------

  it("resets all state when filePath changes to null", async () => {
    mockInvoke.mockResolvedValue({ content: "data", size: 4 });

    const { result, rerender } = renderHook(
      ({ sessionId, filePath }) => useFileContent(sessionId, filePath),
      { initialProps: { sessionId: "s1", filePath: "data.txt" as string | null } },
    );

    await waitFor(() => {
      expect(result.current.content).toBe("data");
    });

    // Change to null
    rerender({ sessionId: "s1", filePath: null });

    expect(result.current.content).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.size).toBeNull();
  });
});
