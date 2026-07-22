import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "./Input";

describe("Input", () => {
  beforeEach(() => {
    document.documentElement.dataset.motion = "full";
  });

  it("renders label text and label is associated with input", () => {
    render(<Input label="Username" />);
    const input = screen.getByLabelText("Username");
    expect(input).toBeInTheDocument();
  });

  it("applies error class and renders error message when error prop is set", () => {
    render(<Input error="This field is required" />);
    const wrapper = document.querySelector(".ui-input");
    expect(wrapper).toHaveClass("ui-input--error");
    expect(screen.getByText("This field is required")).toBeInTheDocument();
  });

  it("fires onChange with typed value", async () => {
    const onChange = vi.fn();
    render(<Input onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "hello");
    expect(onChange).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining("hello"));
  });

  it("renders leading and trailing icons", () => {
    render(
      <Input leadingIcon={<span data-testid="leading">L</span>} trailingIcon={<span data-testid="trailing">R</span>} />
    );
    expect(screen.getByTestId("leading")).toBeInTheDocument();
    expect(screen.getByTestId("trailing")).toBeInTheDocument();
  });

  it("prevents interaction when disabled", async () => {
    const onChange = vi.fn();
    render(<Input disabled onChange={onChange} />);
    const input = screen.getByRole("textbox");
    expect(input).toBeDisabled();
    await userEvent.type(input, "x");
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows placeholder text", () => {
    render(<Input placeholder="Enter name" />);
    expect(screen.getByPlaceholderText("Enter name")).toBeInTheDocument();
  });
});
