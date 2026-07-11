import { useState, useCallback, useEffect, useRef, useMemo, useLayoutEffect, memo } from "react";
import type { CSSProperties } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  File,
  FileText,
  FileCode,
  FileJson,
  FileImage,
  FileArchive,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import type { PanelProps } from "../panelRegistry";
import { registerPanel } from "../panelRegistry";
import { usePanelIdentity, usePanelFocus } from "../PanelContext";
import { Button } from "../components/ui";
import { safeInvoke } from "../safeInvoke";
import { useViewerRegistry } from "../providers/ViewerRegistryProvider";
import "./FileTreePanel.css";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DirectoryEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_hidden: boolean;
}

interface DirectoryListing {
  entries: DirectoryEntry[];
}

// ---------------------------------------------------------------------------
// File icon mapping
// ---------------------------------------------------------------------------

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
  ".rs", ".go", ".py", ".rb", ".java", ".kt", ".scala",
  ".c", ".cpp", ".h", ".hpp", ".cs",
  ".swift", ".m", ".mm",
  ".sh", ".bash", ".zsh", ".fish",
  ".css", ".scss", ".sass", ".less",
  ".html", ".htm", ".vue", ".svelte",
  ".sql", ".graphql", ".gql",
  ".toml", ".yaml", ".yml", ".ini", ".cfg",
  ".env", ".dockerfile",
]);

const TEXT_EXTENSIONS = new Set([
  ".md", ".mdx", ".txt", ".rst", ".log",
  ".csv", ".tsv",
]);

const JSON_EXTENSIONS = new Set([".json", ".jsonc", ".json5"]);

const IMAGE_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
  ".ico", ".bmp", ".tiff",
]);

const ARCHIVE_EXTENSIONS = new Set([
  ".zip", ".tar", ".gz", ".bz2", ".xz", ".7z", ".rar",
]);

function getExtension(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : "";
}

function getFileIcon(name: string, isDir: boolean, isExpanded: boolean) {
  if (isDir) {
    return isExpanded ? (
      <FolderOpen size={14} className="ft-icon ft-icon--folder" />
    ) : (
      <Folder size={14} className="ft-icon ft-icon--folder" />
    );
  }

  const ext = getExtension(name);

  if (JSON_EXTENSIONS.has(ext)) {
    return <FileJson size={14} className="ft-icon ft-icon--json" />;
  }
  if (CODE_EXTENSIONS.has(ext)) {
    return <FileCode size={14} className="ft-icon ft-icon--code" />;
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return <FileText size={14} className="ft-icon ft-icon--text" />;
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return <FileImage size={14} className="ft-icon ft-icon--image" />;
  }
  if (ARCHIVE_EXTENSIONS.has(ext)) {
    return <FileArchive size={14} className="ft-icon ft-icon--archive" />;
  }

  return <File size={14} className="ft-icon ft-icon--default" />;
}

// ---------------------------------------------------------------------------
// TreeNode
// ---------------------------------------------------------------------------

interface TreeNodeProps {
  entry: DirectoryEntry;
  depth: number;
  expandedDirs: Set<string>;
  dirCache: Map<string, DirectoryEntry[]>;
  loadingDirs: Set<string>;
  activeFilePath: string | null;
  onToggleDir: (path: string) => void;
  onFileClick: (path: string) => void;
  showHidden: boolean;
}

const areTreeNodePropsEqual = (prev: TreeNodeProps, next: TreeNodeProps): boolean => {
  if (prev.entry !== next.entry) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.showHidden !== next.showHidden) return false;
  if (prev.onToggleDir !== next.onToggleDir) return false;
  if (prev.onFileClick !== next.onFileClick) return false;

  // Check derived boolean values instead of Set references
  if (prev.expandedDirs.has(prev.entry.path) !== next.expandedDirs.has(next.entry.path)) return false;
  if (prev.loadingDirs.has(prev.entry.path) !== next.loadingDirs.has(next.entry.path)) return false;

  // For directories, check if children changed
  if (prev.entry.is_dir) {
    if (prev.dirCache.get(prev.entry.path) !== next.dirCache.get(next.entry.path)) return false;
  }

  // For files, check active state
  if (!prev.entry.is_dir) {
    if (prev.activeFilePath !== next.activeFilePath) return false;
  }

  return true;
};

function TreeNodeInner({
  entry,
  depth,
  expandedDirs,
  dirCache,
  loadingDirs,
  activeFilePath,
  onToggleDir,
  onFileClick,
  showHidden,
}: TreeNodeProps) {
  const isExpanded = expandedDirs.has(entry.path);
  const isLoading = loadingDirs.has(entry.path);
  const isActive = !entry.is_dir && activeFilePath === entry.path;

  if (entry.is_dir) {
    const children = dirCache.get(entry.path) ?? [];
    const visibleChildren = showHidden
      ? children
      : children.filter((c) => !c.is_hidden);

    return (
      <div className="ft-node">
        <div
          className={`ft-row ft-row--dir ${isExpanded ? "ft-row--expanded" : ""}`}
          style={{ '--depth': depth } as CSSProperties}
          onClick={() => onToggleDir(entry.path)}
          title={entry.path}
        >
          <span className="ft-chevron">
            {isLoading ? (
              <Loader2 size={12} className="ft-spinner" />
            ) : isExpanded ? (
              <ChevronDown size={12} />
            ) : (
              <ChevronRight size={12} />
            )}
          </span>
          {getFileIcon(entry.name, true, isExpanded)}
          <span className="ft-name">{entry.name}</span>
        </div>
        {isExpanded && !isLoading && (
          <div className="ft-children">
            {visibleChildren.map((child) => (
              <TreeNode
                key={child.path}
                entry={child}
                depth={depth + 1}
                expandedDirs={expandedDirs}
                dirCache={dirCache}
                loadingDirs={loadingDirs}
                activeFilePath={activeFilePath}
                onToggleDir={onToggleDir}
                onFileClick={onFileClick}
                showHidden={showHidden}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  // File node
  return (
    <div
      className={`ft-row ft-row--file ${isActive ? "ft-row--active" : ""}`}
      style={{ '--depth': depth } as CSSProperties}
      onClick={() => onFileClick(entry.path)}
      title={entry.path}
    >
      <span className="ft-chevron ft-chevron--placeholder" />
      {getFileIcon(entry.name, false, false)}
      <span className="ft-name">{entry.name}</span>
    </div>
  );
}

const TreeNode = memo(TreeNodeInner, areTreeNodePropsEqual);

// ---------------------------------------------------------------------------
// FileTreePanel
// ---------------------------------------------------------------------------

function FileTreePanel({ panelType: _panelType }: PanelProps) {
  const { sessionId, workspaceId, areaId } =
    usePanelIdentity();
  const { onScreenChange } = usePanelFocus();

  // State
  const [showHidden, setShowHidden] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [dirCache, setDirCache] = useState<Map<string, DirectoryEntry[]>>(
    new Map(),
  );
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const registry = useViewerRegistry();
  const [activeFilePath, setActiveFilePath] = useState<string | null>(
    registry.getActiveFilePath(),
  );
  const [error, setError] = useState<string | null>(null);

  // Refs
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const areaIdRef = useRef(areaId);
  areaIdRef.current = areaId;
  const onScreenChangeRef = useRef(onScreenChange);
  onScreenChangeRef.current = onScreenChange;
  const dirCacheRef = useRef(dirCache);
  useLayoutEffect(() => {
    dirCacheRef.current = dirCache;
  }, [dirCache]);

  // Subscribe to active file changes for highlighting
  useEffect(() => {
    return registry.onActiveFilePathChange(() => {
      setActiveFilePath(registry.getActiveFilePath());
    });
  }, [registry]);

  // Load directory contents
  const loadDirectory = useCallback(
    async (dirPath: string) => {
      if (dirCacheRef.current.has(dirPath)) return;
      setLoadingDirs((prev) => new Set(prev).add(dirPath));
      setError(null);
      try {
        const result = await safeInvoke<DirectoryListing>(
          "list_directory",
          { sessionId: sessionIdRef.current, dirPath },
          (msg) => setError(msg),
        );
        setDirCache((prev) => new Map(prev).set(dirPath, result.entries));
      } catch {
        // Error already handled by safeInvoke onError
      } finally {
        setLoadingDirs((prev) => {
          const next = new Set(prev);
          next.delete(dirPath);
          return next;
        });
      }
    },
    [],
  );

  // Load root directory on mount
  useEffect(() => {
    loadDirectory("");
  }, [loadDirectory]);

  // Toggle directory expansion
  const handleToggleDir = useCallback(
    (dirPath: string) => {
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        if (next.has(dirPath)) {
          next.delete(dirPath);
        } else {
          next.add(dirPath);
          // Load contents if not cached
          if (!dirCacheRef.current.has(dirPath)) {
            loadDirectory(dirPath);
          }
        }
        return next;
      });
    },
    [loadDirectory],
  );

  // Open file in viewer
  const handleFileClick = useCallback(
    (filePath: string) => {
      const viewer = registry.getLastFocusedViewer(workspaceIdRef.current);
      if (viewer) {
        registry.openFileInViewer(filePath);
      } else {
        // No viewer exists — split this panel and create one
        splitAndCreateViewer(filePath);
      }
    },
    [registry],
  );

  // Split this panel to create a new File Viewer panel
  const splitAndCreateViewer = useCallback(async (filePath: string) => {
    const sid = sessionIdRef.current;
    const wid = workspaceIdRef.current;
    const aid = areaIdRef.current;
    if (!sid || !wid || !aid) return;

    try {
      // Split the tree panel vertically (60/40)
      const result = await safeInvoke<{ current_screen: import("../types/screen").Screen }>(
        "split_area",
        { sessionId: sid, workspaceId: wid, areaId: aid, axis: "vertical", factor: 0.6 },
        (msg) => console.error("[FileTreePanel] split error:", msg),
      );

      // Find the new area (the one that wasn't in the old screen)
      const newArea = result.current_screen.areas.find(
        (a) => a.id !== aid,
      );
      if (!newArea) return;

      // Set pending file so the viewer opens it on mount
      registry.setPendingFile(filePath);

      // Change the new area's panel type to file-viewer
      const updatedResult = await safeInvoke<{ current_screen: import("../types/screen").Screen }>(
        "change_panel_type",
        { sessionId: sid, workspaceId: wid, areaId: newArea.id, panelType: "file-viewer" },
        (msg) => console.error("[FileTreePanel] change_panel_type error:", msg),
      );

      // Update the screen
      onScreenChangeRef.current(updatedResult.current_screen);
    } catch (err) {
      console.error("[FileTreePanel] Failed to create viewer:", err);
    }
  }, []);

  // Root entries
  const rootEntries = dirCache.get("") ?? [];
  const visibleRootEntries = useMemo(() => {
    return showHidden ? rootEntries : rootEntries.filter((e) => !e.is_hidden);
  }, [rootEntries, showHidden]);

  return (
    <div className="file-tree-panel">
      {/* Toolbar */}
      <div className="ft-toolbar">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowHidden((prev) => !prev)}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
        >
          {showHidden ? <EyeOff size={14} /> : <Eye size={14} />}
          <span>{showHidden ? "Hidden" : "Hidden"}</span>
        </Button>
      </div>

      {/* Tree content */}
      <div className="ft-scroll">
        {error && <div className="ft-error">{error}</div>}
        {visibleRootEntries.map((entry) => (
          <TreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            expandedDirs={expandedDirs}
            dirCache={dirCache}
            loadingDirs={loadingDirs}
            activeFilePath={activeFilePath}
            onToggleDir={handleToggleDir}
            onFileClick={handleFileClick}
            showHidden={showHidden}
          />
        ))}
        {visibleRootEntries.length === 0 && !error && (
          <div className="ft-empty">Empty directory</div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

registerPanel("file-tree", "File Tree", FileTreePanel);

export default FileTreePanel;
