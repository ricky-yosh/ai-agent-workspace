import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PanelIdentityContext, PanelFocusContext, type PanelContextType } from "../PanelContext";
import type { SessionSummary } from "../SessionContext";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSafeInvoke = vi.fn();
vi.mock("../safeInvoke", () => ({
  safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
}));

const mockSessions: SessionSummary[] = [
  {
    id: "s1",
    name: "Test Session",
    working_directory: "/home/user/project",
    state: "Running",
    active_layout_id: null,
    created_at: "2025-01-01",
    updated_at: "2025-01-01",
    reachable: true,
    project_type: "generic",
  },
];

vi.mock("../SessionContext", () => ({
  useSessions: () => ({
    sessions: mockSessions,
    activeSessionId: "s1",
    setActiveSessionId: vi.fn(),
    refreshSessions: vi.fn(),
    loading: false,
    showNewSessionDialog: false,
    setShowNewSessionDialog: vi.fn(),
    sidebarCollapsed: false,
    setSidebarCollapsed: vi.fn(),
  }),
}));

const mockRegisterViewer = vi.fn();
const mockUnregisterViewer = vi.fn();
const mockFocusViewer = vi.fn();
const mockGetLastFocusedViewer = vi.fn();
const mockOpenFileInViewer = vi.fn();
const mockSetPendingFile = vi.fn();
const mockConsumePendingFile = vi.fn();
const mockSetActiveFilePath = vi.fn();
const mockGetActiveFilePath = vi.fn();
const mockOnActiveFilePathChange = vi.fn();

vi.mock("./viewerRegistry", () => ({
  registerViewer: (...args: unknown[]) => mockRegisterViewer(...args),
  unregisterViewer: (...args: unknown[]) => mockUnregisterViewer(...args),
  focusViewer: (...args: unknown[]) => mockFocusViewer(...args),
  getLastFocusedViewer: (...args: unknown[]) => mockGetLastFocusedViewer(...args),
  openFileInViewer: (...args: unknown[]) => mockOpenFileInViewer(...args),
  setPendingFile: (...args: unknown[]) => mockSetPendingFile(...args),
  consumePendingFile: (...args: unknown[]) => mockConsumePendingFile(...args),
  setActiveFilePath: (...args: unknown[]) => mockSetActiveFilePath(...args),
  getActiveFilePath: (...args: unknown[]) => mockGetActiveFilePath(...args),
  onActiveFilePathChange: (...args: unknown[]) => mockOnActiveFilePathChange(...args),
}));

import FileTreePanel from "./FileTreePanel";

const ctx: PanelContextType = {
  workspaceId: "w1",
  sessionId: "s1",
  areaId: "area1",
  terminalId: null,
  focusedAreaId: "area1",
  onFocusedAreaChange: vi.fn(),
  onScreenChange: vi.fn(),
};

function renderPanel(overrides?: Partial<PanelContextType>) {
  const panelCtx = { ...ctx, ...overrides };
  return render(
    <PanelIdentityContext.Provider value={{ workspaceId: panelCtx.workspaceId, sessionId: panelCtx.sessionId, areaId: panelCtx.areaId, terminalId: panelCtx.terminalId }}>
      <PanelFocusContext.Provider value={{ focusedAreaId: panelCtx.focusedAreaId, onFocusedAreaChange: panelCtx.onFocusedAreaChange, onScreenChange: panelCtx.onScreenChange }}>
        <FileTreePanel panelType="file-tree" />
      </PanelFocusContext.Provider>
    </PanelIdentityContext.Provider>,
  );
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const ROOT_ENTRIES = {
  entries: [
    { name: "src", path: "src", is_dir: true, is_hidden: false },
    { name: "package.json", path: "package.json", is_dir: false, is_hidden: false },
    { name: "README.md", path: "README.md", is_dir: false, is_hidden: false },
    { name: ".gitignore", path: ".gitignore", is_dir: false, is_hidden: true },
  ],
};

const SRC_ENTRIES = {
  entries: [
    { name: "App.tsx", path: "src/App.tsx", is_dir: false, is_hidden: false },
    { name: "index.ts", path: "src/index.ts", is_dir: false, is_hidden: false },
    { name: "components", path: "src/components", is_dir: true, is_hidden: false },
  ],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("FileTreePanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSafeInvoke.mockResolvedValue(ROOT_ENTRIES);
    mockGetLastFocusedViewer.mockReturnValue(null);
    mockGetActiveFilePath.mockReturnValue(null);
    mockOnActiveFilePathChange.mockReturnValue(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("renders the toolbar with hidden files toggle", async () => {
    renderPanel();
    expect(screen.getByTitle("Show hidden files")).toBeTruthy();
  });

  it("loads root directory on mount", async () => {
    renderPanel();
    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith(
        "list_directory",
        expect.objectContaining({ sessionId: "s1", dirPath: "" }),
        expect.any(Function),
      );
    });
  });

  it("shows directory entries after loading", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
      expect(screen.getByText("package.json")).toBeTruthy();
      expect(screen.getByText("README.md")).toBeTruthy();
    });
  });

  it("hides hidden files by default", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });
    expect(screen.queryByText(".gitignore")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Hidden files toggle
  // -----------------------------------------------------------------------

  it("shows hidden files when toggle is clicked", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });

    fireEvent.click(screen.getByTitle("Show hidden files"));
    await waitFor(() => {
      expect(screen.getByText(".gitignore")).toBeTruthy();
    });
  });

  it("hides hidden files when toggle is clicked again", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });

    // Show
    fireEvent.click(screen.getByTitle("Show hidden files"));
    await waitFor(() => {
      expect(screen.getByText(".gitignore")).toBeTruthy();
    });

    // Hide
    fireEvent.click(screen.getByTitle("Hide hidden files"));
    await waitFor(() => {
      expect(screen.queryByText(".gitignore")).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Directory expansion
  // -----------------------------------------------------------------------

  it("expands a directory on click and loads its children", async () => {
    mockSafeInvoke.mockResolvedValueOnce(ROOT_ENTRIES);
    mockSafeInvoke.mockResolvedValueOnce(SRC_ENTRIES);

    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });

    // Click src directory to expand
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith(
        "list_directory",
        expect.objectContaining({ dirPath: "src" }),
        expect.any(Function),
      );
    });

    await waitFor(() => {
      expect(screen.getByText("App.tsx")).toBeTruthy();
      expect(screen.getByText("index.ts")).toBeTruthy();
      expect(screen.getByText("components")).toBeTruthy();
    });
  });

  it("collapses a directory on second click", async () => {
    mockSafeInvoke.mockResolvedValueOnce(ROOT_ENTRIES);
    mockSafeInvoke.mockResolvedValueOnce(SRC_ENTRIES);

    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });

    // Expand
    fireEvent.click(screen.getByText("src"));
    await waitFor(() => {
      expect(screen.getByText("App.tsx")).toBeTruthy();
    });

    // Collapse
    fireEvent.click(screen.getByText("src"));
    await waitFor(() => {
      expect(screen.queryByText("App.tsx")).toBeNull();
    });
  });

  it("does not re-fetch cached directory contents on re-expand", async () => {
    mockSafeInvoke.mockResolvedValueOnce(ROOT_ENTRIES);
    mockSafeInvoke.mockResolvedValueOnce(SRC_ENTRIES);

    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });

    // Expand
    fireEvent.click(screen.getByText("src"));
    await waitFor(() => {
      expect(screen.getByText("App.tsx")).toBeTruthy();
    });

    // Collapse
    fireEvent.click(screen.getByText("src"));

    // Re-expand — should NOT call list_directory again (cached)
    mockSafeInvoke.mockClear();
    fireEvent.click(screen.getByText("src"));

    await waitFor(() => {
      expect(screen.getByText("App.tsx")).toBeTruthy();
    });
    expect(mockSafeInvoke).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // File click
  // -----------------------------------------------------------------------

  it("clicking a file calls openFileInViewer when a viewer exists", async () => {
    mockGetLastFocusedViewer.mockReturnValue({
      areaId: "viewer-area",
      openFile: vi.fn(),
      workspaceId: "w1",
    });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("package.json"));

    expect(mockOpenFileInViewer).toHaveBeenCalledWith("package.json");
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  it("shows error when list_directory fails", async () => {
    mockSafeInvoke.mockImplementation((_cmd: string, _params: unknown, onError?: (msg: string) => void) => {
      if (onError) onError("Permission denied");
      return Promise.reject(new Error("Permission denied"));
    });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Permission denied")).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Empty directory
  // -----------------------------------------------------------------------

  it("shows empty state for empty directories", async () => {
    mockSafeInvoke.mockResolvedValue({ entries: [] });

    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("Empty directory")).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // File icons
  // -----------------------------------------------------------------------

  it("renders folder icon for directories", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("src")).toBeTruthy();
    });
    // Folder icon should be present
    const folderIcons = document.querySelectorAll(".ft-icon--folder");
    expect(folderIcons.length).toBeGreaterThan(0);
  });

  it("renders appropriate file icons", async () => {
    renderPanel();
    await waitFor(() => {
      expect(screen.getByText("package.json")).toBeTruthy();
    });
    // JSON icon for package.json
    const jsonIcons = document.querySelectorAll(".ft-icon--json");
    expect(jsonIcons.length).toBe(1);
    // Text icon for README.md
    const textIcons = document.querySelectorAll(".ft-icon--text");
    expect(textIcons.length).toBe(1);
  });
});
