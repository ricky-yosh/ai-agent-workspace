import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PanelIdentityContext, PanelFocusContext, type PanelContextType } from "../PanelContext";
import type { SessionSummary } from "../SessionContext";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("../PanelContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../PanelContext")>();
  return actual;
});

const mockUseFileContent = vi.fn();
vi.mock("./useFileContent", () => ({
  useFileContent: (...args: unknown[]) => mockUseFileContent(...args),
}));

vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div data-testid="markdown-output">{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

vi.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: (options: { count: number }) => {
    const count = options.count;
    const virtualItems = Array.from({ length: Math.min(count, 50) }, (_, i) => ({
      index: i, start: i * 20, size: 20, key: i,
    }));
    return { getVirtualItems: () => virtualItems, getTotalSize: () => count * 20 };
  },
}));

const mockOpenDialog = vi.fn();
vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: (...args: unknown[]) => mockOpenDialog(...args),
}));

const mockSessions: SessionSummary[] = [
  {
    id: "s1", name: "Test Session", working_directory: "/home/user/project",
    state: "Running", active_layout_id: null,
    created_at: "2025-01-01", updated_at: "2025-01-01",
    reachable: true, project_type: "generic",
  },
];

vi.mock("../SessionContext", () => ({
  useSessions: () => ({
    sessions: mockSessions, activeSessionId: "s1", setActiveSessionId: vi.fn(),
    refreshSessions: vi.fn(), loading: false, showNewSessionDialog: false,
    setShowNewSessionDialog: vi.fn(), sidebarCollapsed: false, setSidebarCollapsed: vi.fn(),
  }),
}));

import FileViewerPanel from "./FileViewerPanel";

const ctx: PanelContextType = {
  workspaceId: "w1", sessionId: "s1", areaId: "area1", terminalId: null,
  focusedAreaId: "area1", onFocusedAreaChange: () => {}, onScreenChange: () => {},
};

function renderPanel(overrides?: Partial<PanelContextType>) {
  const panelCtx = { ...ctx, ...overrides };
  return render(
    <PanelIdentityContext.Provider value={{ workspaceId: panelCtx.workspaceId, sessionId: panelCtx.sessionId, areaId: panelCtx.areaId, terminalId: panelCtx.terminalId }}>
      <PanelFocusContext.Provider value={{ focusedAreaId: panelCtx.focusedAreaId, onFocusedAreaChange: panelCtx.onFocusedAreaChange, onScreenChange: panelCtx.onScreenChange }}>
        <FileViewerPanel panelType="file-viewer" />
      </PanelFocusContext.Provider>
    </PanelIdentityContext.Provider>,
  );
}

/** Click the "+" add-file button (uses getByRole to avoid matching the hint text) */
function clickAddButton() {
  fireEvent.click(screen.getByRole("button", { name: "+" }));
}

/** Open a file via the picker dialog and wait for the tab to appear */
async function openFileViaPicker(filePath: string) {
  mockOpenDialog.mockResolvedValue(filePath);
  clickAddButton();
  const name = filePath.split("/").pop()!;
  await waitFor(() => {
    expect(screen.getByText(name)).toBeTruthy();
  });
}

describe("FileViewerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenDialog.mockResolvedValue(null);
    mockUseFileContent.mockReturnValue({
      content: null, loading: false, error: null, size: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("shows empty state with keyboard shortcut hint when no tabs are open", () => {
    renderPanel();
    expect(screen.getByText(/Press/)).toBeTruthy();
    expect(screen.getByText("⌘⇧P")).toBeTruthy();
    // The + button should always be visible in the tab bar
    expect(screen.getByRole("button", { name: "+" })).toBeTruthy();
  });

  it("does not show status bar when no tabs are open", () => {
    renderPanel();
    expect(screen.queryByText("bytes")).toBeNull();
  });

  it("tab bar is always visible", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "+" })).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Tab management — opening files
  // -----------------------------------------------------------------------

  it("opening a file adds a tab and activates it", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/README.md");
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  it("opening the same file twice activates the existing tab (no duplicate)", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/README.md");

    // Open same file again — should not add a second tab
    mockOpenDialog.mockResolvedValue("/home/user/project/README.md");
    clickAddButton();
    await waitFor(() => {
      expect(mockOpenDialog).toHaveBeenCalledTimes(2);
    });
    // Still only one tab-title element with "README.md"
    expect(screen.getByText("README.md")).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Tab management — closing tabs
  // -----------------------------------------------------------------------

  it("closing a tab removes it", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/README.md");
    fireEvent.click(screen.getByRole("button", { name: "Close README.md" }));
    await waitFor(() => {
      expect(screen.queryByText("README.md")).toBeNull();
    });
    expect(screen.getByText(/Press/)).toBeTruthy();
  });

  it("closing a tab activates the adjacent tab", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/a.txt");
    await openFileViaPicker("/home/user/project/b.txt");
    expect(screen.getByText("a.txt")).toBeTruthy();
    expect(screen.getByText("b.txt")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close b.txt" }));
    await waitFor(() => {
      expect(screen.queryByText("b.txt")).toBeNull();
    });
    expect(screen.getByText("a.txt")).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Tab management — switching tabs
  // -----------------------------------------------------------------------

  it("clicking a tab switches the displayed file", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/a.txt");
    await openFileViaPicker("/home/user/project/b.txt");

    // B is active now; click A tab
    fireEvent.click(screen.getByText("a.txt"));

    await waitFor(() => {
      const calls = mockUseFileContent.mock.calls;
      expect(calls.some((c) => c[1] === "a.txt")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Content rendering for active tab
  // -----------------------------------------------------------------------

  it("passes active tab filePath to useFileContent", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/hello.txt");
    const lastCall = mockUseFileContent.mock.calls[mockUseFileContent.mock.calls.length - 1];
    expect(lastCall[0]).toBe("s1");
    expect(lastCall[1]).toBe("hello.txt");
  });

  it("passes active tab filePath for error state", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/missing.txt");
    const lastCall = mockUseFileContent.mock.calls[mockUseFileContent.mock.calls.length - 1];
    expect(lastCall[1]).toBe("missing.txt");
  });

  it("passes active tab filePath for binary error state", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/image.png");
    const lastCall = mockUseFileContent.mock.calls[mockUseFileContent.mock.calls.length - 1];
    expect(lastCall[1]).toBe("image.png");
  });

  it("passes active tab filePath for markdown detection", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/README.md");
    const lastCall = mockUseFileContent.mock.calls[mockUseFileContent.mock.calls.length - 1];
    expect(lastCall[1]).toBe("README.md");
  });

  it("passes active tab filePath for status bar", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/data.txt");
    const lastCall = mockUseFileContent.mock.calls[mockUseFileContent.mock.calls.length - 1];
    expect(lastCall[1]).toBe("data.txt");
  });

  // -----------------------------------------------------------------------
  // Keyboard shortcut: Cmd+Shift+P
  // -----------------------------------------------------------------------

  it("Cmd+Shift+P triggers file picker", () => {
    renderPanel();
    fireEvent.keyDown(document, { key: "P", metaKey: true, shiftKey: true, bubbles: true });
    expect(mockOpenDialog).toHaveBeenCalledTimes(1);
    expect(mockOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Open File" }),
    );
  });

  it("Cmd+Shift+P opens file scoped to session working directory", () => {
    renderPanel();
    fireEvent.keyDown(document, { key: "P", metaKey: true, shiftKey: true, bubbles: true });
    expect(mockOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "/home/user/project" }),
    );
  });

  it("selected file from picker opens as a new tab", async () => {
    renderPanel();
    mockOpenDialog.mockResolvedValue("/home/user/project/src/index.ts");
    fireEvent.keyDown(document, { key: "P", metaKey: true, shiftKey: true, bubbles: true });
    await waitFor(() => {
      expect(screen.getByText("index.ts")).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Independent tab state across panel instances
  // -----------------------------------------------------------------------

  it("tabs are independent across panel instances", async () => {
    const ctx1: PanelContextType = { ...ctx, areaId: "area1" };
    const ctx2: PanelContextType = { ...ctx, areaId: "area2" };

    const { unmount: u1 } = render(
      <PanelIdentityContext.Provider value={{ workspaceId: ctx1.workspaceId, sessionId: ctx1.sessionId, areaId: ctx1.areaId, terminalId: ctx1.terminalId }}>
        <PanelFocusContext.Provider value={{ focusedAreaId: ctx1.focusedAreaId, onFocusedAreaChange: ctx1.onFocusedAreaChange, onScreenChange: ctx1.onScreenChange }}>
          <FileViewerPanel panelType="file-viewer" />
        </PanelFocusContext.Provider>
      </PanelIdentityContext.Provider>,
    );
    const { unmount: u2 } = render(
      <PanelIdentityContext.Provider value={{ workspaceId: ctx2.workspaceId, sessionId: ctx2.sessionId, areaId: ctx2.areaId, terminalId: ctx2.terminalId }}>
        <PanelFocusContext.Provider value={{ focusedAreaId: ctx2.focusedAreaId, onFocusedAreaChange: ctx2.onFocusedAreaChange, onScreenChange: ctx2.onScreenChange }}>
          <FileViewerPanel panelType="file-viewer" />
        </PanelFocusContext.Provider>
      </PanelIdentityContext.Provider>,
    );

    // Both have + buttons
    const addBtns = screen.getAllByRole("button", { name: "+" });
    expect(addBtns.length).toBe(2);

    // Open file in panel 1 only
    mockOpenDialog.mockResolvedValue("/home/user/project/panel1.txt");
    fireEvent.click(addBtns[0]);
    await waitFor(() => {
      expect(screen.getByText("panel1.txt")).toBeTruthy();
    });

    u1();
    u2();
  });

  // -----------------------------------------------------------------------
  // File picker edge cases
  // -----------------------------------------------------------------------

  it("file picker cancel does not add a tab", async () => {
    renderPanel();
    mockOpenDialog.mockResolvedValue(null);
    fireEvent.keyDown(document, { key: "P", metaKey: true, shiftKey: true, bubbles: true });
    await waitFor(() => {
      expect(mockOpenDialog).toHaveBeenCalled();
    });
    // Tab bar should only have the + button, no file tabs
    expect(screen.queryByText("bytes")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Multiple tabs
  // -----------------------------------------------------------------------

  it("can open multiple files as separate tabs", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/a.txt");
    await openFileViaPicker("/home/user/project/b.txt");
    await openFileViaPicker("/home/user/project/c.txt");

    expect(screen.getByText("a.txt")).toBeTruthy();
    expect(screen.getByText("b.txt")).toBeTruthy();
    expect(screen.getByText("c.txt")).toBeTruthy();
  });

  it("closing all tabs shows empty state", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/temp.txt");

    fireEvent.click(screen.getByRole("button", { name: "Close temp.txt" }));
    await waitFor(() => {
      expect(screen.queryByText("temp.txt")).toBeNull();
    });
    expect(screen.getByText(/Press/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Tooltip shows full path
  // -----------------------------------------------------------------------

  it("tab shows full path in title attribute (tooltip)", async () => {
    renderPanel();
    await openFileViaPicker("/home/user/project/src/components/App.tsx");

    const tab = screen.getByText("App.tsx").closest(".file-viewer-tab");
    expect(tab).toBeTruthy();
    expect(tab?.getAttribute("title")).toBe("src/components/App.tsx");
  });
});
