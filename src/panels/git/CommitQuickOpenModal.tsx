import React, { useState, useEffect, useCallback, useRef } from "react";

export interface CommitQuickMatch {
  sha: string;
  source: "sha" | "branch" | "tag";
  label: string;
  color: string;
  row: number;
}

interface CommitQuickOpenModalProps {
  matches: CommitQuickMatch[];
  onSelect: (match: CommitQuickMatch) => void;
  onClose: () => void;
}

export function CommitQuickOpenModal({ matches, onSelect, onClose }: CommitQuickOpenModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = query.trim()
    ? matches.filter((m) => {
        const q = query.toLowerCase();
        return (
          m.sha.toLowerCase().startsWith(q) ||
          m.label.toLowerCase().includes(q)
        );
      })
    : [];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
      }
    },
    [filtered, selectedIndex, onSelect, onClose],
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: "var(--z-context)",
        display: "flex",
        justifyContent: "center",
        paddingTop: "15vh",
        background: "rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480,
          maxHeight: "60vh",
          background: "var(--bg-primary)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          boxShadow: "0 8px 40px rgba(0,0,0,0.4)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* NOTE: commit search input not migrated to <Input> — Input primitive doesn't support forwardRef, needed for auto-focus on mount */}
        <input
          ref={inputRef}
          type="text"
          placeholder="Search by commit SHA, branch, or tag..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{
            padding: "12px 16px",
            border: "none",
            borderBottom: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text-primary)",
            fontSize: 14,
            fontFamily: "var(--font-family-sans)",
            outline: "none",
          }}
        />
        <div style={{ overflow: "auto", flex: 1 }}>
          {filtered.map((match, i) => (
            <div
              key={match.sha + match.source + match.label}
              onClick={() => onSelect(match)}
              onMouseEnter={() => setSelectedIndex(i)}
              style={{
                padding: "8px 16px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                background:
                  i === selectedIndex
                    ? "var(--accent-color, #3b82f6)22"
                    : "transparent",
              }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  background: match.color,
                  flexShrink: 0,
                }}
              />
              <code
                style={{
                  fontFamily: "var(--font-family-mono)",
                  fontSize: 12,
                  color: "var(--text-muted)",
                }}
              >
                {match.sha.slice(0, 7)}
              </code>
              <span
                style={{
                  fontSize: 12,
                  color: match.source === "sha" ? "var(--text-primary)" : "var(--text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {match.label}
              </span>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--text-muted)",
                  background: "var(--bg-input)",
                  padding: "1px 5px",
                  borderRadius: 3,
                }}
              >
                {match.source}
              </span>
            </div>
          ))}
          {query.trim() && filtered.length === 0 && (
            <div
              style={{
                padding: 16,
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 12,
              }}
            >
              No matching commits
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
