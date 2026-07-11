import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MenuItem } from "./MenuItem";

describe("MenuItem", () => {
  it("renders label", () => {
    render(<MenuItem label="Copy" />);
    expect(screen.getByText("Copy")).toBeDefined();
  });

  it("renders leading icon when not confirmed", () => {
    render(<MenuItem label="Copy" leading={<span data-testid="icon">+</span>} />);
    expect(screen.getByTestId("icon")).toBeDefined();
  });

  it("renders trailing content", () => {
    render(<MenuItem label="Copy" trailing={<span data-testid="kbd">↵</span>} />);
    expect(screen.getByTestId("kbd")).toBeDefined();
  });

  it("has active class when active", () => {
    render(<MenuItem label="Copy" active />);
    expect(screen.getByRole("listitem").className).toContain("ui-menu-item--active");
  });

  it("has confirmed class when confirmed", () => {
    render(<MenuItem label="Copy" confirmed />);
    expect(screen.getByRole("listitem").className).toContain("ui-menu-item--confirmed");
  });

  it("has destructive class when destructive", () => {
    render(<MenuItem label="Delete" destructive />);
    expect(screen.getByRole("listitem").className).toContain("ui-menu-item--destructive");
  });

  it("is disabled when confirmed", () => {
    render(<MenuItem label="Copy" confirmed />);
    expect(screen.getByRole("listitem")).toBeDisabled();
  });

  it("calls onClick when clicked", () => {
    const fn = vi.fn();
    render(<MenuItem label="Copy" onClick={fn} />);
    fireEvent.click(screen.getByRole("listitem"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onMouseEnter when hovered", () => {
    const fn = vi.fn();
    render(<MenuItem label="Copy" onMouseEnter={fn} />);
    fireEvent.mouseEnter(screen.getByRole("listitem"));
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("shows leading when not confirmed", () => {
    render(<MenuItem label="Copy" leading={<span data-testid="icon">+</span>} />);
    expect(screen.getByTestId("icon")).toBeDefined();
  });
});
