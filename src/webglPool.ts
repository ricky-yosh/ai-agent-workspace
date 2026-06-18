import { Terminal } from "@xterm/xterm";
import { WebglAddon } from "@xterm/addon-webgl";

/**
 * Bounded WebGL renderer pool.
 *
 * WHY THIS EXISTS
 * ---------------
 * xterm's `WebglAddon` allocates a real GPU WebGL context per terminal. Browsers
 * (WebKit / Chromium) cap the number of simultaneous live WebGL contexts at ~16;
 * past that, `new WebglAddon()` throws or the oldest context gets force-lost,
 * which under context-loss thrash used to drive the old code into an infinite
 * re-creation loop and crash the app.
 *
 * This module caps how many terminals have a WebGL addon attached AT ONCE
 * (MAX_WEBGL_CONTEXTS), independently of how many `Terminal` instances are alive.
 * The Terminal objects themselves are still cached forever in TerminalPanel's
 * `terminalCache` (that's what survives transient React unmounts and prevents
 * output loss) — this pool only governs the GPU-renderer layer bolted onto them.
 *
 * When a terminal has no WebGL addon attached, xterm transparently falls back to
 * its built-in DOM renderer: slower, but it never touches the GPU and so can
 * never exhaust contexts or crash. DOM is the chosen fallback tier (no
 * `@xterm/addon-canvas`) — see the task notes; it needs no lifecycle of its own.
 */

// Cap on simultaneously-attached WebGL contexts. Kept well under the browser's
// ~16 hard limit so headroom remains for context-loss recovery churn.
const MAX_WEBGL_CONTEXTS = 4;

// After a terminal is hidden we keep its WebGL addon alive this long, so a quick
// revisit (tab flick back and forth) reuses the existing renderer instead of
// paying a re-allocation. Past the grace period the context is freed.
const WEBGL_REAP_GRACE_MS = 30_000;

// WebKit/Chromium can transiently lose a context on sleep/wake or GPU reset.
// We wait out that reset window before a single re-attach attempt, so we don't
// race the browser and immediately lose the new context too.
const WEBGL_RECOVERY_DELAY_MS = 250;

interface PoolEntry {
  terminal: Terminal;
  // The currently-attached addon, or null when this terminal is on the DOM
  // renderer. This is the SINGLE source of truth for WebGL state — the Terminal
  // cache deliberately holds no addon reference anymore (lifecycle decoupling).
  webglAddon: WebglAddon | null;
  // Canvas elements the addon injected into the terminal DOM, captured at attach
  // time so we can explicitly release their GPU contexts on teardown.
  webglCanvases: HTMLCanvasElement[];
  // Whether the terminal is currently revealed. Drives eviction eligibility:
  // only hidden terminals may have their WebGL addon evicted to make room.
  visible: boolean;
  // For LRU eviction — bumped every time the terminal is requested/used.
  lastUsedAt: number;
  // Pending idle-reap disposal, cancelled if the terminal is revisited.
  reapTimer: ReturnType<typeof setTimeout> | null;
}

// Module-level singleton, keyed by the same terminalId the cache uses.
const entries = new Map<string, PoolEntry>();

function ensureEntry(terminalId: string, terminal: Terminal): PoolEntry {
  let entry = entries.get(terminalId);
  if (!entry) {
    entry = {
      terminal,
      webglAddon: null,
      webglCanvases: [],
      visible: false,
      lastUsedAt: performance.now(),
      reapTimer: null,
    };
    entries.set(terminalId, entry);
  } else {
    // Defensive: a cache rebuild could hand us a fresh Terminal under the same
    // id. Keep the entry pointing at the live one.
    entry.terminal = terminal;
  }
  return entry;
}

function attachedCount(): number {
  let n = 0;
  for (const e of entries.values()) if (e.webglAddon) n++;
  return n;
}

function cancelReap(entry: PoolEntry): void {
  if (entry.reapTimer !== null) {
    clearTimeout(entry.reapTimer);
    entry.reapTimer = null;
  }
}

/**
 * Request that the given terminal render via WebGL.
 *
 * - If it already has WebGL, this is a cheap "still in use" ping: cancel any
 *   pending reap, mark visible, bump LRU, done.
 * - If the pool has room, attach a new addon.
 * - If the pool is full, try to evict the least-recently-used HIDDEN attached
 *   terminal and take its slot. If every attached terminal is visible, give up
 *   gracefully — the requester just runs on the DOM renderer (no crash).
 *
 * Must be called AFTER the terminal has been `open()`ed (so `terminal.element`
 * exists), otherwise there's no DOM for xterm to mount the WebGL canvas into.
 */
export function requestWebgl(terminalId: string, terminal: Terminal): void {
  const entry = ensureEntry(terminalId, terminal);
  entry.visible = true;
  entry.lastUsedAt = performance.now();
  cancelReap(entry);

  // Already attached — nothing to allocate, just keep it alive.
  if (entry.webglAddon) return;

  // Can't attach without a mounted terminal element.
  if (!terminal.element) return;

  if (attachedCount() >= MAX_WEBGL_CONTEXTS) {
    // Pool full: find the least-recently-used attached terminal that is NOT
    // visible. Visible terminals are off-limits — evicting one would drop a
    // user-facing renderer mid-view.
    let victim: PoolEntry | null = null;
    for (const e of entries.values()) {
      if (!e.webglAddon || e.visible) continue;
      if (!victim || e.lastUsedAt < victim.lastUsedAt) victim = e;
    }
    if (!victim) {
      // All attached contexts belong to visible terminals. Degrade gracefully:
      // the requester stays on DOM. It will get a real GPU context next time a
      // slot frees up (hide/reap of another terminal triggers no auto-attach,
      // but the next reveal of this terminal will retry).
      return;
    }
    disposeEntryWebgl(victim);
  }

  attach(terminalId, entry);
}

/**
 * Build and load a fresh WebGL addon for an entry, capturing the canvases it
 * creates and wiring context-loss recovery. Bails quietly if WebGL can't be
 * constructed (e.g. genuine exhaustion despite our cap) — DOM fallback covers it.
 */
function attach(terminalId: string, entry: PoolEntry): void {
  const terminal = entry.terminal;
  if (!terminal.element) return;

  // Snapshot the canvases that already exist so we can diff and learn which ones
  // the addon adds (those are the GPU-backed canvases we must release later).
  const elem = terminal.element;
  const before = new Set<HTMLCanvasElement>(
    elem.querySelectorAll<HTMLCanvasElement>("canvas"),
  );

  let addon: WebglAddon;
  try {
    addon = new WebglAddon();
  } catch (e) {
    // Genuine context exhaustion or unsupported GPU — stay on DOM, never crash.
    console.warn("[webgl-pool] WebglAddon unavailable, using DOM renderer:", e);
    return;
  }

  // Context-loss recovery. The OLD code re-created an addon synchronously and
  // unconditionally here, which under exhaustion looped and crashed. Instead:
  // dispose the lost addon, drop our reference, then ONCE after a delay attempt
  // a single re-attach — and only if it still makes sense to.
  addon.onContextLoss(() => {
    const cur = entries.get(terminalId);
    if (cur && cur.webglAddon === addon) {
      cur.webglAddon = null;
      cur.webglCanvases = [];
    }
    try {
      addon.dispose();
    } catch {
      // addon may already be partway torn down
    }
    setTimeout(() => {
      const e = entries.get(terminalId);
      if (!e) return;
      // Re-attach only if still wanted, still detached, and the pool has room.
      // Never synchronous, never a loop.
      if (e.webglAddon || !e.visible) return;
      if (attachedCount() >= MAX_WEBGL_CONTEXTS) return;
      attach(terminalId, e);
      if (e.webglAddon) {
        try {
          e.terminal.refresh(0, e.terminal.rows - 1);
        } catch {
          // refresh can throw if the terminal is mid-teardown
        }
      }
    }, WEBGL_RECOVERY_DELAY_MS);
  });

  try {
    terminal.loadAddon(addon);
  } catch (e) {
    console.warn("[webgl-pool] loadAddon failed, using DOM renderer:", e);
    try {
      addon.dispose();
    } catch {
      // ignore
    }
    return;
  }

  // Diff to find the GPU-backed canvas(es) the addon just injected.
  const after = elem.querySelectorAll<HTMLCanvasElement>("canvas");
  const added: HTMLCanvasElement[] = [];
  for (const c of after) if (!before.has(c)) added.push(c);

  entry.webglAddon = addon;
  entry.webglCanvases = added;
}

/**
 * Mark the terminal hidden and schedule its WebGL addon for idle reaping.
 *
 * Setting `visible = false` immediately makes it an eviction candidate, so a
 * newly-revealed terminal that needs a slot can take this one's context right
 * away (before the 30s reap fires). The reap is the fallback for the case where
 * nothing else asks for a slot — we still want to free the GPU context rather
 * than leak it indefinitely.
 */
export function releaseWebgl(terminalId: string): void {
  const entry = entries.get(terminalId);
  if (!entry) return;
  entry.visible = false;
  entry.lastUsedAt = performance.now();
  if (!entry.webglAddon) return;
  cancelReap(entry);
  entry.reapTimer = setTimeout(() => {
    entry.reapTimer = null;
    // Only reap if it's still hidden — a revisit would have flipped visible
    // back true and cancelled this timer, but guard anyway.
    if (!entry.visible) disposeEntryWebgl(entry);
  }, WEBGL_REAP_GRACE_MS);
}

/**
 * Immediately and permanently tear down a terminal's pool entry. Called from
 * `disposeTerminal` on explicit panel close — frees the GPU context and drops
 * all bookkeeping. Safe to call for an id with no entry.
 */
export function disposeWebgl(terminalId: string): void {
  const entry = entries.get(terminalId);
  if (!entry) return;
  cancelReap(entry);
  disposeEntryWebgl(entry);
  entries.delete(terminalId);
}

/**
 * Tear down the WebGL addon on an entry WITHOUT removing the entry itself (the
 * terminal lives on, on the DOM renderer). This is the real GPU-freeing path:
 * `addon.dispose()` alone leaves the WebGL context alive and counting against
 * the browser cap, so we additionally lose the context explicitly and null the
 * addon's private renderer refs (mirrors terax's disposeSlotWebgl).
 */
function disposeEntryWebgl(entry: PoolEntry): void {
  const addon = entry.webglAddon;
  if (!addon) return;

  // Drop our reference FIRST. releaseCanvasContext() below calls
  // `loseContext()`, which synchronously dispatches `webglcontextlost` while
  // the addon's onContextLoss listener is still live — re-entering our handler
  // mid-teardown. With `webglAddon` already null (and, for the dispose path,
  // the entry already removed from the map), that re-entry self-aborts instead
  // of trying to re-attach. Also cancel any pending reap so a torn-down entry
  // leaves no dangling timer.
  entry.webglAddon = null;
  cancelReap(entry);

  for (const canvas of entry.webglCanvases) releaseCanvasContext(canvas);
  entry.webglCanvases = [];

  try {
    addon.dispose();
  } catch (e) {
    console.warn("[webgl-pool] addon dispose failed:", e);
  }

  // Null the addon's internal renderer references. These are PRIVATE xterm
  // fields (version-specific names), so everything is wrapped in try/catch —
  // if the shape changes we just skip it and rely on dispose() + loseContext().
  // Without this the renderer keeps the WebGL context (and its char atlas
  // texture) reachable, so the GPU memory leaks even after dispose().
  try {
    const r = (addon as unknown as { _renderer?: Record<string, unknown> | null })
      ._renderer;
    if (r) {
      r._canvas = null;
      r._gl = null;
      r._charAtlas = null;
      r._atlas = null;
    }
    (addon as unknown as { _renderer?: unknown })._renderer = null;
    (addon as unknown as { _renderService?: unknown })._renderService = null;
    (addon as unknown as { _gl?: unknown })._gl = null;
    (addon as unknown as { _charAtlas?: unknown })._charAtlas = null;
  } catch {
    // Private fields not present in this xterm version — fine.
  }
}

/**
 * Explicitly destroy the GPU context backing a canvas. `WEBGL_lose_context`'s
 * `loseContext()` is the only reliable way to make the browser reclaim a WebGL
 * context immediately rather than whenever it next garbage-collects — which is
 * exactly what we need to stay under the context cap. Then zero the canvas size
 * to drop its backing store.
 */
/**
 * Introspection seam for tests and runtime debugging. Mirrors terax's
 * `terminalDebugStats().webglContexts` — lets you assert the cap holds
 * ("open 6 terminals, confirm `attached` stays ≤ MAX_WEBGL_CONTEXTS").
 */
export function webglPoolStats(): {
  max: number;
  attached: number;
  entries: Array<{
    terminalId: string;
    visible: boolean;
    hasWebgl: boolean;
    lastUsedAt: number;
  }>;
} {
  return {
    max: MAX_WEBGL_CONTEXTS,
    attached: attachedCount(),
    entries: [...entries.entries()].map(([terminalId, e]) => ({
      terminalId,
      visible: e.visible,
      hasWebgl: !!e.webglAddon,
      lastUsedAt: e.lastUsedAt,
    })),
  };
}

if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __webglPoolStats?: unknown }).__webglPoolStats =
    webglPoolStats;
}

function releaseCanvasContext(canvas: HTMLCanvasElement): void {
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
  } catch {
    // ignore
  }
  if (!gl) {
    try {
      gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    } catch {
      // ignore
    }
  }
  if (gl) {
    try {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext && !gl.isContextLost()) ext.loseContext();
    } catch {
      // ignore
    }
  }
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // ignore
  }
}
