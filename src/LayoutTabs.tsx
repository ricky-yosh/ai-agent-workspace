import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import type { RefObject } from "react";
import { Plus } from "lucide-react";
import type { Screen } from "./types/screen";
import TabActionsModal from "./TabActionsModal";
import "./LayoutTabs.css";

interface WorkspaceInstance {
  id: string;
  name: string;
  template_id: string;
  current_screen: Screen;
}

interface LayoutTabsProps {
  workspaces: WorkspaceInstance[];
  activeWorkspaceId: string | null;
  onWorkspaceSwitch: (workspaceId: string) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspaceId: string, newName: string) => void;
  onResetToTemplate: (workspaceId: string) => void;
  onSaveAsTemplate: (screen: Screen) => void;
  onOpenNewWorkspace: () => void;
  onManageTemplates: () => void;
  openTabActionsRef?: RefObject<(() => void) | null>;
  closeTabActionsRef?: RefObject<(() => void) | null>;
}

export default function LayoutTabs({
  workspaces,
  activeWorkspaceId,
  onWorkspaceSwitch,
  onCloseWorkspace,
  onRenameWorkspace,
  onResetToTemplate,
  onSaveAsTemplate,
  onOpenNewWorkspace,
  onManageTemplates,
  openTabActionsRef,
  closeTabActionsRef,
}: LayoutTabsProps) {
  const [tabActionsWsId, setTabActionsWsId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  // Sliding pill indicator
  const barRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pillRef = useRef<HTMLDivElement>(null);
  const pillReadyRef = useRef(false);
  const [pillStyle, setPillStyle] = useState<{ left: number; width: number } | null>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!openTabActionsRef) return;
    openTabActionsRef.current = () => {
      if (activeWorkspaceId) setTabActionsWsId(activeWorkspaceId);
    };
    return () => { openTabActionsRef.current = null; };
  }, [openTabActionsRef, activeWorkspaceId]);

  useEffect(() => {
    if (!closeTabActionsRef) return;
    closeTabActionsRef.current = () => setTabActionsWsId(null);
    return () => { closeTabActionsRef.current = null; };
  }, [closeTabActionsRef]);

  // Measure the active tab and position the pill
  const measurePill = useCallback(() => {
    if (!barRef.current || !activeWorkspaceId) {
      setPillStyle(null);
      return;
    }
    const tabEl = tabRefs.current.get(activeWorkspaceId);
    if (!tabEl) {
      setPillStyle(null);
      return;
    }
    const left = tabEl.offsetLeft;
    const width = tabEl.offsetWidth;
    setPillStyle({ left, width });
  }, [activeWorkspaceId]);

  // Run measurement synchronously after layout so pill position is set before paint
  useLayoutEffect(() => {
    if (workspaces.length === 0) {
      setPillStyle(null);
      pillReadyRef.current = false;
      return;
    }
    measurePill();
    if (!pillReadyRef.current) {
      const raf = requestAnimationFrame(() => {
        pillReadyRef.current = true;
        if (pillRef.current) {
          pillRef.current.setAttribute("data-ready", "true");
        }
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [activeWorkspaceId, workspaces, measurePill]);

  // Re-measure on container resize
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => measurePill());
    ro.observe(bar);
    return () => ro.disconnect();
  }, [measurePill]);

  function handleTabContextMenu(e: React.MouseEvent, wsId: string) {
    e.preventDefault();
    setTabActionsWsId(wsId);
  }

  const tabActionsWs = tabActionsWsId
    ? workspaces.find((w) => w.id === tabActionsWsId) ?? null
    : null;

  function handleRenameStart() {
    if (!tabActionsWs) return;
    setRenamingId(tabActionsWs.id);
    setRenameValue(tabActionsWs.name);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenameWorkspace(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }

  function handleCloseTab() {
    if (!tabActionsWs) return;
    onCloseWorkspace(tabActionsWs.id);
  }

  function handleReset() {
    if (!tabActionsWs) return;
    onResetToTemplate(tabActionsWs.id);
  }

  function handleSaveAs() {
    if (!tabActionsWs) return;
    onSaveAsTemplate(tabActionsWs.current_screen);
  }

  return (
    <div className="layout-tabs" onContextMenu={(e) => e.preventDefault()}>
      <div className="layout-tabs-bar" ref={barRef}>
        {/* Sliding pill behind the active tab */}
        {pillStyle && (
          <div
            ref={pillRef}
            className="layout-tab-indicator"
            style={{ left: pillStyle.left, width: pillStyle.width }}
          />
        )}
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            ref={(el) => {
              if (el) tabRefs.current.set(ws.id, el);
              else tabRefs.current.delete(ws.id);
            }}
            className={`layout-tab${ws.id === activeWorkspaceId ? " layout-tab-active" : ""}`}
            onClick={() => {
              if (renamingId !== ws.id) onWorkspaceSwitch(ws.id);
            }}
            onContextMenu={(e) => handleTabContextMenu(e, ws.id)}
          >
            {renamingId === ws.id ? (
              <input
                ref={renameInputRef}
                className="layout-tab-rename-input"
                value={renameValue}
                size={Math.max(renameValue.length, 8)}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  if (e.key === "Escape") setRenamingId(null);
                }}
              />
            ) : (
              <span className="layout-tab-name">{ws.name}</span>
            )}
          </div>
        ))}
        <div className="layout-tabs-add-wrapper">
          <button
            className="layout-tabs-add"
            onClick={onOpenNewWorkspace}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      <TabActionsModal
        open={tabActionsWsId !== null}
        onClose={() => setTabActionsWsId(null)}
        workspaceName={tabActionsWs?.name ?? ""}
        onRename={() => {
          setTabActionsWsId(null);
          handleRenameStart();
        }}
        onSaveAsTemplate={() => {
          setTabActionsWsId(null);
          handleSaveAs();
        }}
        onResetToTemplate={() => {
          setTabActionsWsId(null);
          handleReset();
        }}
        onCloseTab={() => {
          setTabActionsWsId(null);
          handleCloseTab();
        }}
        onManageTemplates={() => {
          setTabActionsWsId(null);
          onManageTemplates();
        }}
      />
    </div>
  );
}
