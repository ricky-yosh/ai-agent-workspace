import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import type { Layout, Screen } from "./types/screen";
import { useAnchoredPosition } from "./hooks/useAnchoredPosition";
import "./LayoutTabs.css";
import "./ContextMenu.css";

interface WorkspaceInstance {
  id: string;
  name: string;
  template_id: string;
  current_screen: Screen;
}

interface LayoutTabsProps {
  workspaces: WorkspaceInstance[];
  activeWorkspaceId: string | null;
  templates: Layout[];
  onWorkspaceSwitch: (workspaceId: string) => void;
  onAddWorkspace: (templateId: string) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onRenameWorkspace: (workspaceId: string, newName: string) => void;
  onResetToTemplate: (workspaceId: string) => void;
  onSaveAsTemplate: (screen: Screen) => void;
  onOpenTemplateManager: () => void;
}

export default function LayoutTabs({
  workspaces,
  activeWorkspaceId,
  templates,
  onWorkspaceSwitch,
  onAddWorkspace,
  onCloseWorkspace,
  onRenameWorkspace,
  onResetToTemplate,
  onSaveAsTemplate,
  onOpenTemplateManager,
}: LayoutTabsProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wsId: string } | null>(null);
  const [ctxMenuOpen, setCtxMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);

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
    // offsetLeft is relative to offsetParent; since barRef has position:relative
    // it will be the offsetParent of the tab divs.
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
      // After first measurement we need one rAF to let the browser paint the
      // initial (non-animated) position, then mark the pill as ready so
      // transitions are enabled for all subsequent changes.
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

  useEffect(() => {
    if (ctxMenu) {
      setCtxMenuOpen(false);
      const raf = requestAnimationFrame(() => setCtxMenuOpen(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setCtxMenuOpen(false);
    }
  }, [ctxMenu]);

  useEffect(() => {
    if (dropdownOpen) {
      setDropdownVisible(false);
      const raf = requestAnimationFrame(() => setDropdownVisible(true));
      return () => cancelAnimationFrame(raf);
    } else {
      setDropdownVisible(false);
    }
  }, [dropdownOpen]);

  useAnchoredPosition(ctxMenuRef, {
    anchorX: ctxMenu?.x ?? 0,
    anchorY: ctxMenu?.y ?? 0,
    enabled: ctxMenu !== null,
  });

  const btnRect = dropdownRef.current?.getBoundingClientRect();
  useAnchoredPosition(dropdownMenuRef, {
    anchorX: btnRect?.left ?? 0,
    anchorY: btnRect?.bottom ?? 0,
    enabled: dropdownOpen,
  });

  function handleTabContextMenu(e: React.MouseEvent, wsId: string) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, wsId });
  }

  function handleRenameStart() {
    if (!ctxMenu) return;
    const ws = workspaces.find((w) => w.id === ctxMenu.wsId);
    if (ws) {
      setRenamingId(ws.id);
      setRenameValue(ws.name);
    }
    setCtxMenu(null);
  }

  function commitRename() {
    if (renamingId && renameValue.trim()) {
      onRenameWorkspace(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  }

  function handleClose() {
    if (!ctxMenu) return;
    onCloseWorkspace(ctxMenu.wsId);
    setCtxMenu(null);
  }

  function handleReset() {
    if (!ctxMenu) return;
    onResetToTemplate(ctxMenu.wsId);
    setCtxMenu(null);
  }

  function handleSaveAs() {
    if (!ctxMenu) return;
    const ws = workspaces.find((w) => w.id === ctxMenu.wsId);
    if (ws) onSaveAsTemplate(ws.current_screen);
    setCtxMenu(null);
  }

  function handleDropdownSelect(templateId: string) {
    onAddWorkspace(templateId);
    setDropdownOpen(false);
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
        <div className="layout-tabs-add-wrapper" ref={dropdownRef}>
          <button
            className="layout-tabs-add"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <Plus size={14} />
          </button>
          {dropdownOpen && dropdownRef.current && createPortal(
            <>
              <div className={`context-menu-overlay${dropdownVisible ? " open" : ""}`} onClick={() => setDropdownOpen(false)} />
              <div className={`context-menu layout-tabs-dropdown${dropdownVisible ? " open" : ""}`} ref={dropdownMenuRef}>
                {templates.map((t) => (
                  <div
                    key={t.id}
                    className="context-menu-item"
                    onClick={() => handleDropdownSelect(t.id)}
                  >
                    {t.name}
                  </div>
                ))}
                {templates.length === 0 && (
                  <div className="context-menu-item context-menu-item-disabled">
                    No templates
                  </div>
                )}
                <div className="context-menu-divider" />
                <div className="context-menu-item" onClick={() => { setDropdownOpen(false); onOpenTemplateManager(); }}>
                  Manage Templates…
                </div>
              </div>
            </>,
            document.body
          )}
        </div>
      </div>
      {ctxMenu && (
        <>
          <div className={`context-menu-overlay${ctxMenuOpen ? " open" : ""}`} onClick={() => setCtxMenu(null)} />
          <div className={`context-menu${ctxMenuOpen ? " open" : ""}`} ref={ctxMenuRef}>
            <div className="context-menu-item" onClick={handleClose}>
              Close
            </div>
            <div className="context-menu-item" onClick={handleRenameStart}>
              Rename
            </div>
            <div className="context-menu-item" onClick={handleReset}>
              Reset to Template
            </div>
            <div className="context-menu-item" onClick={handleSaveAs}>
              Save as Template
            </div>
          </div>
        </>
      )}
    </div>
  );
}
