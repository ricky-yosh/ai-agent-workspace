import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SessionProvider, useSessions } from "./SessionContext";
import SessionSidebar from "./SessionSidebar";
import SplitLayout from "./SplitLayout";
import LayoutTabs from "./LayoutTabs";
import type { Layout, LayoutTree } from "./SplitLayout";
import "./BlankPanel";
import "./App.css";

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
    invoke("update_layout_tree", { sessionId: activeSessionId, tree: newTree }).catch(console.error);
  };

  const handlePresetSwitch = useCallback((presetId: string) => {
    if (!activeSessionId) return;
    invoke("set_active_layout", { sessionId: activeSessionId, layoutId: presetId })
      .then(() => invoke<Layout | null>("get_active_layout", { sessionId: activeSessionId }))
      .then(setLayout)
      .catch(console.error);
  }, [activeSessionId]);

  const handleOverrideTemplate = useCallback(() => {
    if (!activeSessionId) return;
    invoke("override_layout_template", { sessionId: activeSessionId })
      .then(() => invoke<Layout | null>("get_active_layout", { sessionId: activeSessionId }))
      .then((resolved) => { if (resolved) setLayout(resolved); })
      .catch(console.error);
  }, [activeSessionId]);

  const handleSaveAsTemplate = useCallback((name: string, tree: LayoutTree) => {
    if (!activeSessionId) return;
    invoke<Layout>("save_layout", { name, tree })
      .then((saved) => {
        refreshPresets();
        return invoke("set_active_layout", { sessionId: activeSessionId, layoutId: saved.id })
          .then(() => saved);
      })
      .then((saved) => setLayout(saved))
      .catch(console.error);
  }, [activeSessionId, refreshPresets]);

  const handleResetToTemplate = useCallback(() => {
    if (!activeSessionId) return;
    invoke<Layout>("reset_layout_to_template", { sessionId: activeSessionId })
      .then(setLayout)
      .catch(console.error);
  }, [activeSessionId]);

  const handleRename = useCallback((layoutId: string, newName: string) => {
    invoke("rename_layout", { layoutId, newName })
      .then(() => {
        refreshPresets();
        if (layout && layout.id === layoutId) {
          setLayout({ ...layout, name: newName });
        }
      })
      .catch(console.error);
  }, [layout, refreshPresets]);

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
      <LayoutTabs
        layout={layout}
        presets={presets}
        onLayoutSwitch={handlePresetSwitch}
        onOverrideTemplate={handleOverrideTemplate}
        onSaveAsTemplate={handleSaveAsTemplate}
        onResetToTemplate={handleResetToTemplate}
        onRename={handleRename}
        onDelete={handleDeletePreset}
      />
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
