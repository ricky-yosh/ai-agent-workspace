import { invoke } from "@tauri-apps/api/core";
import { parseCommandError } from "./types/errors";

export async function safeInvoke<T>(
  command: string,
  params?: Record<string, unknown>,
  onError?: (message: string) => void,
): Promise<T> {
  try {
    return await invoke<T>(command, params);
  } catch (err) {
    if (onError) {
      const parsed = parseCommandError(err);
      const message = parsed?.message ?? String(err);
      onError(message);
    }
    throw err;
  }
}
