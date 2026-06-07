import { useState, useRef, useEffect } from "react";
import { Plus } from "lucide-react";
import type { Layout, LayoutTree } from "./SplitLayout";
import "./LayoutTabs.css";

interface WorkspaceInstance {
  id: string;
  name: string;
  template_id: string;
  current_tree: LayoutTree;
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
  onSaveAsTemplate: (name: string, tree: LayoutTree) => void;
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (!dropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

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
    const name = window.prompt("Template name:");
    if (!name || !name.trim()) return;
    const ws = workspaces.find((w) => w.id === ctxMenu.wsId);
    if (ws) onSaveAsTemplate(name.trim(), ws.current_tree);
    setCtxMenu(null);
  }

  function handleDropdownSelect(templateId: string) {
    onAddWorkspace(templateId);
    setDropdownOpen(false);
  }

  function getDropdownStyle(): React.CSSProperties {
    if (!dropdownRef.current) return {};
    const rect = dropdownRef.current.getBoundingClientRect();
    return { left: rect.left, top: rect.bottom };
  }

  return (
    <div className="layout-tabs" onContextMenu={(e) => e.preventDefault()}>
      <div className="layout-tabs-bar">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
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
          {dropdownOpen && dropdownRef.current && (
            <>
              <div className="context-menu-overlay" onClick={() => setDropdownOpen(false)} />
              <div className="context-menu layout-tabs-dropdown" style={getDropdownStyle()}>
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
                <div className="context-menu-separator" />
                <div className="context-menu-item" onClick={() => { setDropdownOpen(false); onOpenTemplateManager(); }}>
                  Manage Templates…
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {ctxMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setCtxMenu(null)} />
          <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
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
