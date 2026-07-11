import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CopyButton } from "./CopyButton";

const writeTextMock = vi.fn();

Object.assign(navigator, {
  clipboard: { writeText: writeTextMock },
});

beforeEach(() => {
  vi.useFakeTimers();
  writeTextMock.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CopyButton", () => {
  it("renders with label", () => {
    render(<CopyButton text="test" label="Copy" />);
    expect(screen.getByText("Copy")).toBeDefined();
  });

  it("renders icon-only when no label", () => {
    render(<CopyButton text="test" />);
    expect(screen.queryByText("Copy")).toBeNull();
  });

  it("copies text on click", () => {
    writeTextMock.mockResolvedValue(undefined);
    render(<CopyButton text="hello" label="Copy" />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeTextMock).toHaveBeenCalledWith("hello");
  });

  it("shows Copied label after success", async () => {
    writeTextMock.mockResolvedValue(undefined);
    render(<CopyButton text="hello" label="Copy" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByText("Copied")).toBeDefined();
  });

  it("resets to idle after 1500ms", async () => {
    writeTextMock.mockResolvedValue(undefined);
    render(<CopyButton text="hello" label="Copy" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByText("Copied")).toBeDefined();
    act(() => vi.advanceTimersByTime(1500));
    expect(screen.getByText("Copy")).toBeDefined();
  });

  it("shows Failed when clipboard rejects", async () => {
    writeTextMock.mockRejectedValue(new Error("denied"));
    render(<CopyButton text="hello" label="Copy" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("does nothing when disabled", () => {
    render(<CopyButton text="hello" label="Copy" disabled />);
    fireEvent.click(screen.getByRole("button"));
    expect(writeTextMock).not.toHaveBeenCalled();
  });
});
