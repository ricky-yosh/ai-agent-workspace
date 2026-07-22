export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export const modKey = isMac ? "⌘" : "Ctrl";
export const altKey = isMac ? "⌥" : "Alt";
export const shiftKey = "⇧";
export const ctrlKey = isMac ? "^" : "Ctrl";

export function replaceModifiers(shortcut: string): string {
  return shortcut
    .replace(/⌘/g, modKey)
    .replace(/⌥/g, altKey)
    .replace(/\^/g, ctrlKey);
}
