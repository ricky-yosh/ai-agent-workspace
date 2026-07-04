import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initMotion } from "./motionPreference";
import { applyTheme, type ThemeName } from "./themes";
import { Store } from "@tauri-apps/plugin-store";
import { listen } from "@tauri-apps/api/event";

// Load and apply theme before rendering
(async () => {
  try {
    const store = await Store.load("preferences.json", { defaults: {}, autoSave: 300 });
    const savedTheme = await store.get<string>("theme");
    applyTheme((savedTheme as ThemeName) || "dark");
  } catch {
    // Fallback to dark theme if store unavailable
    applyTheme("dark");
  }

  // Listen for theme changes from the preferences window
  listen<{ theme: ThemeName }>("theme-changed", (event) => {
    applyTheme(event.payload.theme);
  });

  initMotion();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
})();
