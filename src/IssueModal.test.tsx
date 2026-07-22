import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IssueModal from "./IssueModal";

// ── Mocks ────────────────────────────────────────────────────────

const mockSafeInvoke = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("./safeInvoke", () => ({
  safeInvoke: mockSafeInvoke,
}));

// react-markdown / remark-gfm are ESM-heavy; stub them
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
vi.mock("remark-gfm", () => ({ default: () => {} }));

// motion/react uses Web APIs not available in jsdom; pass through as-is.
vi.mock("motion/react", () => {
  function MotionDiv({ initial, animate, exit, transition, layout, whileHover, whileTap, whileFocus, whileInView, onAnimationComplete, onUpdate, children, ...rest }: Record<string, unknown>) {
    return <div {...rest}>{children as React.ReactNode}</div>;
  }
  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

// ── Fixtures ──────────────────────────────────────────────────────

const sampleIssue = {
  id: "id0",
  session_id: "s1",
  number: 1,
  title: "First issue",
  body: "Body of first\n\nmore text",
  state: "open",
  labels: ["ready-for-agent"],
  author: "ai",
  created_at: "2026-07-21T10:00:00Z",
  updated_at: "2026-07-21T12:00:00Z",
};

const sampleIssueClosed = {
  ...sampleIssue,
  number: 2,
  title: "Second issue",
  body: "Body of second",
  state: "closed",
  labels: ["wontfix"],
  created_at: "2026-07-20T08:00:00Z",
  updated_at: "2026-07-20T08:00:00Z",
};

// ── Helpers ───────────────────────────────────────────────────────

function renderModal(overrides: Record<string, unknown> = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    sessionId: "s1",
    ...overrides,
  };
  render(<IssueModal {...props} />);
  return { onClose: props.onClose as ReturnType<typeof vi.fn> };
}

// The Dialog uses requestAnimationFrame for entrance animation.
// Flush rAF and pending state updates before making assertions.
async function settleDialog() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// The Dialog div has tabIndex={-1} and calls .focus() after opening.
// In jsdom we must explicitly focus it so keyboard events reach the handler.
// Also call this after state transitions that unmount auto-focused inputs
// so the dialog regains focus.
async function focusDialog() {
  const dialog = await screen.findByRole("dialog");
  act(() => dialog.focus());
}

// ── Read/Edit Mode Tests ─────────────────────────────────────────

describe("IssueModal read/edit mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens in read mode for an existing issue and renders its content", async () => {
    const { onClose } = renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();

    // Header shows issue number
    expect(await screen.findByText("Issue #1")).toBeDefined();
    // State badge
    expect(screen.getByText("open")).toBeDefined();
    // Label in header
    expect(screen.getByText("ready-for-agent")).toBeDefined();
    // Title rendered as heading
    expect(screen.getByText("First issue")).toBeDefined();
    // Body rendered via IssueBody (multi-line, use regex)
    expect(screen.getByText(/Body of first/)).toBeDefined();
    // Author metadata
    expect(screen.getByText(/Author: ai/)).toBeDefined();

    // Edit button is present in read mode
    expect(screen.getByText("Edit")).toBeDefined();

    // Esc closes the modal
    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("e key toggles read → edit mode", async () => {
    const { onClose } = renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();
    await user.keyboard("e");

    // Edit mode: Done button replaces Edit button
    expect(screen.getByText("Done")).toBeDefined();

    // Esc from edit mode returns to read mode
    await user.keyboard("{Escape}");
    // Read mode shows Edit button
    expect(screen.getByText("Edit")).toBeDefined();
    expect(screen.queryByText("Done")).toBeNull();

    // Second Esc closes
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("header Edit button toggles read → edit mode", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();
    await user.click(screen.getByText("Edit"));

    // Edit mode — Done button visible
    expect(screen.getByText("Done")).toBeDefined();
  });

  it("Esc from sub-page returns to action list, not read mode", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();
    // Enter edit mode
    await user.keyboard("e");
    expect(await screen.findByText("Done")).toBeDefined();

    // Go into title sub-page (Enter on focused "Edit title" action)
    await user.keyboard("{Enter}");
    expect(screen.getByPlaceholderText("Brief description of the issue")).toBeDefined();

    // Sub-page input steals focus; refocus dialog for Esc to reach the handler
    await focusDialog();

    // Esc from sub-page → back to action list (edit mode)
    await user.keyboard("{Escape}");
    await settleDialog();
    // Done button still visible (still in edit mode)
    expect(screen.getByText("Done")).toBeDefined();
    // Sub-page input gone
    expect(screen.queryByPlaceholderText("Brief description of the issue")).toBeNull();
  });

  it("Styled Component Library Primitives rendered in read mode", async () => {
    renderModal({ issue: sampleIssueClosed });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #2")).toBeDefined();

    // State rendered as Badge
    const stateBadge = screen.getByText("closed");
    expect(stateBadge.className).toContain("ui-badge");

    // Header Edit button
    const editBtn = screen.getByText("Edit");
    expect(editBtn.className).toContain("ui-button");
  });

  it("Done button saves and returns to read mode (no close)", async () => {
    const { onClose } = renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();
    // Enter edit mode
    await user.keyboard("e");
    expect(await screen.findByText("Done")).toBeDefined();

    // Click Done button
    await user.click(screen.getByText("Done"));

    // update_issue called
    expect(mockSafeInvoke).toHaveBeenCalledWith("update_issue", expect.objectContaining({
      id: "id0",
      title: "First issue",
    }));

    // Modal stays open and returns to read mode
    expect(screen.getByText("Issue #1")).toBeDefined();
    expect(screen.getByText("Edit")).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Cmd+Enter saves and returns to read mode", async () => {
    const { onClose } = renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();
    // Enter edit mode
    await user.keyboard("e");
    expect(await screen.findByText("Done")).toBeDefined();

    // Cmd+Enter to save
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    // update_issue called
    expect(mockSafeInvoke).toHaveBeenCalledWith("update_issue", expect.objectContaining({
      id: "id0",
      title: "First issue",
    }));

    // Returns to read mode, not closed
    expect(screen.getByText("Issue #1")).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── State row tests ────────────────────────────────────────────

  it("State row renders in edit mode showing current → target state", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();

    const user = userEvent.setup();
    // Enter edit mode
    await user.keyboard("e");

    // State row shows "State: open → closed"
    expect(screen.getByText("State: open → closed")).toBeDefined();
  });

  it("State row shows closed → open for a closed issue", async () => {
    renderModal({ issue: sampleIssueClosed });
    await settleDialog();
    await focusDialog();

    const user = userEvent.setup();
    await user.keyboard("e");

    expect(screen.getByText("State: closed → open")).toBeDefined();
  });

  it("Toggling state row does not invoke update_issue (staged only)", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();

    const user = userEvent.setup();
    await user.keyboard("e");

    // Press S to toggle state
    await user.keyboard("S");

    // State flipped in display
    expect(screen.getByText("State: closed → open")).toBeDefined();

    // No update_issue called
    expect(mockSafeInvoke).not.toHaveBeenCalled();
  });

  it("Save includes flipped state in the update_issue payload together with title/body/labels", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();

    const user = userEvent.setup();
    await user.keyboard("e");

    // Flip state via keyboard shortcut
    await user.keyboard("S");

    // Save via Cmd+Enter
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    // update_issue called with flipped state plus the other fields
    expect(mockSafeInvoke).toHaveBeenCalledWith("update_issue", expect.objectContaining({
      id: "id0",
      title: "First issue",
      state: "closed",
    }));
  });

  it("Esc from edit mode discards staged state flip (re-entering edit mode shows original state)", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();

    const user = userEvent.setup();
    await user.keyboard("e");

    // Flip state
    await user.keyboard("S");
    expect(screen.getByText("State: closed → open")).toBeDefined();

    // Esc discards
    await user.keyboard("{Escape}");

    // Back in read mode — badge shows original "open"
    expect(screen.getByText("open")).toBeDefined();

    // Enter edit mode again — state shows original open → closed
    await user.keyboard("e");
    expect(screen.getByText("State: open → closed")).toBeDefined();
  });

  it("After save, read mode displays the new state", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();

    const user = userEvent.setup();
    await user.keyboard("e");

    // Flip state
    await user.keyboard("S");

    // Save with Done button
    await user.click(screen.getByText("Done"));

    // Read mode badge shows "closed"
    expect(screen.getByText("closed")).toBeDefined();
  });
});

// ── Create Mode Tests ────────────────────────────────────────────

describe("IssueModal create mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens directly in the action list (no read mode) when no issue is passed", async () => {
    renderModal({ issue: undefined });
    await settleDialog();
    await focusDialog();

    // Create mode shows create actions
    expect(await screen.findByText("Create issue")).toBeDefined();
    expect(screen.getByText("Set label")).toBeDefined();
    // Shows needs-triage as the default label
    expect(screen.getByText("needs-triage")).toBeDefined();
    // No "Save changes" (that's for existing issues only)
    expect(screen.queryByText("Save changes")).toBeNull();
    // No "Edit title" (that's for existing issues only)
    expect(screen.queryByText("Edit title")).toBeNull();
  });

  it("create mode shows no State row", async () => {
    renderModal({ issue: undefined });
    await settleDialog();
    await focusDialog();

    expect(await screen.findByText("Create issue")).toBeDefined();
    // State row should not appear in create mode
    expect(screen.queryByText(/State:/)).toBeNull();
    expect(screen.queryByText("State: open → closed")).toBeNull();
  });

  it("creating an issue calls create_issue and closes", async () => {
    const { onClose } = renderModal({ issue: undefined });
    await settleDialog();

    // Type a title via the keyboard shortcut (T → enter title sub-page → type → Enter)
    // This avoids possible timing issues with user.type on auto-focused inputs.
    const user = userEvent.setup({ delay: null });
    // Focus the dialog
    await focusDialog();
    expect(await screen.findByText("Set label")).toBeDefined();

    // Press "T" to trigger the "Set title" action via keyboard shortcut
    await user.keyboard("T");
    // Now in title sub-page; type the title using keyboard
    await user.keyboard("New test issue");
    // Wait for state to settle
    await settleDialog();
    await focusDialog();
    // Enter to commit
    await user.keyboard("{Enter}");

    // The title should now be set in the action list; click "Create issue" to submit
    await settleDialog();
    await user.click(screen.getByText("Create issue"));

    expect(mockSafeInvoke).toHaveBeenCalledWith("create_issue", expect.objectContaining({
      sessionId: "s1",
      title: "New test issue",
    }));

    // Create closes the modal
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// ── Esc Stacking Tests ──────────────────────────────────────────

describe("IssueModal Esc stacking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Esc from read mode closes the modal", async () => {
    const { onClose } = renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc from edit mode action list discards changes and returns to read", async () => {
    const { onClose } = renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();
    // Enter edit mode
    await user.keyboard("e");
    expect(await screen.findByText("Done")).toBeDefined();

    // Esc from edit mode → back to read
    await user.keyboard("{Escape}");
    expect(screen.getByText("Edit")).toBeDefined();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Esc pops one level at a time: sub-page → action list → read mode → close", async () => {
    const { onClose } = renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();

    // Level 1: read → edit
    await user.keyboard("e");
    expect(await screen.findByText("Done")).toBeDefined();

    // Level 2: action list → title sub-page
    await user.keyboard("{Enter}");
    expect(screen.getByPlaceholderText("Brief description of the issue")).toBeDefined();

    // Sub-page input stole focus; refocus dialog for Esc
    await focusDialog();

    // Pop: sub-page → action list
    await user.keyboard("{Escape}");
    expect(screen.getByText("Done")).toBeDefined();
    expect(screen.queryByPlaceholderText("Brief description of the issue")).toBeNull();

    // Pop: action list → read mode
    await user.keyboard("{Escape}");
    expect(screen.getByText("Edit")).toBeDefined();

    // Pop: read mode → close
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Esc from edit mode discards unsaved edits (no update_issue call)", async () => {
    renderModal({ issue: sampleIssue });
    await settleDialog();
    await focusDialog();
    expect(await screen.findByText("Issue #1")).toBeDefined();

    const user = userEvent.setup();

    // Enter edit mode and navigate to title sub-page
    await user.keyboard("e");
    expect(await screen.findByText("Done")).toBeDefined();
    await user.keyboard("{Enter}");

    // Modify the title draft
    const input = screen.getByPlaceholderText("Brief description of the issue");
    await user.clear(input);
    await user.type(input, "Modified title");

    // Commit the change (Enter in sub-page)
    // The auto-focused input has focus; Enter fires commitSubPage
    await user.keyboard("{Enter}");

    // After commit, the action list re-renders with "Modified title" shown
    // The dialog loses focus when the input unmounts; refocus for Esc
    await focusDialog();

    // Esc from edit mode — discards and returns to read
    await user.keyboard("{Escape}");

    // The title should revert to original in read mode
    expect(screen.getByText("First issue")).toBeDefined();

    // No update_issue was called
    expect(mockSafeInvoke).not.toHaveBeenCalledWith(
      "update_issue",
      expect.anything(),
    );
  });
});
