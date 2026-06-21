import { describe, it, expect } from "vitest";
import { resolveMotion } from "./motionPreference";

describe("resolveMotion", () => {
  it("returns 'full' when pref is 'system' and OS does not prefer reduced", () => {
    expect(resolveMotion("system", false)).toBe("full");
  });

  it("returns 'reduced' when pref is 'system' and OS prefers reduced", () => {
    expect(resolveMotion("system", true)).toBe("reduced");
  });

  it("returns 'full' when pref is 'full' regardless of OS", () => {
    expect(resolveMotion("full", false)).toBe("full");
    expect(resolveMotion("full", true)).toBe("full");
  });

  it("returns 'reduced' when pref is 'reduced' regardless of OS", () => {
    expect(resolveMotion("reduced", false)).toBe("reduced");
    expect(resolveMotion("reduced", true)).toBe("reduced");
  });
});
