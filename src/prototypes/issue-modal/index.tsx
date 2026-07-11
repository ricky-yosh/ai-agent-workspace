// PROTOTYPE — throwaway code exploring keyboard-first issue modal interactions.
// Question: "What should a keyboard-first issue creation/editing modal look like?"
// Variants switchable via the floating bar below.

import React, { useState, useEffect } from "react";
import { applyTheme, type ThemeName } from "../../themes";
import VariantA from "./VariantA";
import VariantB from "./VariantB";
import VariantC from "./VariantC";

const VARIANTS = ["A — Action Menu", "B — Command Line", "C — Composer"];

const STORAGE_KEY = "prototype_issue_modal_variant";

function getInitialVariant(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && VARIANTS.some((v) => v.startsWith(stored))) return stored;
  } catch {}
  return "A";
}

export default function IssueModalPrototype() {
  const [variant, setVariant] = useState(getInitialVariant);
  const [open, setOpen] = useState(false);
  const [isEdit, setIsEdit] = useState(false);

  // Ensure theme CSS variables are set (bypasses normal app init from main.tsx)
  useEffect(() => { try { applyTheme("dark" as ThemeName); } catch {} }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, variant); } catch {}
  }, [variant]);

  const currentIdx = VARIANTS.findIndex((v) => v.startsWith(variant));

  const comps: Record<string, (props: { open: boolean; onClose: () => void; isEdit: boolean }) => React.ReactElement> = {
    "A": VariantA,
    "B": VariantB,
    "C": VariantC,
  };

  const Comp = comps[variant] ?? VariantA;

  return (
    <div style={{ padding: 32, fontFamily: "system-ui, sans-serif", maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Issue Modal Prototype</h1>
      <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Exploring keyboard-first interactions for creating/editing issues.
        <br /><span style={{ color: "var(--text-dim)", fontSize: 11 }}>PROTOTYPE — throwaway code</span>
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <button onClick={() => { setOpen(true); setIsEdit(false); }}
          style={{ padding: "8px 16px", borderRadius: 6, background: "var(--accent)", color: "white", border: "none", cursor: "pointer", fontWeight: 500, fontSize: 13 }}>Open Create</button>
        <button onClick={() => { setOpen(true); setIsEdit(true); }}
          style={{ padding: "8px 16px", borderRadius: 6, background: "var(--bg-panel)", color: "var(--text-primary)", border: "1px solid var(--border)", cursor: "pointer", fontWeight: 500, fontSize: 13 }}>Open Edit (mock)</button>
      </div>

      <Comp open={open} onClose={() => setOpen(false)} isEdit={isEdit} />

      {/* Floating variant switcher */}
      <div style={{
        position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
        background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 8,
        padding: "6px 12px", display: "flex", alignItems: "center", gap: 8, zIndex: 9999,
        boxShadow: "0 4px 16px rgba(0,0,0,0.3)", fontSize: 12,
      }}>
        <button onClick={() => setVariant(v => {
          const idx = VARIANTS.findIndex(x => x.startsWith(v));
          return VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length][0];
        })} style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", padding: "2px 6px", fontSize: 16 }}>‹</button>
        <span style={{ fontWeight: 500, minWidth: 120, textAlign: "center" }}>{VARIANTS[currentIdx]}</span>
        <button onClick={() => setVariant(v => {
          const idx = VARIANTS.findIndex(x => x.startsWith(v));
          return VARIANTS[(idx + 1) % VARIANTS.length][0];
        })} style={{ background: "none", border: "none", color: "var(--text-primary)", cursor: "pointer", padding: "2px 6px", fontSize: 16 }}>›</button>
      </div>
    </div>
  );
}
