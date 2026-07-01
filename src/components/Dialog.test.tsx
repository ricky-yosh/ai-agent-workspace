import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Dialog } from "./Dialog";

vi.mock("../hooks/useClickOutside", () => ({
  useClickOutside: () => {},
}));

vi.mock("motion/react", () => {
  function MotionDiv({ initial, animate, exit, transition, whileHover, whileTap, whileFocus, whileInView, onAnimationComplete, onUpdate, children, ...rest }: Record<string, unknown>) {
    return <div {...rest}>{children as React.ReactNode}</div>;
  }
  return {
    motion: { div: MotionDiv },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

describe("Dialog", () => {
  beforeEach(() => {
    document.documentElement.dataset.motion = "full";
  });

  it("renders when open is true", () => {
    render(
      <Dialog open onClose={() => {}} title="Test Title">
        <p>Dialog content</p>
      </Dialog>
    );
    expect(screen.getByText("Test Title")).toBeInTheDocument();
    expect(screen.getByText("Dialog content")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <Dialog open={false} onClose={() => {}} title="Test Title">
        <p>Dialog content</p>
      </Dialog>
    );
    expect(screen.queryByText("Test Title")).not.toBeInTheDocument();
  });

  it("calls onClose when Escape is pressed", async () => {
    const onClose = vi.fn();
    render(
      <Dialog open onClose={onClose} title="Test Title">
        <p>Content</p>
      </Dialog>
    );
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("applies className to dialog", () => {
    render(
      <Dialog open onClose={() => {}} title="Title" className="custom-class">
        <p>Content</p>
      </Dialog>
    );
    const dialog = screen.getByText("Title").closest(".dialog");
    expect(dialog).toHaveClass("custom-class");
  });
});
