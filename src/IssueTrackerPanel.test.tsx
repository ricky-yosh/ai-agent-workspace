import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PanelIdentityContext, PanelFocusContext, type PanelContextType } from "./PanelContext";

// ── Mocks for Tauri-coupled modules ──────────────────────────
const sampleIssues = [
  { id: "id0", session_id: "s1", number: 1, title: "First issue", body: "Body of first\n\nmore text", state: "open", labels: ["ready-for-agent"], author: "a", created_at: "", updated_at: "" },
  { id: "id1", session_id: "s1", number: 2, title: "Second issue", body: "Body of second", state: "open", labels: [], author: "a", created_at: "", updated_at: "" },
];

vi.mock("./safeInvoke", () => ({
  safeInvoke: vi.fn((cmd: string) => {
    if (cmd === "list_change_events") return Promise.resolve([]);
    return Promise.resolve(sampleIssues);
  }),
}));

vi.mock("./hooks/useTauriEvent", () => ({
  useTauriEvent: () => {},
}));

// react-markdown / remark-gfm are ESM-heavy; stub them
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

// motion/react uses Web APIs not available in jsdom; pass through as-is.
// motion.div renders as a transparent wrapper that forwards all props.
vi.mock("motion/react", () => {
  function MotionDiv({ initial, animate, exit, transition, layout, whileHover, whileTap, whileFocus, whileInView, onAnimationComplete, onUpdate, children, ...rest }: Record<string, unknown>) {
    return <div {...rest}>{children as React.ReactNode}</div>;
  }
  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import IssueTrackerPanel from "./IssueTrackerPanel";

const ctx: PanelContextType = {
  workspaceId: "w1",
  sessionId: "s1",
  areaId: "area1",
  terminalId: null,
  focusedAreaId: "area1",
  onFocusedAreaChange: () => {},
  onScreenChange: () => {},
};

function renderPanel() {
  return render(
    <PanelIdentityContext.Provider value={ctx}>
      <PanelFocusContext.Provider value={ctx}>
        <IssueTrackerPanel panelType="issue-tracker" />
      </PanelFocusContext.Provider>
    </PanelIdentityContext.Provider>,
  );
}

describe("IssueTrackerPanel keyboard expand/collapse", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ArrowRight expands and ArrowLeft collapses the focused row", async () => {
    const user = userEvent.setup();
    renderPanel();

    // wait for async issue load
    const firstRow = await screen.findByText("First issue");
    const row0 = firstRow.closest(".issue-row") as HTMLElement;
    const body0 = row0.parentElement!.querySelector(".issue-body") as HTMLElement;

    // focus the row
    act(() => row0.focus());

    expect(body0.className).not.toContain("expanded");

    await user.keyboard("{ArrowRight}");
    expect(body0.className, "ArrowRight should expand").toContain("expanded");

    // The focused row must keep DOM focus after expanding, otherwise the next
    // keypress is dispatched to <body> and never reaches the handler.
    expect(document.activeElement, "row keeps focus after expand").toBe(row0);

    await user.keyboard("{ArrowLeft}");
    expect(body0.className, "ArrowLeft should collapse").not.toContain("expanded");
  });

  it("click expands and collapses the row inline (Enter now opens the modal)", async () => {
    const user = userEvent.setup();
    renderPanel();

    const firstRow = await screen.findByText("First issue");
    const row0 = firstRow.closest(".issue-row") as HTMLElement;
    const body0 = row0.parentElement!.querySelector(".issue-body") as HTMLElement;

    await user.click(row0);
    expect(body0.className, "click should expand the row").toContain("expanded");

    await user.click(row0);
    expect(body0.className, "second click should collapse").not.toContain("expanded");
  });

  it("does not trigger row typeahead while typing in the filter input", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("First issue");
    const filter = screen.getByPlaceholderText("Filter issues… (press /)") as HTMLInputElement;

    // 'x' would typeahead-jump to a row if it leaked to the panel handler.
    await user.type(filter, "x");

    expect(filter.value).toBe("x");
    expect(document.activeElement).toBe(filter);
  });

  it("ArrowDown moves focus to the next row", async () => {
    const user = userEvent.setup();
    renderPanel();

    const firstRow = await screen.findByText("First issue");
    const row0 = firstRow.closest(".issue-row") as HTMLElement;
    const row1 = (screen.getByText("Second issue").closest(".issue-row")) as HTMLElement;

    act(() => row0.focus());
    await user.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(row1);
  });

  it("ArrowUp at first row focuses the filter input", async () => {
    const user = userEvent.setup();
    renderPanel();

    const firstRow = await screen.findByText("First issue");
    const row0 = firstRow.closest(".issue-row") as HTMLElement;
    const filter = screen.getByPlaceholderText("Filter issues… (press /)") as HTMLInputElement;

    act(() => row0.focus());
    await user.keyboard("{ArrowUp}");

    expect(document.activeElement).toBe(filter);
  });

  it("ArrowUp from filter input focuses the last row", async () => {
    const user = userEvent.setup();
    renderPanel();

    await screen.findByText("First issue");
    const row1 = screen.getByText("Second issue").closest(".issue-row") as HTMLElement;
    const filter = screen.getByPlaceholderText("Filter issues… (press /)") as HTMLInputElement;

    act(() => filter.focus());
    await user.keyboard("{ArrowUp}");

    expect(document.activeElement).toBe(row1);
  });

  it("does not steal row focus when the mount focus frame fires late", async () => {
    const rafCallbacks: FrameRequestCallback[] = [];
    const rafSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      rafCallbacks.push(cb);
      return rafCallbacks.length;
    });
    try {
      renderPanel();
      const firstRow = await screen.findByText("First issue");
      const row0 = firstRow.closest(".issue-row") as HTMLElement;

      act(() => row0.focus());
      act(() => {
        rafCallbacks.forEach((cb) => cb(0));
      });

      expect(document.activeElement).toBe(row0);
    } finally {
      rafSpy.mockRestore();
    }
  });
});

describe("IssueTrackerPanel modal triggers", () => {
  beforeEach(() => vi.clearAllMocks());

  it("Enter on a focused row opens the Issue Detail Modal in read mode", async () => {
    const user = userEvent.setup();
    renderPanel();

    const firstRow = await screen.findByText("First issue");
    const row0 = firstRow.closest(".issue-row") as HTMLElement;

    act(() => row0.focus());
    await user.keyboard("{Enter}");

    // The modal should open with the issue number in its header
    expect(screen.getByText("Issue #1")).toBeDefined();
    // And the modal should be in read mode (Edit button present)
    expect(screen.getByText("Edit")).toBeDefined();
  });

  it("right-click on a row opens the Issue Detail Modal in read mode", async () => {
    const user = userEvent.setup();
    renderPanel();

    const firstRow = await screen.findByText("First issue");
    const row0 = firstRow.closest(".issue-row") as HTMLElement;

    await user.pointer({ target: row0, keys: "[MouseRight]" });

    // The modal should open in read mode
    expect(screen.getByText("Issue #1")).toBeDefined();
    expect(screen.getByText("Edit")).toBeDefined();
  });

  it("pressing e on a focused row does NOT open the modal (list-level e shortcut removed)", async () => {
    const user = userEvent.setup();
    renderPanel();

    const firstRow = await screen.findByText("First issue");
    const row0 = firstRow.closest(".issue-row") as HTMLElement;

    act(() => row0.focus());

    // Press 'e' — previously this opened the editor; now it does nothing
    await user.keyboard("e");

    // The modal should NOT be open
    expect(screen.queryByText("Issue #1")).toBeNull();
    // The row should still be visible (not replaced by modal)
    expect(screen.getByText("First issue")).toBeDefined();
  });
});
