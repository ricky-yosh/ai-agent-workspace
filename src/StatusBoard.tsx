import { useState, useEffect, useCallback } from "react";
import { RefreshCw, Copy, Check, X, Plus } from "lucide-react";
import { safeInvoke } from "./safeInvoke";
import { useSessions } from "./SessionContext";
import type { BinaryStatus } from "./types/status-board";
import "./StatusBoard.css";

export default function StatusBoard() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BinaryStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(() => {
    setLoading(true);
    setError(null);
    setData(null);
    console.log("[StatusBoard] checking MCP binary…");
    safeInvoke<BinaryStatus>("check_mcp_binary", undefined, (msg) => {
      console.error("[StatusBoard] MCP binary check failed:", msg);
      setError(msg);
    })
      .then((status) => {
        console.log("[StatusBoard] MCP binary status:", status);
        setData(status);
      })
      .catch(() => {
        /* onError callback already handled in safeInvoke */
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  /* ---------- agent config & state ---------- */

  const AGENTS = [
    {
      id: "claude-code",
      label: "Claude Code",
      methodHint: "Run in your terminal:",
      buildSnippet(path: string) {
        return `claude mcp add aiaws -- "${path}"`;
      },
    },
    {
      id: "codex",
      label: "Codex",
      methodHint: "Run in your terminal:",
      buildSnippet(path: string) {
        return `codex mcp add aiaws -- "${path}"`;
      },
    },
    {
      id: "opencode",
      label: "opencode",
      methodHint: "Add to your opencode.json:",
      buildSnippet(path: string) {
        return JSON.stringify(
          {
            mcp: {
              aiaws: {
                type: "local",
                command: [path],
                enabled: true,
              },
            },
          },
          null,
          2,
        );
      },
    },
  ] as const;

  const [selectedAgent, setSelectedAgent] = useState("claude-code");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  /* Reset copy state when agent selection changes */
  useEffect(() => {
    setCopyState("idle");
  }, [selectedAgent]);

  const currentAgent = AGENTS.find((a) => a.id === selectedAgent) ?? AGENTS[0];
  const snippetPath = data?.path ?? "<binary path>";
  const snippet = currentAgent.buildSnippet(snippetPath);
  const copyLabel =
    copyState === "copied"
      ? "Copied"
      : copyState === "failed"
        ? "Copy failed"
        : "Copy";

  async function handleCopy() {
    if (!data) return;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 1500);
  }

  /* ---------- sessions & folder-picker ---------- */

  const { setShowNewSessionDialog } = useSessions();

  /* ---------- derive display state ---------- */

  let dotClass = "status-dot-missing";
  let statusText = "Not found";
  let showPath = false;

  if (loading) {
    statusText = "Checking…";
  } else if (error) {
    statusText = error;
  } else if (data) {
    if (data.present && data.executable) {
      dotClass = "status-dot-running";
      statusText = "Ready";
    } else if (!data.present) {
      statusText = "Not found";
      showPath = true;
    } else {
      /* present && !executable */
      statusText = "Not executable";
      showPath = true;
    }
  }

  return (
    <div className="status-board">
      <h1 className="status-board-title">Workspace status</h1>

      {/* ── MCP server card ── */}
      <div className="status-card">
        <div className="status-card-left">
          <span className={`status-dot ${dotClass}`} aria-hidden="true" />
          <div className="status-card-info">
            <span className="status-card-label">MCP server</span>
            <span className="status-card-status">{statusText}</span>
          </div>
        </div>
        <div className="status-card-right">
          {!loading && (
            <button className="status-card-action" onClick={check} title="Re-check">
              <RefreshCw size={14} />
            </button>
          )}
        </div>
      </div>

      {showPath && data && (
        <p className="status-path">{data.path}</p>
      )}

      {/* ── Connect your agent section ── */}
      <div className="status-section">
        <h2 className="status-section-heading">Connect your agent</h2>
        <p className="status-section-desc">
          Register this app's MCP server with your coding agent.
        </p>

        {/* Agent selector (segmented control) */}
        <div
          className="agent-selector"
          role="radiogroup"
          aria-label="Select agent"
        >
          {AGENTS.map((agent) => (
            <button
              key={agent.id}
              className={`agent-selector-btn${selectedAgent === agent.id ? " active" : ""}`}
              onClick={() => setSelectedAgent(agent.id)}
              role="radio"
              aria-checked={selectedAgent === agent.id}
            >
              {agent.label}
            </button>
          ))}
        </div>

        {/* Snippet area */}
        <div className="agent-snippet">
          <p className="agent-method-hint">{currentAgent.methodHint}</p>
          <div className="agent-snippet-codewrap">
            <pre className="agent-snippet-code">
              <code>{snippet}</code>
            </pre>
            <button
              className={`snippet-copy-btn${copyState === "copied" ? " copied" : ""}${copyState === "failed" ? " failed" : ""}`}
              onClick={handleCopy}
              disabled={!data}
              title={copyLabel}
              aria-label={copyLabel}
            >
              {copyState === "copied" ? (
                <Check size={14} />
              ) : copyState === "failed" ? (
                <X size={14} />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Start a session CTA ── */}
      <div className="status-section status-cta-section">
        <h2 className="status-section-heading">Start a session</h2>
        <p className="status-section-desc">
          Choose a project folder and give your session a name.
        </p>
        <button
          className="status-cta-button"
          onClick={() => setShowNewSessionDialog(true)}
        >
          <Plus size={16} />
          New session
        </button>
      </div>
    </div>
  );
}
