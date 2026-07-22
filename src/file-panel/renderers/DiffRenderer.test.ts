import { describe, it, expect } from "vitest";
import { parseUnifiedDiff } from "./DiffRenderer";

describe("parseUnifiedDiff", () => {
  it("returns empty array for empty diff", () => {
    expect(parseUnifiedDiff("")).toEqual([]);
  });

  it("parses a single file diff with additions and deletions", () => {
    const raw = [
      "diff --git a/src/main.ts b/src/main.ts",
      "index 1234567..abcdef0 100644",
      "--- a/src/main.ts",
      "+++ b/src/main.ts",
      "@@ -1,5 +1,5 @@",
      " import { foo } from './foo';",
      "-const x = 1;",
      "+const x = 2;",
      " import { bar } from './bar';",
      "",
      " export default function main() {",
    ].join("\n");

    const files = parseUnifiedDiff(raw);

    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe("src/main.ts");

    // File header lines: index, ---, +++
    // Hunk header: @@
    // Context: "import { foo }", "import { bar }", empty, "export default"
    // Deletion: "const x = 1;"
    // Addition: "const x = 2;"
    const lines = files[0].lines;

    const additions = lines.filter((l) => l.type === "addition");
    const deletions = lines.filter((l) => l.type === "deletion");
    const hunkHeaders = lines.filter((l) => l.type === "hunk-header");
    const fileHeaders = lines.filter((l) => l.type === "file-header");

    expect(additions).toHaveLength(1);
    expect(deletions).toHaveLength(1);
    expect(hunkHeaders).toHaveLength(1);
    // fileHeaders: index, ---, +++
    expect(fileHeaders.length).toBeGreaterThanOrEqual(2);
  });

  it("tracks line numbers correctly", () => {
    const raw = [
      "diff --git a/foo.txt b/foo.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-old line2",
      "+new line2",
      " line3",
    ].join("\n");

    const files = parseUnifiedDiff(raw);
    const lines = files[0].lines;

    const context1 = lines.find((l) => l.content === "line1" && l.type === "context");
    expect(context1).toBeDefined();
    expect(context1!.oldLineNum).toBe(1);
    expect(context1!.newLineNum).toBe(1);

    const deletion = lines.find((l) => l.type === "deletion");
    expect(deletion).toBeDefined();
    expect(deletion!.oldLineNum).toBe(2);
    expect(deletion!.newLineNum).toBeNull();

    const addition = lines.find((l) => l.type === "addition");
    expect(addition).toBeDefined();
    expect(addition!.oldLineNum).toBeNull();
    expect(addition!.newLineNum).toBe(2);

    const context3 = lines.find((l) => l.content === "line3" && l.type === "context");
    expect(context3).toBeDefined();
    expect(context3!.oldLineNum).toBe(3);
    expect(context3!.newLineNum).toBe(3);
  });

  it("parses multiple files", () => {
    const raw = [
      "diff --git a/a.txt b/a.txt",
      "@@ -1 +1 @@",
      "-old",
      "+new",
      "diff --git a/b.txt b/b.txt",
      "@@ -1 +1 @@",
      "-before",
      "+after",
    ].join("\n");

    const files = parseUnifiedDiff(raw);
    expect(files).toHaveLength(2);
    expect(files[0].filePath).toBe("a.txt");
    expect(files[1].filePath).toBe("b.txt");
  });

  it("classifies hunk headers", () => {
    const raw = [
      "diff --git a/test.ts b/test.ts",
      "@@ -10,6 +10,8 @@ function hello() {",
      " context",
    ].join("\n");

    const files = parseUnifiedDiff(raw);
    const hunk = files[0].lines.find((l) => l.type === "hunk-header");
    expect(hunk).toBeDefined();
    expect(hunk!.content).toBe("function hello() {");
  });

  it("strips leading space from context lines", () => {
    const raw = [
      "diff --git a/x b/x",
      "@@ -1 +1 @@",
      " hello world",
    ].join("\n");

    const files = parseUnifiedDiff(raw);
    const contextLine = files[0].lines.find((l) => l.type === "context");
    expect(contextLine).toBeDefined();
    expect(contextLine!.content).toBe("hello world");
    expect(contextLine!.raw).toBe(" hello world");
  });

  it("strips leading + from addition lines", () => {
    const raw = [
      "diff --git a/x b/x",
      "@@ -1 +1 @@",
      "+added content",
    ].join("\n");

    const files = parseUnifiedDiff(raw);
    const addition = files[0].lines.find((l) => l.type === "addition");
    expect(addition).toBeDefined();
    expect(addition!.content).toBe("added content");
    expect(addition!.raw).toBe("+added content");
  });

  it("strips leading - from deletion lines", () => {
    const raw = [
      "diff --git a/x b/x",
      "@@ -1 +1 @@",
      "-removed content",
    ].join("\n");

    const files = parseUnifiedDiff(raw);
    const deletion = files[0].lines.find((l) => l.type === "deletion");
    expect(deletion).toBeDefined();
    expect(deletion!.content).toBe("removed content");
    expect(deletion!.raw).toBe("-removed content");
  });

  it("handles diff with no changes (empty diff body)", () => {
    const raw = "diff --git a/x b/x\nindex 123..456 100644\n";
    const files = parseUnifiedDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe("x");
    expect(files[0].lines).toHaveLength(1); // only the index line
    expect(files[0].lines[0].type).toBe("file-header");
  });

  it("handles new file diffs", () => {
    const raw = [
      "diff --git a/new.txt b/new.txt",
      "new file mode 100644",
      "index 0000000..1234567",
      "@@ -0,0 +1,3 @@",
      "+line one",
      "+line two",
      "+line three",
    ].join("\n");

    const files = parseUnifiedDiff(raw);
    expect(files).toHaveLength(1);
    expect(files[0].filePath).toBe("new.txt");

    const additions = files[0].lines.filter((l) => l.type === "addition");
    expect(additions).toHaveLength(3);
    expect(additions[0].content).toBe("line one");
    expect(additions[1].content).toBe("line two");
    expect(additions[2].content).toBe("line three");
  });
});
