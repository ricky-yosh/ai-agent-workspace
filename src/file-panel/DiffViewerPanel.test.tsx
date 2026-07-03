import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PanelIdentityContext, PanelFocusContext, type PanelContextType } from "../PanelContext";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockSafeInvoke = vi.fn();
vi.mock("../safeInvoke", () => ({
  safeInvoke: (...args: unknown[]) => mockSafeInvoke(...args),
}));

const mockRegisterShowDiffHandler = vi.fn(() => () => {});
vi.mock("../panelActionBridge", () => ({
  registerShowDiffHandler: (...args: unknown[]) => mockRegisterShowDiffHandler(...args),
}));

const mockParseUnifiedDiff = vi.fn();
vi.mock("./renderers/DiffRenderer", () => ({
  parseUnifiedDiff: (...args: unknown[]) => mockParseUnifiedDiff(...args),
}));

const mockUseVirtualRows = vi.fn();
vi.mock("./virtualizer", () => ({
  useVirtualRows: (...args: unknown[]) => mockUseVirtualRows(...args),
}));

vi.mock("../panelRegistry", () => ({
  registerPanel: vi.fn(),
}));

import DiffViewerPanel from "./DiffViewerPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    <PanelIdentityContext.Provider
      value={{
        workspaceId: panelCtx.workspaceId,
        sessionId: panelCtx.sessionId,
        areaId: panelCtx.areaId,
        terminalId: panelCtx.terminalId,
      }}
    >
      <PanelFocusContext.Provider
        value={{
          focusedAreaId: panelCtx.focusedAreaId,
          onFocusedAreaChange: panelCtx.onFocusedAreaChange,
          onScreenChange: panelCtx.onScreenChange,
        }}
      >
        <DiffViewerPanel panelType="diff-viewer" />
      </PanelFocusContext.Provider>
    </PanelIdentityContext.Provider>,
  );
}

const SAMPLE_DIFF_FILES = [
  {
    filePath: "src/main.ts",
    lines: [
      { raw: "@@ -1,3 +1,4 @@" },
      { raw: " import { foo } from './foo';" },
      { raw: "+import { bar } from './bar';" },
      { raw: " console.log(foo);" },
      { raw: "+console.log(bar);" },
    ],
  },
];

function setupDefaultMocks(diffFiles: typeof SAMPLE_DIFF_FILES = SAMPLE_DIFF_FILES) {
  mockParseUnifiedDiff.mockReturnValue(diffFiles);

  mockUseVirtualRows.mockImplementation(({ rows }: { rows: string[] }) => ({
    visibleRows: rows.map((row: string, i: number) => ({ index: i, row })),
    totalHeight: rows.length * 20,
    scrollRef: { current: null },
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DiffViewerPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
    mockSafeInvoke.mockResolvedValue({ diff: "", staged: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it("shows loading state while fetching diff", async () => {
    // Make safeInvoke hang
    mockSafeInvoke.mockReturnValue(new Promise(() => {}));

    renderPanel();

    expect(screen.getByText("Loading diff…")).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  it("shows error message when diff fetch fails", async () => {
    mockSafeInvoke.mockRejectedValue("Not a git repository");

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("Not a git repository")).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Empty diff state
  // -----------------------------------------------------------------------

  it("shows empty state when there are no changes", async () => {
    mockSafeInvoke.mockResolvedValue({ diff: "", staged: false });
    mockParseUnifiedDiff.mockReturnValue([]);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("No changes to display.")).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Tab switching
  // -----------------------------------------------------------------------

  it("defaults to unstaged tab", async () => {
    renderPanel();

    expect(screen.getByText("Unstaged")).toBeTruthy();
    expect(screen.getByText("Staged")).toBeTruthy();

    // Initial fetch should be unstaged (staged=false)
    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith(
        "get_git_diff",
        expect.objectContaining({ staged: false }),
      );
    });
  });

  it("switches to staged tab on click", async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalled();
    });

    mockSafeInvoke.mockClear();
    fireEvent.click(screen.getByText("Staged"));

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith(
        "get_git_diff",
        expect.objectContaining({ staged: true }),
      );
    });
  });

  it("switches back to unstaged tab", async () => {
    renderPanel();

    // Switch to staged
    fireEvent.click(screen.getByText("Staged"));
    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenLastCalledWith(
        "get_git_diff",
        expect.objectContaining({ staged: true }),
      );
    });

    mockSafeInvoke.mockClear();
    // Switch back to unstaged
    fireEvent.click(screen.getByText("Unstaged"));

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledWith(
        "get_git_diff",
        expect.objectContaining({ staged: false }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Diff content rendering
  // -----------------------------------------------------------------------

  it("renders diff content when available", async () => {
    mockSafeInvoke.mockResolvedValue({
      diff: "diff --git a/src/main.ts b/src/main.ts\n+import { bar } from './bar';",
      staged: false,
    });

    renderPanel();

    await waitFor(() => {
      expect(screen.queryByText("Loading diff…")).toBeNull();
    });

    // Status bar should show line/file counts
    expect(screen.getByText(/lines/)).toBeTruthy();
    expect(screen.getByText(/file/)).toBeTruthy();
  });

  // -----------------------------------------------------------------------
  // Status bar
  // -----------------------------------------------------------------------

  it("shows status bar with line and file counts", async () => {
    mockSafeInvoke.mockResolvedValue({ diff: "", staged: false });
    mockParseUnifiedDiff.mockReturnValue([]);

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("0 lines")).toBeTruthy();
      expect(screen.getByText("0 files")).toBeTruthy();
    });
  });

  it("shows singular 'file' for single file diff", async () => {
    setupDefaultMocks([
      {
        filePath: "a.ts",
        lines: [{ raw: "@@ -1 +1 @@" }],
      },
    ]);
    mockSafeInvoke.mockResolvedValue({ diff: "some-diff", staged: false });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("1 file")).toBeTruthy();
    });
  });

  it("shows plural 'files' for multi-file diff", async () => {
    setupDefaultMocks([
      { filePath: "a.ts", lines: [{ raw: "@@ -1 +1 @@" }] },
      { filePath: "b.ts", lines: [{ raw: "@@ -1 +1 @@" }] },
    ]);
    mockSafeInvoke.mockResolvedValue({ diff: "some-diff", staged: false });

    renderPanel();

    await waitFor(() => {
      expect(screen.getByText("2 files")).toBeTruthy();
    });
  });

  // -----------------------------------------------------------------------
  // Refresh button
  // -----------------------------------------------------------------------

  it("refresh button re-fetches the diff", async () => {
    mockSafeInvoke.mockResolvedValue({ diff: "", staged: false });

    renderPanel();

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByTitle("Refresh"));

    await waitFor(() => {
      expect(mockSafeInvoke).toHaveBeenCalledTimes(2);
    });
  });
});
