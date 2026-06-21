import { Store } from "@tauri-apps/plugin-store";

export type MotionPreference = "system" | "full" | "reduced";

export const MOTION_PREF_KEY = "motion";

export function osPrefersReduced(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function resolveMotion(
  pref: MotionPreference,
  osReduced: boolean,
): "full" | "reduced" {
  if (pref === "reduced") return "reduced";
  if (pref === "full") return "full";
  return osReduced ? "reduced" : "full";
}

export function applyMotion(effective: "full" | "reduced"): void {
  document.documentElement.dataset.motion = effective;
}

let currentPref: MotionPreference = "system";

export async function initMotion(): Promise<void> {
  applyMotion(resolveMotion("system", osPrefersReduced()));

  try {
    const store = await Store.load("preferences.json", {
      defaults: {},
      autoSave: 300,
    });

    const stored = await store.get<MotionPreference>(MOTION_PREF_KEY);
    currentPref = stored ?? "system";
    applyMotion(resolveMotion(currentPref, osPrefersReduced()));

    if (typeof window !== "undefined" && window.matchMedia) {
      window
        .matchMedia("(prefers-reduced-motion: reduce)")
        .addEventListener("change", () => {
          applyMotion(resolveMotion(currentPref, osPrefersReduced()));
        });
    }

    store.onKeyChange<MotionPreference>(MOTION_PREF_KEY, (val) => {
      currentPref = val ?? "system";
      applyMotion(resolveMotion(currentPref, osPrefersReduced()));
    });

    window.addEventListener("focus", async () => {
      try {
        const val = await store.get<MotionPreference>(MOTION_PREF_KEY);
        currentPref = val ?? "system";
        applyMotion(resolveMotion(currentPref, osPrefersReduced()));
      } catch (err) {
        console.error("Failed to re-read motion preference on focus:", err);
      }
    });
  } catch (err) {
    console.error("Failed to init motion preference store:", err);
  }
}
