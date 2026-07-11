import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Textarea } from "./Textarea";

describe("Textarea", () => {
  it("renders with placeholder", () => {
    render(<Textarea placeholder="Enter text" />);
    expect(screen.getByPlaceholderText("Enter text")).toBeDefined();
  });

  it("renders label", () => {
    render(<Textarea label="Description" />);
    expect(screen.getByText("Description")).toBeDefined();
  });

  it("calls onChange with new value", () => {
    const fn = vi.fn();
    render(<Textarea onChange={fn} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hello" } });
    expect(fn).toHaveBeenCalledWith("hello");
  });

  it("displays error message", () => {
    render(<Textarea error="Required" />);
    expect(screen.getByText("Required")).toBeDefined();
  });

  it("sets value from prop", () => {
    render(<Textarea value="test content" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toHaveValue("test content");
  });

  it("disables textarea when disabled", () => {
    render(<Textarea disabled />);
    expect(screen.getByRole("textbox")).toBeDisabled();
  });
});
