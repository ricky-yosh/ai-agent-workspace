import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "../components/ui";
import { FileText, X } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelIdentity, usePanelFocus } from "../PanelContext";
import { useSessions } from "../SessionContext";
import { useFileContent } from "./useFileContent";
import { useViewerRegistry } from "../providers/ViewerRegistryProvider";
import { MarkdownRenderer } from "./renderers/MarkdownRenderer";
import { PlainTextRenderer } from "./renderers/PlainTextRenderer";
import "./FileViewerPanel.css";

// ---------------------------------------------------------------------------
// File extension → renderer mapping
// ---------------------------------------------------------------------------

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx", ".markdown"]);

function getExtension(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  const name = lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function isMarkdown(filePath: string): boolean {
  return MARKDOWN_EXTENSIONS.has(getExtension(filePath));
}

function getFileName(filePath: string): string {
  const lastSlash = filePath.lastIndexOf("/");
  return lastSlash >= 0 ? filePath.slice(lastSlash + 1) : filePath;
}

// ---------------------------------------------------------------------------
// Binary detection heuristic
// ---------------------------------------------------------------------------

function isBinaryError(error: string | null): boolean {
  if (!error) return false;
  return error.includes("Binary file detected") || error.includes("not valid UTF-8");
}

// ---------------------------------------------------------------------------
// Tab state types
// ---------------------------------------------------------------------------

export interface Tab {
  id: string;
  filePath: string;
  title: string;
}

// ---------------------------------------------------------------------------
// FileViewerPanel
// ---------------------------------------------------------------------------

let tabCounter = 0;
function nextTabId(): string {
  return `tab-${++tabCounter}-${Date.now()}`;
}

function FileViewerPanel({ panelType: _panelType }: PanelProps) {
  const { sessionId, areaId, workspaceId } = usePanelIdentity();
  const { focusedAreaId } = usePanelFocus();
  const { sessions } = useSessions();

  // Tab state — local to this panel instance
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  const { content, loading, error, size } = useFileContent(
    sessionId,
    activeTab?.filePath ?? null,
  );

  // Get working directory for file picker
  const workingDirectory = sessions.find((s) => s.id === sessionId)?.working_directory ?? null;

  // --- Tab operations ---

  const openTab = useCallback((filePath: string) => {
    const trimmed = filePath.trim();
    if (!trimmed) return;

    // Check if this file is already open in this panel
    const existing = tabsRef.current.find((t) => t.filePath === trimmed);
    if (existing) {
      setActiveTabId(existing.id);
      return;
    }

    const newTab: Tab = {
      id: nextTabId(),
      filePath: trimmed,
      title: getFileName(trimmed),
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  // --- Viewer registry integration ---

  const registry = useViewerRegistry();

  // Register/unregister with the viewer registry
  useEffect(() => {
    registry.registerViewer(areaId, openTab, workspaceId, "file");
    return () => registry.unregisterViewer(areaId);
  }, [registry, areaId, openTab, workspaceId]);

  // Focus viewer when this panel becomes focused
  useEffect(() => {
    if (focusedAreaId === areaId) {
      registry.focusViewer(areaId);
    }
  }, [registry, focusedAreaId, areaId]);

  // Listen for external file open requests (from FileTreePanel, etc.)
  useEffect(() => {
    function handleOpenFile(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail?.filePath) {
        openTab(detail.filePath);
      }
    }
    window.addEventListener("viewer:open-file", handleOpenFile);
    return () => window.removeEventListener("viewer:open-file", handleOpenFile);
  }, [openTab]);

  // Open pending file (for create-then-open flow from FileTreePanel)
  useEffect(() => {
    const pending = registry.consumePendingFile();
    if (pending) {
      openTab(pending);
    }
  }, [registry, openTab]);

  // Track active file in registry for tree highlighting
  useEffect(() => {
    const activePath = activeTab?.filePath ?? null;
    registry.setActiveFilePath(activePath);
  }, [registry, activeTab?.filePath]);

  const closeTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      if (idx === -1) return prev;

      const next = prev.filter((t) => t.id !== tabId);

      // If we're closing the active tab, activate an adjacent one
      if (tabId === activeTabId) {
        if (next.length === 0) {
          setActiveTabId(null);
        } else {
          // Activate the tab that was after the closed one, or the last one
          const newIdx = Math.min(idx, next.length - 1);
          setActiveTabId(next[newIdx].id);
        }
      }

      return next;
    });
  }, [activeTabId]);

  const activateTab = useCallback((tabId: string) => {
    setActiveTabId(tabId);
  }, []);

  // --- File picker ---

  const openFilePicker = useCallback(async () => {
    try {
      const selected = await openDialog({
        title: "Open File",
        defaultPath: workingDirectory ?? undefined,
        filters: [{ name: "All Files", extensions: ["*"] }],
      });
      if (selected) {
        // Convert absolute path to relative if it's within the working directory
        let relativePath = selected as string;
        if (workingDirectory && relativePath.startsWith(workingDirectory)) {
          relativePath = relativePath.slice(workingDirectory.length + 1);
        }
        openTab(relativePath);
      }
    } catch (err) {
      console.error("[FileViewerPanel] File picker error:", err);
    }
  }, [workingDirectory, openTab]);

  // --- Keyboard shortcut: Cmd+Shift+P ---

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "P") {
        e.preventDefault();
        openFilePicker();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [openFilePicker]);

  const isBinary = isBinaryError(error);
  const renderMarkdown = activeTab !== null && isMarkdown(activeTab.filePath) && content !== null;

  return (
    <div className="file-viewer-panel">
      {/* Tab bar — always visible so the + button is always accessible */}
      <div className="file-viewer-tabbar">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`file-viewer-tab${tab.id === activeTabId ? " file-viewer-tab--active" : ""}`}
            onClick={() => activateTab(tab.id)}
            title={tab.filePath}
          >
            <FileText size={12} className="file-viewer-tab-icon" />
            <span className="file-viewer-tab-title">{tab.title}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              aria-label={`Close ${tab.title}`}
            >
              <X size={12} />
            </Button>
          </div>
        ))}
        <Button
          variant="ghost"
          size="sm"
          onClick={openFilePicker}
          title="Open file (Cmd+Shift+P)"
        >
          +
        </Button>
      </div>

      {/* Content area */}
      <div className="file-viewer-content">
        {tabs.length === 0 && (
          <div className="file-viewer-empty">
            Press <kbd>⌘⇧P</kbd> or click <strong>+</strong> above to open a file.
          </div>
        )}

        {activeTab && loading && (
          <div className="file-viewer-loading">
            Loading…
          </div>
        )}

        {activeTab && !loading && isBinary && (
          <div className="file-viewer-binary">
            Binary file not supported.
          </div>
        )}

        {activeTab && !loading && error && !isBinary && (
          <div className="file-viewer-error">
            {error}
          </div>
        )}

        {activeTab && !loading && !error && content !== null && (
          <div className="file-viewer-file-info">
            {renderMarkdown ? (
              <MarkdownRenderer content={content} />
            ) : (
              <PlainTextRenderer content={content} />
            )}
          </div>
        )}

        {activeTab && !loading && !error && content === null && !isBinary && (
          <div className="file-viewer-empty">
            File is empty.
          </div>
        )}
      </div>

      {/* Status bar */}
      {activeTab && size !== null && (
        <div className="file-viewer-statusbar">
          <span>{size.toLocaleString()} bytes</span>
          {renderMarkdown && <span>Markdown</span>}
          {!renderMarkdown && <span>Plain text</span>}
        </div>
      )}
    </div>
  );
}

registerPanel("file-viewer", "File Viewer", FileViewerPanel);

export default FileViewerPanel;
