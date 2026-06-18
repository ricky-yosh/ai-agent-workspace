import { describe, it, expect, vi, afterEach } from "vitest";

// new WebglAddon() allocates a real GPU context, which jsdom can't provide, so
// mock the module with a minimal fake that records onContextLoss/dispose. This
// lets us exercise the pool's eviction/bounding policy — the part that actually
// prevents the crash — without a GPU.
vi.mock("@xterm/addon-webgl", () => {
  class FakeWebglAddon {
    onContextLoss(_cb: () => void): void {}
    dispose(): void {}
  }
  return { WebglAddon: FakeWebglAddon };
});

import {
  requestWebgl,
  releaseWebgl,
  disposeWebgl,
  webglPoolStats,
} from "./webglPool";

// A fake xterm Terminal that satisfies everything webglPool touches: it needs a
// mounted `element` (so attach() proceeds), a no-op loadAddon, a rows count, and
// a refresh. querySelectorAll returns no canvases — the pool just records an
// empty canvas list, which is fine for policy testing.
function fakeTerminal(): any {
  return {
    element: { querySelectorAll: () => [] as HTMLCanvasElement[] },
    loadAddon: () => {},
    refresh: () => {},
    rows: 24,
  };
}

// Tests share the module-level pool; dispose every id we create so state can't
// leak between cases (and so the 30s reap timers from releaseWebgl don't dangle).
const createdIds = new Set<string>();
function request(id: string): void {
  createdIds.add(id);
  requestWebgl(id, fakeTerminal());
}
afterEach(() => {
  for (const id of createdIds) disposeWebgl(id);
  createdIds.clear();
});

describe("webglPool bounding", () => {
  it("never attaches more than MAX_WEBGL_CONTEXTS at once", () => {
    const { max } = webglPoolStats();
    // Request one more terminal than the cap, all visible.
    for (let i = 0; i < max + 2; i++) request(`t${i}`);
    const stats = webglPoolStats();
    expect(stats.attached).toBe(max);
    expect(stats.attached).toBeLessThanOrEqual(max);
  });

  it("when the pool is full and all attached are visible, the extra terminal gets no context (DOM fallback)", () => {
    const { max } = webglPoolStats();
    for (let i = 0; i < max; i++) request(`v${i}`);
    expect(webglPoolStats().attached).toBe(max);

    request("overflow");
    const stats = webglPoolStats();
    expect(stats.attached).toBe(max); // still capped
    const overflow = stats.entries.find((e) => e.terminalId === "overflow");
    expect(overflow?.hasWebgl).toBe(false); // ran onto the DOM renderer
  });

  it("evicts the least-recently-used HIDDEN terminal to give a revealed one a slot", () => {
    const { max } = webglPoolStats();
    for (let i = 0; i < max; i++) request(`a${i}`);
    expect(webglPoolStats().attached).toBe(max);

    // Hide a0 -> it becomes the only eviction candidate.
    releaseWebgl("a0");

    // A new terminal reveals; pool is full, so it must steal a0's context.
    request("newcomer");

    const stats = webglPoolStats();
    expect(stats.attached).toBe(max); // bound preserved across the swap
    const a0 = stats.entries.find((e) => e.terminalId === "a0");
    const newcomer = stats.entries.find((e) => e.terminalId === "newcomer");
    expect(a0?.hasWebgl).toBe(false); // evicted
    expect(newcomer?.hasWebgl).toBe(true); // took the freed slot
  });

  it("disposeWebgl frees the context and drops the entry entirely", () => {
    request("gone");
    expect(
      webglPoolStats().entries.find((e) => e.terminalId === "gone")?.hasWebgl,
    ).toBe(true);

    disposeWebgl("gone");
    createdIds.delete("gone");
    expect(
      webglPoolStats().entries.find((e) => e.terminalId === "gone"),
    ).toBeUndefined();
  });
});
