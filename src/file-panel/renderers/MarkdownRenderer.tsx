import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ComponentProps } from "react";

interface MarkdownRendererProps {
  content: string;
}

/**
 * Renders a markdown string as formatted HTML with GFM support (tables,
 * task lists, strikethrough). Code blocks receive basic syntax styling
 * via CSS classes — full Shiki highlighting is deferred to issue #4.
 */
export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  return (
    <div className="file-viewer-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={markdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styled component overrides
// ---------------------------------------------------------------------------

const markdownComponents: ComponentProps<typeof ReactMarkdown>["components"] = {
  h1: ({ children }) => (
    <h1 style={{ fontSize: 20, fontWeight: 600, margin: "16px 0 8px", borderBottom: "1px solid var(--border)", paddingBottom: 6 }}>
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 style={{ fontSize: 17, fontWeight: 600, margin: "14px 0 6px", borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 style={{ fontSize: 15, fontWeight: 600, margin: "12px 0 4px" }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{ fontSize: 14, fontWeight: 600, margin: "10px 0 4px" }}>{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 4px" }}>{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 style={{ fontSize: 13, fontWeight: 600, margin: "8px 0 4px", color: "var(--text-muted)" }}>{children}</h6>
  ),
  p: ({ children }) => <p style={{ margin: "6px 0", lineHeight: 1.6 }}>{children}</p>,
  a: ({ children, href }) => (
    <a href={href} style={{ color: "#60a5fa", textDecoration: "none" }} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{ borderLeft: "3px solid var(--border)", margin: "6px 0", paddingLeft: 12, color: "var(--text-muted)" }}>
      {children}
    </blockquote>
  ),
  ul: ({ children }) => <ul style={{ paddingLeft: 22, margin: "6px 0" }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ paddingLeft: 22, margin: "6px 0" }}>{children}</ol>,
  li: ({ children }) => <li style={{ margin: "2px 0", lineHeight: 1.5 }}>{children}</li>,
  hr: () => (
    <hr style={{ border: "none", borderTop: "1px solid var(--border)", margin: "12px 0" }} />
  ),
  table: ({ children }) => (
    <div style={{ overflowX: "auto", margin: "8px 0" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ borderBottom: "2px solid var(--border)" }}>{children}</thead>,
  th: ({ children }) => (
    <th style={{ textAlign: "left", padding: "6px 10px", fontWeight: 600, whiteSpace: "nowrap" }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{ padding: "6px 10px", borderTop: "1px solid var(--border)" }}>{children}</td>
  ),
  code: ({ className, children, ...rest }: React.HTMLAttributes<HTMLElement> & { className?: string; children?: React.ReactNode }) => {
    const isBlock = Boolean(className?.includes("language-"));
    if (isBlock) {
      return (
        <code
          className={`file-viewer-code-block${className ? ` ${className}` : ""}`}
          style={{
            display: "block",
            background: "rgba(0, 0, 0, 0.3)",
            borderRadius: 6,
            padding: 12,
            overflowX: "auto",
            fontSize: 12,
            lineHeight: 1.5,
            fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
            tabSize: 4,
          }}
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          background: "rgba(255, 255, 255, 0.08)",
          borderRadius: 3,
          padding: "1px 5px",
          fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
          fontSize: "0.9em",
        }}
        {...rest}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre style={{ margin: "8px 0", padding: 0, background: "transparent" }}>
      {children}
    </pre>
  ),
  input: ({ checked, ...rest }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      disabled
      checked={checked ?? false}
      onChange={() => {}}
      style={{ accentColor: "#4ade80", cursor: "default", marginRight: 4 }}
      {...rest}
    />
  ),
  del: ({ children }) => (
    <del style={{ color: "var(--text-muted)" }}>{children}</del>
  ),
};

export default MarkdownRenderer;
