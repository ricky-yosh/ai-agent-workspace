import React, { useEffect, useState, useCallback } from "react";
import ReactDOM from "react-dom/client";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { AlertTriangle } from "lucide-react";
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

const PTY_COMMAND_PRESETS: Preset[] = [
  { label: "Default Shell ($SHELL)", bundleName: "$SHELL" },
  { label: "Claude Code", bundleName: "claude" },
  { label: "Codex CLI", bundleName: "codex" },
];

const CUSTOM_SENTINEL = "__custom__";

function usePreferences() {
  const [store, setStore] = useState<Store | null>(null);
  const [prefs, setPrefs] = useState({
    external_editor: "",
    external_diff_tool: "",
    external_terminal: "",
    pty_command: "$SHELL",
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
        const [editor, diffTool, terminal, ptyCommand] = await Promise.all([
          s.get<string>("external_editor"),
          s.get<string>("external_diff_tool"),
          s.get<string>("external_terminal"),
          s.get<string>("pty_command"),
        ]);
        setPrefs({
          external_editor: editor ?? "",
          external_diff_tool: diffTool ?? "",
          external_terminal: terminal ?? "",
          pty_command: ptyCommand ?? "$SHELL",
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
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function PreferencesForm() {
  const { prefs, updatePref, loading } = usePreferences();

  type Tab = "external-tools" | "danger-zone";
  const [activeTab, setActiveTab] = useState<Tab>("external-tools");
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
        setConfirmAction(null);
      }
    } else if (confirmAction === "templates") {
      setDeletingTemplates(true);
      try {
        await invoke("delete_all_templates");
      } catch (err) {
        console.error("Failed to delete all templates:", err);
      } finally {
        setDeletingTemplates(false);
        setConfirmAction(null);
      }
    }
  };

  if (loading) {
    return <div className="loading">Loading preferences...</div>;
  }

  return (
    <>
      <div className="tabs">
        <button
          className={`tab ${activeTab === "external-tools" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("external-tools")}
        >
          External Tools
        </button>
        <button
          className={`tab ${activeTab === "danger-zone" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("danger-zone")}
        >
          Danger Zone
        </button>
      </div>

      {activeTab === "external-tools" && (
        <>
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
          <ToolRow
            label="PTY Command"
            presets={PTY_COMMAND_PRESETS}
            value={prefs.pty_command}
            onChange={(v) => updatePref("pty_command", v)}
            placeholder="Command (e.g., claude, /bin/zsh)"
          />
        </>
      )}

      {activeTab === "danger-zone" && (
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
              <button
                className="danger-btn"
                onClick={() => setConfirmAction("sessions")}
                disabled={deletingSessions}
              >
                {deletingSessions ? "Deleting..." : "Delete All Sessions"}
              </button>
            </div>
            <div className="danger-row">
              <div>
                <div className="danger-label">Delete All Templates</div>
                <div className="danger-desc">Removes all custom templates. Built-in templates are preserved.</div>
              </div>
              <button
                className="danger-btn"
                onClick={() => setConfirmAction("templates")}
                disabled={deletingTemplates}
              >
                {deletingTemplates ? "Deleting..." : "Delete All Templates"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmAction && (
        <div
          className="confirm-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmAction(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirmAction(null);
          }}
        >
          <div className="confirm-dialog" role="alertdialog" aria-modal="true">
            <div className="confirm-icon">
              <AlertTriangle size={28} strokeWidth={1.5} />
            </div>
            <div className="confirm-title">
              {confirmAction === "sessions"
                ? "Delete All Sessions?"
                : "Delete All Templates?"}
            </div>
            <div className="confirm-message">
              {confirmAction === "sessions"
                ? "This will permanently remove every session from the sidebar. This cannot be undone."
                : "This will permanently remove all custom templates. Built-in templates will be preserved. This cannot be undone."}
            </div>
            <div className="confirm-actions">
              <button
                className="confirm-cancel-btn"
                onClick={() => setConfirmAction(null)}
              >
                Cancel
              </button>
              <button
                className="confirm-delete-btn"
                onClick={handleConfirmDelete}
                disabled={confirmAction === "sessions" ? deletingSessions : deletingTemplates}
              >
                {(confirmAction === "sessions" ? deletingSessions : deletingTemplates)
                  ? "Deleting..."
                  : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <PreferencesForm />
  </React.StrictMode>,
);
