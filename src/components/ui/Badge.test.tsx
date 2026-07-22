import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Label</Badge>);
    expect(screen.getByText("Label")).toBeInTheDocument();
  });

  it("renders default variant class by default", () => {
    render(<Badge>Default</Badge>);
    const badge = screen.getByText("Default");
    expect(badge).toHaveClass("ui-badge--default");
  });

  it("renders success variant class", () => {
    render(<Badge variant="success">Success</Badge>);
    const badge = screen.getByText("Success");
    expect(badge).toHaveClass("ui-badge--success");
  });

  it("renders warning variant class", () => {
    render(<Badge variant="warning">Warning</Badge>);
    const badge = screen.getByText("Warning");
    expect(badge).toHaveClass("ui-badge--warning");
  });

  it("renders danger variant class", () => {
    render(<Badge variant="danger">Danger</Badge>);
    const badge = screen.getByText("Danger");
    expect(badge).toHaveClass("ui-badge--danger");
  });

  it("renders info variant class", () => {
    render(<Badge variant="info">Info</Badge>);
    const badge = screen.getByText("Info");
    expect(badge).toHaveClass("ui-badge--info");
  });

  it("renders sm size class", () => {
    render(<Badge size="sm">Small</Badge>);
    const badge = screen.getByText("Small");
    expect(badge).toHaveClass("ui-badge--sm");
  });

  it("renders md size class by default", () => {
    render(<Badge>Medium</Badge>);
    const badge = screen.getByText("Medium");
    expect(badge).toHaveClass("ui-badge--md");
  });

  it("applies inline style passthrough for custom colors", () => {
    render(<Badge style={{ background: "red", color: "white" }}>Custom</Badge>);
    const badge = screen.getByText("Custom");
    expect(badge).toHaveStyle({ background: "red", color: "rgb(255, 255, 255)" });
  });
});
