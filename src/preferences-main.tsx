import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { Store } from "@tauri-apps/plugin-store";
import "./Preferences.css";

interface Preset {
  label: string;
  bundleName: string;
}

const EDITOR_PRESETS: Preset[] = [
  { label: "Cursor", bundleName: "Cursor" },
  { label: "VS Code", bundleName: "Visual Studio Code" },
  { label: "Windsurf", bundleName: "Windsurf" },
  { label: "VS Code Insiders", bundleName: "Visual Studio Code - Insiders" },
  { label: "Zed", bundleName: "Zed" },
  { label: "Xcode", bundleName: "Xcode" },
];

const DIFF_TOOL_PRESETS: Preset[] = [
  { label: "Fork", bundleName: "Fork" },
  { label: "GitKraken", bundleName: "GitKraken" },
  { label: "Sourcetree", bundleName: "Sourcetree" },
  { label: "GitX", bundleName: "GitX" },
];

const TERMINAL_PRESETS: Preset[] = [
  { label: "iTerm2", bundleName: "iTerm" },
  { label: "Warp", bundleName: "Warp" },
  { label: "Terminal", bundleName: "Terminal" },
  { label: "Ghostty", bundleName: "Ghostty" },
  { label: "Hyper", bundleName: "Hyper" },
];

const CUSTOM_SENTINEL = "__custom__";

function usePreferences() {
  const [store, setStore] = useState<Store | null>(null);
  const [prefs, setPrefs] = useState({
    external_editor: "",
    external_diff_tool: "",
    external_terminal: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const s = await Store.load("preferences.json", {
          defaults: {},
          autoSave: 300,
        });
        setStore(s);
        const [editor, diffTool, terminal] = await Promise.all([
          s.get<string>("external_editor"),
          s.get<string>("external_diff_tool"),
          s.get<string>("external_terminal"),
        ]);
        setPrefs({
          external_editor: editor ?? "",
          external_diff_tool: diffTool ?? "",
          external_terminal: terminal ?? "",
        });
      } catch (err) {
        console.error("Failed to load preferences:", err);
        // TODO: Wire toast notification when ToastContext is available (task 3)
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const updatePref = useCallback(
    async (key: string, value: string) => {
      if (!store) return;
      setPrefs((prev) => ({ ...prev, [key]: value }));
      try {
        await store.set(key, value);
      } catch (err) {
        console.error(`Failed to save preference "${key}":`, err);
        // TODO: Wire toast notification when ToastContext is available (task 3)
      }
    },
    [store],
  );

  return { prefs, updatePref, loading };
}

interface ToolRowProps {
  label: string;
  presets: Preset[];
  value: string;
  onChange: (value: string) => void;
}

function ToolRow({ label, presets, value, onChange }: ToolRowProps) {
  const [customMode, setCustomMode] = useState(false);

  const isCustom =
    customMode || (value !== "" && !presets.some((p) => p.bundleName === value));

  const selectValue = isCustom ? CUSTOM_SENTINEL : value;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selected = e.target.value;
    if (selected === CUSTOM_SENTINEL) {
      setCustomMode(true);
      onChange("");
    } else {
      setCustomMode(false);
      onChange(selected);
    }
  };

  return (
    <div className="tool-row">
      <span className="tool-label">{label}</span>
      <select className="tool-select" value={selectValue} onChange={handleSelectChange}>
        <option value="">Not configured</option>
        {presets.map((preset) => (
          <option key={preset.bundleName} value={preset.bundleName}>
            {preset.label}
          </option>
        ))}
        <option value={CUSTOM_SENTINEL}>Custom...</option>
      </select>
      {isCustom && (
        <input
          className="tool-input"
          type="text"
          placeholder="App name or bundle ID"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function PreferencesForm() {
  const { prefs, updatePref, loading } = usePreferences();

  if (loading) {
    return <div className="loading">Loading preferences...</div>;
  }

  return (
    <>
      <h2 className="preferences-header">External Tools</h2>
      <ToolRow
        label="Editor"
        presets={EDITOR_PRESETS}
        value={prefs.external_editor}
        onChange={(v) => updatePref("external_editor", v)}
      />
      <ToolRow
        label="Diff Tool"
        presets={DIFF_TOOL_PRESETS}
        value={prefs.external_diff_tool}
        onChange={(v) => updatePref("external_diff_tool", v)}
      />
      <ToolRow
        label="Terminal"
        presets={TERMINAL_PRESETS}
        value={prefs.external_terminal}
        onChange={(v) => updatePref("external_terminal", v)}
      />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PreferencesForm />
  </React.StrictMode>,
);
