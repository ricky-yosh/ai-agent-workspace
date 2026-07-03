import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { fileContentCache, fnv1a } from "./cache";

export interface FileContentResult {
  /** The file content as a UTF-8 string, or null while loading / on error. */
  content: string | null;
  /** True while the file is being fetched from disk. */
  loading: boolean;
  /** Error message if the read failed, otherwise null. */
  error: string | null;
  /** Byte size of the file on disk, or null if not yet loaded. */
  size: number | null;
}

interface ReadFileResponse {
  content: string;
  size: number;
}

/**
 * Load a file's content from the session's working directory via the
 * `read_file` Tauri command, using the shared LRU cache.
 *
 * @param sessionId  Current session ID (from PanelContext).
 * @param filePath   Path relative to the session working directory.
 */
export function useFileContent(
  sessionId: string,
  filePath: string | null,
): FileContentResult {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState<number | null>(null);

  // Track the latest request to avoid stale updates
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!filePath) {
      setContent(null);
      setLoading(false);
      setError(null);
      setSize(null);
      return;
    }

    setLoading(true);
    setError(null);

    const thisRequest = ++requestIdRef.current;

    try {
      // Compute the hash of the file path itself to use as a cache sentinel.
      // The actual content hash is computed after we read from disk; if the
      // content matches a cached hash we avoid re-populating state.
      const result = await invoke<ReadFileResponse>("read_file", {
        sessionId,
        filePath,
      });

      // Abort if a newer request superseded this one
      if (thisRequest !== requestIdRef.current) return;

      const contentHash = fnv1a(result.content);

      // Check the cache — if the entry is already there, the content hasn't
      // changed, so we just read from cache for consistency.
      const cached = fileContentCache.get(filePath, contentHash);
      if (cached) {
        setContent(cached.content);
        setSize(cached.size);
      } else {
        fileContentCache.set(filePath, contentHash, result.content, result.size);
        setContent(result.content);
        setSize(result.size);
      }

      setLoading(false);
    } catch (err) {
      if (thisRequest !== requestIdRef.current) return;
      const message = typeof err === "string" ? err : String(err);
      setError(message);
      setContent(null);
      setSize(null);
      setLoading(false);
    }
  }, [sessionId, filePath]);

  useEffect(() => {
    load();
  }, [load]);

  return { content, loading, error, size };
}
