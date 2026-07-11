import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SegmentedControl } from "./SegmentedControl";

const OPTIONS = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
] as const;

describe("SegmentedControl", () => {
  it("renders all options", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} ariaLabel="Test" />);
    expect(screen.getByText("Option A")).toBeDefined();
    expect(screen.getByText("Option B")).toBeDefined();
    expect(screen.getByText("Option C")).toBeDefined();
  });

  it("marks active option", () => {
    render(<SegmentedControl options={OPTIONS} value="b" onChange={() => {}} ariaLabel="Test" />);
    const options = screen.getAllByRole("radio");
    expect(options[0]).toHaveAttribute("aria-checked", "false");
    expect(options[1]).toHaveAttribute("aria-checked", "true");
    expect(options[2]).toHaveAttribute("aria-checked", "false");
  });

  it("calls onChange when clicking an option", () => {
    const fn = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={fn} ariaLabel="Test" />);
    fireEvent.click(screen.getByText("Option B"));
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("does not call onChange when disabled", () => {
    const fn = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={fn} ariaLabel="Test" disabled />);
    fireEvent.click(screen.getByText("Option B"));
    expect(fn).not.toHaveBeenCalled();
  });

  it("calls onChange on Enter key", () => {
    const fn = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={fn} ariaLabel="Test" />);
    fireEvent.keyDown(screen.getByText("Option B"), { key: "Enter" });
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("calls onChange on Space key", () => {
    const fn = vi.fn();
    render(<SegmentedControl options={OPTIONS} value="a" onChange={fn} ariaLabel="Test" />);
    fireEvent.keyDown(screen.getByText("Option B"), { key: " " });
    expect(fn).toHaveBeenCalledWith("b");
  });

  it("sets aria-label on the group", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} ariaLabel="Select fruit" />);
    expect(screen.getByRole("radiogroup")).toHaveAttribute("aria-label", "Select fruit");
  });

  it("renders pill element", () => {
    render(<SegmentedControl options={OPTIONS} value="a" onChange={() => {}} ariaLabel="Test" />);
    expect(document.querySelector(".ui-segmented-control__pill")).toBeDefined();
  });
});
