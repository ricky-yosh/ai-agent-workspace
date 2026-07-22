import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// Mock remark-gfm (no-op)
vi.mock("remark-gfm", () => ({ default: () => {} }));

/**
 * Mock react-markdown that delegates rendering to the component overrides
 * so we can verify they receive correct props (className for code blocks,
 * checked for checkboxes, etc.).
 */
vi.mock("react-markdown", () => ({
  default: ({ children, components }: { children: React.ReactNode; components?: Record<string, React.ComponentType<Record<string, unknown>>> }) => {
    const text = typeof children === "string" ? children : String(children);

    // Fenced code block: ```lang\n...\n```
    const codeBlockMatch = text.match(/^```(\w+)?\n([\s\S]*?)\n```$/);
    if (codeBlockMatch) {
      const lang = codeBlockMatch[1] || "";
      const code = codeBlockMatch[2];
      const Code = components?.code;
      const Pre = components?.pre;
      return (
        <div data-testid="markdown-output">
          {Pre ? (
            <Pre>
              {Code ? (
                <Code className={`language-${lang}`}>{code}</Code>
              ) : (
                <code className={`language-${lang}`}>{code}</code>
              )}
            </Pre>
          ) : (
            <pre>
              <code className={`language-${lang}`}>{code}</code>
            </pre>
          )}
        </div>
      );
    }

    // Task list items: lines starting with "- [x]" or "- [ ]"
    const lines = text.split("\n");
    const taskLines = lines.filter((l) => l.startsWith("- ["));
    if (taskLines.length > 0) {
      const Input = components?.input;
      return (
        <div data-testid="markdown-output">
          <ul>
            {taskLines.map((line, i) => {
              const checked = line.includes("[x]");
              const label = line.replace(/^- \[[ x]\] /, "");
              return (
                <li key={i}>
                  {Input ? (
                    <Input checked={checked} />
                  ) : (
                    <input type="checkbox" checked={checked} readOnly />
                  )}
                  {label}
                </li>
              );
            })}
          </ul>
        </div>
      );
    }

    // Strikethrough: ~~text~~
    if (text.startsWith("~~") && text.endsWith("~~") && text.length > 4) {
      const inner = text.slice(2, -2);
      const Del = components?.del;
      return (
        <div data-testid="markdown-output">
          {Del ? <Del>{inner}</Del> : <del>{inner}</del>}
        </div>
      );
    }

    // Link: [text](url)
    const linkMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const A = components?.a;
      return (
        <div data-testid="markdown-output">
          {A ? <A href={linkMatch[2]}>{linkMatch[1]}</A> : <a href={linkMatch[2]}>{linkMatch[1]}</a>}
        </div>
      );
    }

    // Inline code: `code`
    if (text.includes("`") && !text.startsWith("```")) {
      const Code = components?.code;
      const parts = text.split(/`([^`]+)`/);
      return (
        <div data-testid="markdown-output">
          {parts.map((part, i) => {
            if (i % 2 === 1) {
              return Code ? <Code key={i}>{part}</Code> : <code key={i}>{part}</code>;
            }
            return <React.Fragment key={i}>{part}</React.Fragment>;
          })}
        </div>
      );
    }

    // Default: render text as-is
    return <div data-testid="markdown-output">{text}</div>;
  },
}));

import { MarkdownRenderer } from "./MarkdownRenderer";

describe("MarkdownRenderer", () => {
  it("renders markdown content", () => {
    render(<MarkdownRenderer content="# Hello World" />);
    expect(screen.getByTestId("markdown-output")).toBeTruthy();
    expect(screen.getByText("# Hello World")).toBeTruthy();
  });

  it("renders empty content without crashing", () => {
    render(<MarkdownRenderer content="" />);
    expect(screen.getByTestId("markdown-output")).toBeTruthy();
  });

  it("renders code blocks with block-level code component", () => {
    render(<MarkdownRenderer content={"```typescript\nconst x = 1;\n```"} />);
    const codeEl = screen.getByText("const x = 1;");
    expect(codeEl).toBeTruthy();
    expect(codeEl.className).toContain("file-viewer-code-block");
  });

  it("renders inline code with inline code component", () => {
    render(<MarkdownRenderer content={"Use `npm install` to install."} />);
    const codeEl = screen.getByText("npm install");
    expect(codeEl).toBeTruthy();
    expect(codeEl.tagName).toBe("CODE");
    expect(codeEl.className).not.toContain("file-viewer-code-block");
  });

  it("renders GFM task list items with checkboxes", () => {
    render(<MarkdownRenderer content={"- [x] Done\n- [ ] Todo"} />);
    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(2);
    expect(checkboxes[0]).toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
  });

  it("renders strikethrough text", () => {
    render(<MarkdownRenderer content={"~~deleted~~"} />);
    const el = screen.getByText("deleted");
    expect(el.tagName).toBe("DEL");
  });

  it("renders links with target _blank", () => {
    render(<MarkdownRenderer content={"[click](https://example.com)"} />);
    const link = screen.getByText("click");
    expect(link.getAttribute("href")).toBe("https://example.com");
    expect(link.getAttribute("target")).toBe("_blank");
  });
});
