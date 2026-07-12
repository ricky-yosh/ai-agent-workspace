import { useState, useCallback } from "react";
import { useTauriEvent } from "../../hooks/useTauriEvent";
import { safeInvoke } from "../../safeInvoke";
import type { IndexProgress } from "./types";

export interface UseCodeIndexingResult {
  indexing: boolean;
  progress: IndexProgress | null;
  error: string | null;
  startIndex: () => Promise<void>;
  cancelIndex: () => Promise<void>;
}

export function useCodeIndexing(repoPath: string): UseCodeIndexingResult {
  const [indexing, setIndexing] = useState(false);
  const [progress, setProgress] = useState<IndexProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  useTauriEvent<IndexProgress & { repo_path: string }>(
    "code-index-progress",
    (payload) => {
      if (payload.repo_path !== repoPath) return;
      setProgress({
        phase: payload.phase,
        current: payload.current,
        total: payload.total,
        file_path: payload.file_path,
      });
      if (payload.phase === "complete") {
        setIndexing(false);
      }
    },
    [],
  );

  const startIndex = useCallback(async () => {
    if (!repoPath) return;
    setIndexing(true);
    setProgress(null);
    setError(null);
    try {
      await safeInvoke("index_code", { repoPath });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Indexing failed:", message);
      setError(message);
      setIndexing(false);
    }
  }, [repoPath]);

  const cancelIndex = useCallback(async () => {
    setIndexing(false);
    setProgress(null);
    setError(null);
    await safeInvoke("cancel_index").catch(() => {});
  }, []);

  return { indexing, progress, error, startIndex, cancelIndex };
}
