import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionProvider, useSessions } from "./SessionContext";
import SessionSidebar from "./SessionSidebar";
import SplitLayout from "./SplitLayout";
import type { Layout, LayoutTree } from "./SplitLayout";
import "./BlankPanel";
import "./App.css";
import "./LayoutToolbar.css";

function MainArea() {
  const { activeSessionId } = useSessions();
  const [layout, setLayout] = useState<Layout | null>(null);
  const [loading, setLoading] = useState(false);
  const [presets, setPresets] = useState<Layout[]>([]);

  const refreshPresets = useCallback(() => {
    invoke<Layout[]>("list_layouts").then(setPresets).catch(console.error);
  }, []);

  useEffect(() => {
    refreshPresets();
  }, [refreshPresets]);

  useEffect(() => {
    if (activeSessionId) {
      setLoading(true);
      invoke<Layout | null>("get_active_layout", { sessionId: activeSessionId })
        .then(setLayout)
        .catch(() => setLayout(null))
        .finally(() => setLoading(false));
    } else {
      setLayout(null);
      setLoading(false);
    }
  }, [activeSessionId]);

  const handleLayoutChange = (newTree: LayoutTree) => {
    if (!layout) return;
    setLayout({ ...layout, tree: newTree });
    invoke("update_layout_tree", { layoutId: layout.id, tree: newTree }).catch(console.error);
  };

  const handlePresetSwitch = useCallback((presetId: string) => {
    if (!activeSessionId) return;
    invoke("set_active_layout", { sessionId: activeSessionId, layoutId: presetId })
      .then(() => invoke<Layout | null>("get_active_layout", { sessionId: activeSessionId }))
      .then(setLayout)
      .catch(console.error);
  }, [activeSessionId]);

  const handleSavePreset = useCallback(() => {
    if (!layout || !activeSessionId) return;
    const name = window.prompt("Layout name:");
    if (!name || !name.trim()) return;
    invoke<Layout>("save_layout", { name: name.trim(), tree: layout.tree })
      .then((saved) => {
        refreshPresets();
        return invoke("set_active_layout", { sessionId: activeSessionId, layoutId: saved.id })
          .then(() => saved);
      })
      .then((saved) => setLayout(saved))
      .catch(console.error);
  }, [layout, activeSessionId, refreshPresets]);

  const handleDeletePreset = useCallback((layoutId: string) => {
    invoke("delete_layout", { layoutId })
      .then(() => {
        refreshPresets();
        if (layout && layout.id === layoutId) {
          return invoke<Layout[]>("list_layouts").then((updated) => {
            if (updated.length > 0) {
              const fallback = updated[0];
              if (activeSessionId) {
                return invoke("set_active_layout", { sessionId: activeSessionId, layoutId: fallback.id })
                  .then(() => setLayout(fallback));
              }
            }
            setLayout(null);
          });
        }
      })
      .catch(console.error);
  }, [layout, activeSessionId, refreshPresets]);

  if (!activeSessionId) {
    return (
      <main className="main-content">
        <div className="empty-state">Open a Session to begin</div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="main-content">
        <div className="empty-state">Loading...</div>
      </main>
    );
  }

  if (!layout) {
    return (
      <main className="main-content">
        <div className="empty-state">No layout found</div>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div className="layout-toolbar">
        <select
          value={layout.id}
          onChange={(e) => handlePresetSwitch(e.target.value)}
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="layout-toolbar-separator" />
        <button onClick={handleSavePreset}>Save As...</button>
        <button
          onClick={() => handleDeletePreset(layout.id)}
          disabled={presets.length <= 1}
        >
          Delete
        </button>
      </div>
      <SplitLayout tree={layout.tree} onLayoutChange={handleLayoutChange} />
    </main>
  );
}

function App() {
  return (
    <SessionProvider>
      <div className="app-layout">
        <SessionSidebar />
        <MainArea />
      </div>
    </SessionProvider>
  );
}

export default App;
