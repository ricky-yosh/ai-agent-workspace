import { useState, useRef, useEffect, useLayoutEffect } from "react";
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
  onSaveAsTemplate: (tree: LayoutTree) => void;
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
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const dropdownMenuRef = useRef<HTMLDivElement>(null);

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

  useLayoutEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return;
    const el = ctxMenuRef.current;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const { innerWidth: w, innerHeight: h } = window;
    let x = ctxMenu.x;
    let y = ctxMenu.y;
    if (x + rect.width > w - 4) x = w - rect.width - 4;
    if (x < 4) x = 4;
    if (y + rect.height > h - 4) y = y - rect.height;
    if (y < 4) y = 4;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
  }, [ctxMenu]);

  useLayoutEffect(() => {
    if (!dropdownOpen || !dropdownMenuRef.current || !dropdownRef.current) return;
    const el = dropdownMenuRef.current;
    const btnRect = dropdownRef.current.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const { innerWidth: w, innerHeight: h } = window;
    let left = btnRect.left;
    let top = btnRect.bottom;
    if (left + rect.width > w - 4) left = w - rect.width - 4;
    if (left < 4) left = 4;
    if (top + rect.height > h - 4) top = btnRect.top - rect.height;
    if (top < 4) top = 4;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
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
    const ws = workspaces.find((w) => w.id === ctxMenu.wsId);
    if (ws) onSaveAsTemplate(ws.current_tree);
    setCtxMenu(null);
  }

  function handleDropdownSelect(templateId: string) {
    onAddWorkspace(templateId);
    setDropdownOpen(false);
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
              <div className="context-menu layout-tabs-dropdown" ref={dropdownMenuRef}>
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
          <div className="context-menu" ref={ctxMenuRef}>
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
