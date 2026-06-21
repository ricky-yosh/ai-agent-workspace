/** Returned by the check_mcp_binary Tauri command. */
export interface BinaryStatus {
  present: boolean;
  executable: boolean;
  path: string;
}
