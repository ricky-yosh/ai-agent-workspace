import { describe, it, expect } from "vitest";
import { parseCommandError, isErrorCode } from "./errors";

describe("parseCommandError", () => {
  it("parses valid CommandError JSON", () => {
    const input = JSON.stringify({
      error: "not_found",
      entity: "session",
      id: "abc123",
      message: "session not found: abc123",
    });
    const result = parseCommandError(input);
    expect(result).toEqual({
      error: "not_found",
      entity: "session",
      id: "abc123",
      message: "session not found: abc123",
    });
  });

  it("returns null for non-string input", () => {
    expect(parseCommandError(null)).toBeNull();
    expect(parseCommandError(undefined)).toBeNull();
    expect(parseCommandError(42)).toBeNull();
    expect(parseCommandError({})).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(parseCommandError("not json")).toBeNull();
  });

  it("returns null for JSON without error field", () => {
    expect(parseCommandError('{"message": "test"}')).toBeNull();
  });

  it("parses all error categories", () => {
    const categories = ["not_found", "already_exists", "invalid_input", "internal"];
    for (const category of categories) {
      const result = parseCommandError(JSON.stringify({ error: category }));
      expect(result?.error).toBe(category);
    }
  });
});

describe("isErrorCode", () => {
  it("returns true for matching code", () => {
    const input = JSON.stringify({ error: "not_found", entity: "", id: "", message: "" });
    expect(isErrorCode(input, "not_found")).toBe(true);
  });

  it("returns false for non-matching code", () => {
    const input = JSON.stringify({ error: "not_found", entity: "", id: "", message: "" });
    expect(isErrorCode(input, "already_exists")).toBe(false);
  });

  it("returns false for invalid input", () => {
    expect(isErrorCode("not json", "not_found")).toBe(false);
    expect(isErrorCode(null, "not_found")).toBe(false);
  });
});
