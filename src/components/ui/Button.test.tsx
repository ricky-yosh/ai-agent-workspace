import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "./Button";

describe("Button", () => {
  beforeEach(() => {
    document.documentElement.dataset.motion = "full";
  });

  it("renders children text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByText("Click me")).toBeInTheDocument();
  });

  it("renders primary variant class by default", () => {
    render(<Button>Primary</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("ui-button--primary");
  });

  it("renders secondary variant class", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("ui-button--secondary");
  });

  it("renders danger variant class", () => {
    render(<Button variant="danger">Danger</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("ui-button--danger");
  });

  it("renders ghost variant class", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("ui-button--ghost");
  });

  it("renders sm size class", () => {
    render(<Button size="sm">Small</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("ui-button--sm");
  });

  it("renders md size class by default", () => {
    render(<Button>Medium</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveClass("ui-button--md");
  });

  it("calls onClick when clicked", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("does not call onClick when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("does not call onClick when loading", async () => {
    const onClick = vi.fn();
    render(<Button loading onClick={onClick}>Click</Button>);
    await userEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders spinner element when loading", () => {
    render(<Button loading>Loading</Button>);
    const spinner = document.querySelector(".ui-button__spinner");
    expect(spinner).toBeInTheDocument();
  });

  it("does not render spinner when not loading", () => {
    render(<Button>Normal</Button>);
    const spinner = document.querySelector(".ui-button__spinner");
    expect(spinner).not.toBeInTheDocument();
  });

  it("forwards ref to button element", () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(
      <Button ref={(el) => { ref.current = el; }}>Ref test</Button>
    );
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
    expect(ref.current?.tagName).toBe("BUTTON");
  });

  it("has disabled attribute when disabled", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("has disabled attribute when loading", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
