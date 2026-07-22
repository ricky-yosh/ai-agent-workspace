import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";

// Mock shiki to avoid real highlighting in tests — we just need to verify
// the component renders plain text and attempts async highlighting.
vi.mock("shiki", () => {
  const mockHighlighter = {
    codeToHtml: vi.fn((code: string, _opts: { lang: string; theme: string }) => {
      return `<pre class="shiki"><code>${code}</code></pre>`;
    }),
  };

  return {
    createHighlighter: vi.fn(() => Promise.resolve(mockHighlighter)),
  };
});

import { CodeRenderer } from "./CodeRenderer";

// ---------------------------------------------------------------------------
// CodeRenderer — plain text fallback
// ---------------------------------------------------------------------------

describe("CodeRenderer — plain text rendering", () => {
  it("renders plain text immediately", async () => {
    await act(async () => {
      render(
        <CodeRenderer filePath="test.ts" content="const x = 1;" size={13} />,
      );
    });

    const pre = screen.getByText("const x = 1;");
    expect(pre.tagName).toBe("CODE");
    expect(pre.parentElement?.tagName).toBe("PRE");
  });

  it("sets data-file-path attribute", async () => {
    await act(async () => {
      render(
        <CodeRenderer filePath="src/main.py" content="print('hello')" />,
      );
    });

    const container = screen.getByText("print('hello')").closest("[data-file-path]");
    expect(container).toBeInTheDocument();
    expect(container).toHaveAttribute("data-file-path", "src/main.py");
  });

  it("sets data-language for known extensions", async () => {
    await act(async () => {
      render(
        <CodeRenderer filePath="test.ts" content="let x = 1;" />,
      );
    });

    const container = screen.getByText("let x = 1;").closest("[data-language]");
    expect(container).toHaveAttribute("data-language", "typescript");
  });

  it("sets data-language to plain for unknown extensions", async () => {
    await act(async () => {
      render(
        <CodeRenderer filePath="README" content="Hello world" />,
      );
    });

    const container = screen.getByText("Hello world").closest("[data-language]");
    expect(container).toHaveAttribute("data-language", "plain");
  });

  it("sets data-size when provided", async () => {
    await act(async () => {
      render(
        <CodeRenderer filePath="test.ts" content="let x = 1;" size={42} />,
      );
    });

    const container = screen.getByText("let x = 1;").closest("[data-size]");
    expect(container).toHaveAttribute("data-size", "42");
  });
});

// ---------------------------------------------------------------------------
// CodeRenderer — async highlighting
// ---------------------------------------------------------------------------

describe("CodeRenderer — async highlighting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upgrades to highlighted HTML asynchronously for known languages", async () => {
    await act(async () => {
      render(
        <CodeRenderer filePath="test.ts" content="const x = 1;" />,
      );
    });

    // Initially shows plain text
    expect(screen.getByText("const x = 1;")).toBeInTheDocument();

    // Wait for async highlighting to complete
    await waitFor(() => {
      const container = document.querySelector("[data-highlighting='true']");
      expect(container).toBeInTheDocument();
    });
  });

  it("does not attempt highlighting for unknown file types", async () => {
    await act(async () => {
      render(
        <CodeRenderer filePath="Makefile" content="all: build" />,
      );
    });

    const container = screen.getByText("all: build").closest("[data-highlighting]");
    expect(container).toHaveAttribute("data-highlighting", "false");
  });

  it("renders all content in code element", async () => {
    const longContent = "line 1\nline 2\nline 3\nline 4\nline 5";
    await act(async () => {
      render(
        <CodeRenderer filePath="test.py" content={longContent} />,
      );
    });

    // Use a function matcher since multiline text is normalized by getByText
    const codeEl = screen.getByText((content) => content.includes("line 1"));
    expect(codeEl).toBeInTheDocument();
    expect(codeEl.tagName).toBe("CODE");
  });
});
