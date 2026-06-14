/**
 * Structured error from the Rust backend (CommandError).
 * Serialized as JSON at the Tauri IPC boundary.
 */
export interface CommandError {
  /** Error category: "not_found", "already_exists", "invalid_input", "internal" */
  error: string;
  /** Entity type: "session", "layout", "workspace", etc. */
  entity: string;
  /** ID of the entity that caused the error */
  id: string;
  /** Human-readable error message */
  message: string;
}

/**
 * Parse a Tauri invoke error string into a structured CommandError.
 * Returns null if the string is not valid JSON or doesn't match the expected shape.
 */
export function parseCommandError(err: unknown): CommandError | null {
  if (typeof err !== 'string') return null;
  try {
    const parsed = JSON.parse(err);
    if (typeof parsed === 'object' && parsed !== null && 'error' in parsed) {
      return parsed as CommandError;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Type guard for CommandError category.
 */
export function isErrorCode(err: unknown, code: string): boolean {
  const parsed = parseCommandError(err);
  return parsed?.error === code;
}
