import { useState, useRef, useEffect } from "react";
import type { Layout, LayoutTree } from "./SplitLayout";
import "./LayoutTabs.css";

interface LayoutTabsProps {
  layout: Layout;
  presets: Layout[];
  onLayoutSwitch: (layoutId: string) => void;
  onOverrideTemplate: () => void;
  onSaveAsTemplate: (name: string, tree: LayoutTree) => void;
  onResetToTemplate: () => void;
  onRename: (layoutId: string, newName: string) => void;
  onDelete: (layoutId: string) => void;
}

export default function LayoutTabs({
  layout,
  presets,
  onLayoutSwitch,
  onOverrideTemplate,
  onSaveAsTemplate,
  onResetToTemplate,
  onRename,
  onDelete,
}: LayoutTabsProps) {
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
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

  function handleTabContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }

  function handleOverride() {
    onOverrideTemplate();
    setCtxMenu(null);
  }

  function handleSaveAs() {
    const name = window.prompt("Layout name:");
    if (!name || !name.trim()) return;
    onSaveAsTemplate(name.trim(), layout.tree);
    setCtxMenu(null);
  }

  function handleRename() {
    setRenamingId(layout.id);
    setRenameValue(layout.name);
    setCtxMenu(null);
  }

  function commitRename() {
    if (renameValue.trim()) {
      onRename(layout.id, renameValue.trim());
    }
    setRenamingId(null);
  }

  function handleDelete() {
    onDelete(layout.id);
    setCtxMenu(null);
  }

  function handleReset() {
    onResetToTemplate();
    setCtxMenu(null);
  }

  function getDropdownStyle(): React.CSSProperties {
    if (!dropdownRef.current) return {};
    const rect = dropdownRef.current.getBoundingClientRect();
    return { left: rect.left, top: rect.bottom };
  }

  function handleDropdownSelect(layoutId: string) {
    onLayoutSwitch(layoutId);
    setDropdownOpen(false);
  }

  function handleDropdownSaveAs(presetId: string) {
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    const name = window.prompt("Layout name:", preset.name);
    if (!name || !name.trim()) return;
    onSaveAsTemplate(name.trim(), preset.tree);
    setDropdownOpen(false);
  }

  return (
    <div className="layout-tabs">
      <div className="layout-tabs-bar">
        {presets.map((p) => (
          <div
            key={p.id}
            className={`layout-tab${p.id === layout.id ? " layout-tab-active" : ""}`}
            onClick={() => {
              if (renamingId !== p.id) onLayoutSwitch(p.id);
            }}
            onContextMenu={p.id === layout.id ? handleTabContextMenu : undefined}
          >
            {renamingId === p.id ? (
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
              <span className="layout-tab-name">{p.name}</span>
            )}
          </div>
        ))}
        <div className="layout-tabs-add-wrapper" ref={dropdownRef}>
          <button
            className="layout-tabs-add"
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            +
          </button>
          {dropdownOpen && dropdownRef.current && (
            <>
              <div className="context-menu-overlay" onClick={() => setDropdownOpen(false)} />
              <div className="context-menu layout-tabs-dropdown" style={getDropdownStyle()}>
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="context-menu-item layout-tabs-dropdown-item"
                    onClick={() => handleDropdownSelect(p.id)}
                  >
                    <span>{p.name}</span>
                    <button
                      className="layout-tabs-dropdown-saveas"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDropdownSaveAs(p.id);
                      }}
                      title="Duplicate as new layout"
                    >
                      ⧉
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {ctxMenu && (
        <>
          <div className="context-menu-overlay" onClick={() => setCtxMenu(null)} />
          <div className="context-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <div className="context-menu-item" onClick={handleOverride}>
              Override Template
            </div>
            <div className="context-menu-item" onClick={handleSaveAs}>
              Save as Template
            </div>
            <div className="context-menu-item" onClick={handleRename}>
              Rename
            </div>
            <div className="context-menu-item" onClick={handleReset}>
              Reset to Template
            </div>
            <div className="context-menu-separator" />
            <div
              className={`context-menu-item${presets.length <= 1 ? " context-menu-item-disabled" : ""}`}
              onClick={presets.length > 1 ? handleDelete : undefined}
            >
              Delete
            </div>
          </div>
        </>
      )}
    </div>
  );
}
