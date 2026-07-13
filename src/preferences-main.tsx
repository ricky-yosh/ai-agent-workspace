import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { initMotion, type MotionPreference, resolveMotion, applyMotion, osPrefersReduced } from "./motionPreference";
import { applyTheme, type ThemeName } from "./themes";
import { setShikiTheme } from "./file-panel/shikiSingleton";
import "./Preferences.css";
import { Button, Input, SegmentedControl } from "./components/ui";

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

const PTY_COMMAND_PRESETS: Preset[] = [
  { label: "Default Shell ($SHELL)", bundleName: "$SHELL" },
  { label: "Claude Code", bundleName: "claude" },
  { label: "Codex CLI", bundleName: "codex" },
];

const CUSTOM_SENTINEL = "__custom__";

interface ToolPrefs {
  editor: string;
  diffTool: string;
  terminal: string;
  ptyCommand: string;
}

function usePreferences() {
  const [store, setStore] = useState<Store | null>(null);
  const [prefs, setPrefs] = useState({
    external_editor: "",
    external_diff_tool: "",
    external_terminal: "",
    pty_command: "$SHELL",
    motion: "system",
    theme: "dark" as ThemeName,
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
        const [editor, diffTool, terminal, ptyCommand, motion, theme] = await Promise.all([
          s.get<string>("external_editor"),
          s.get<string>("external_diff_tool"),
          s.get<string>("external_terminal"),
          s.get<string>("pty_command"),
          s.get<string>("motion"),
          s.get<string>("theme"),
        ]);
        const themeName = (theme as ThemeName) || "dark";
        setPrefs({
          external_editor: editor ?? "",
          external_diff_tool: diffTool ?? "",
          external_terminal: terminal ?? "",
          pty_command: ptyCommand ?? "$SHELL",
          motion: motion ?? "system",
          theme: themeName,
        });
        // Apply theme immediately on load
        applyTheme(themeName);
      } catch (err) {
        console.error("Failed to load preferences:", err);
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
  placeholder?: string;
}

function ToolRow({ label, presets, value, onChange, placeholder = "App name or bundle ID" }: ToolRowProps) {
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
      {/* NOTE: <select> not migrated — no Select primitive exists */}
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
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(v) => onChange(v)}
        />
      )}
    </div>
  );
}

function ExternalToolsForm({ toolPrefs, setToolPrefs }: {
  toolPrefs: ToolPrefs;
  setToolPrefs: (key: string, value: string) => Promise<void>;
}) {
  return (
    <>
      <ToolRow
        label="Editor"
        presets={EDITOR_PRESETS}
        value={toolPrefs.editor}
        onChange={(v) => setToolPrefs("external_editor", v)}
      />
      <ToolRow
        label="Diff Tool"
        presets={DIFF_TOOL_PRESETS}
        value={toolPrefs.diffTool}
        onChange={(v) => setToolPrefs("external_diff_tool", v)}
      />
      <ToolRow
        label="Terminal"
        presets={TERMINAL_PRESETS}
        value={toolPrefs.terminal}
        onChange={(v) => setToolPrefs("external_terminal", v)}
      />
      <ToolRow
        label="PTY Command"
        presets={PTY_COMMAND_PRESETS}
        value={toolPrefs.ptyCommand}
        onChange={(v) => setToolPrefs("pty_command", v)}
        placeholder="Command (e.g., claude, /bin/zsh)"
      />
    </>
  );
}

function AppearanceSection({ motionPref, setMotionPref, themePref, setThemePref }: {
  motionPref: string;
  setMotionPref: (key: string, value: string) => Promise<void>;
  themePref: string;
  setThemePref: (key: string, value: string) => Promise<void>;
}) {
  const handleMotionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setMotionPref("motion", value);
    applyMotion(resolveMotion(value as MotionPreference, osPrefersReduced()));
  };

  const handleThemeChange = (themeName: ThemeName) => {
    setThemePref("theme", themeName);
    applyTheme(themeName);
    setShikiTheme(themeName);
    emit("theme-changed", { theme: themeName });
  };

  const themes: { value: ThemeName; label: string; colors: string[] }[] = [
    { value: "dark", label: "Dark", colors: ["#1e1e1e", "#0078d4", "#cccccc"] },
    { value: "light", label: "Light", colors: ["#f5f5f5", "#0078d4", "#222222"] },
    { value: "catppuccin", label: "Catppuccin", colors: ["#1e1e2e", "#cba6f7", "#cdd6f4"] },
  ];

  return (
    <div>
      <div className="theme-section">
        <div className="tool-label" style={{ marginBottom: 12 }}>Theme</div>
        <div className="theme-grid">
          {themes.map((t) => (
            <Button
              key={t.value}
              variant={themePref === t.value ? "primary" : "ghost"}
              size="md"
              onClick={() => handleThemeChange(t.value)}
              style={{ height: "auto", padding: "8px 12px" }}
            >
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div className="theme-swatch">
                  {t.colors.map((c, i) => (
                    <div key={i} className="theme-swatch-color" style={{ background: c }} />
                  ))}
                </div>
                <span className="theme-label">{t.label}</span>
              </div>
            </Button>
          ))}
        </div>
      </div>
      <div className="tool-row" style={{ marginTop: 20 }}>
        <span className="tool-label">Animations</span>
        {/* NOTE: <select> not migrated — no Select primitive exists */}
        <select className="tool-select" value={motionPref} onChange={handleMotionChange}>
          <option value="system">Follow system</option>
          <option value="full">Always on</option>
          <option value="reduced">Reduced</option>
        </select>
      </div>
      <div className="danger-desc">Follow system uses your OS Reduce Motion setting.</div>
    </div>
  );
}

function DangerZoneSection() {
  const [deletingSessions, setDeletingSessions] = useState(false);
  const [deletingTemplates, setDeletingTemplates] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"sessions" | "templates" | null>(null);

  const handleConfirmDelete = async () => {
    if (confirmAction === "sessions") {
      setDeletingSessions(true);
      try {
        await invoke("delete_all_sessions");
      } catch (err) {
        console.error("Failed to delete all sessions:", err);
      } finally {
        setDeletingSessions(false);
      }
    } else if (confirmAction === "templates") {
      setDeletingTemplates(true);
      try {
        await invoke("delete_all_templates");
      } catch (err) {
        console.error("Failed to delete all templates:", err);
      } finally {
        setDeletingTemplates(false);
      }
    }
  };

  const confirmTitle =
    confirmAction === "sessions"
      ? "Delete All Sessions?"
      : confirmAction === "templates"
        ? "Delete All Templates?"
        : "";

  const confirmMessage =
    confirmAction === "sessions"
      ? "This will permanently remove every session from the sidebar. This cannot be undone."
      : confirmAction === "templates"
        ? "This will permanently remove all custom templates. Built-in templates will be preserved. This cannot be undone."
        : "";

  return (
    <>
      <div className="danger-zone">
        <p className="danger-warning">
          These actions are irreversible. Proceed with caution.
        </p>
        <div className="danger-section">
          <div className="danger-row">
            <div>
              <div className="danger-label">Delete All Sessions</div>
              <div className="danger-desc">Removes every session from the sidebar.</div>
            </div>
            <Button
              variant="danger"
              loading={deletingSessions}
              onClick={() => setConfirmAction("sessions")}
            >
              Delete All Sessions
            </Button>
          </div>
          <div className="danger-row">
            <div>
              <div className="danger-label">Delete All Templates</div>
              <div className="danger-desc">Removes all custom templates. Built-in templates are preserved.</div>
            </div>
            <Button
              variant="danger"
              loading={deletingTemplates}
              onClick={() => setConfirmAction("templates")}
            >
              Delete All Templates
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmTitle}
        message={confirmMessage}
        confirmLabel="Delete"
        onConfirm={handleConfirmDelete}
        destructive
      />
    </>
  );
}

function PreferencesForm() {
  const { prefs, updatePref, loading } = usePreferences();

  type Tab = "external-tools" | "appearance" | "danger-zone";
  const [activeTab, setActiveTab] = useState<Tab>("external-tools");

  if (loading) {
    return <div className="loading">Loading preferences...</div>;
  }

  const toolPrefs: ToolPrefs = {
    editor: prefs.external_editor,
    diffTool: prefs.external_diff_tool,
    terminal: prefs.external_terminal,
    ptyCommand: prefs.pty_command,
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <SegmentedControl
          options={[
            { value: "external-tools", label: "External Tools" },
            { value: "appearance", label: "Appearance" },
            { value: "danger-zone", label: "Danger Zone" },
          ]}
          value={activeTab}
          onChange={(v) => setActiveTab(v as Tab)}
          ariaLabel="Preferences tabs"
        />
      </div>

      {activeTab === "external-tools" && (
        <ExternalToolsForm toolPrefs={toolPrefs} setToolPrefs={updatePref} />
      )}

      {activeTab === "appearance" && (
        <AppearanceSection motionPref={prefs.motion} setMotionPref={updatePref} themePref={prefs.theme} setThemePref={updatePref} />
      )}

      {activeTab === "danger-zone" && <DangerZoneSection />}
    </>
  );
}

initMotion();

// Apply theme before rendering the preferences window
(async () => {
  try {
    const store = await Store.load("preferences.json", { defaults: {}, autoSave: 300 });
    const savedTheme = await store.get<string>("theme");
    applyTheme((savedTheme as ThemeName) || "dark");
  } catch {
    applyTheme("dark");
  }

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <PreferencesForm />
    </React.StrictMode>,
  );
})();
