import { describe, it, expect } from "vitest";
import {
  languageForExtension,
  extractExtension,
  languageForFile,
  BUNDLED_LANGUAGES,
} from "./languageRegistry";

// ---------------------------------------------------------------------------
// extractExtension
// ---------------------------------------------------------------------------

describe("extractExtension", () => {
  it("extracts extension from a simple path", () => {
    expect(extractExtension("src/main.ts")).toBe("ts");
  });

  it("extracts extension with multiple dots", () => {
    expect(extractExtension("file.test.ts")).toBe("ts");
  });

  it("returns empty string for no extension", () => {
    expect(extractExtension("Makefile")).toBe("");
  });

  it("returns empty string for trailing dot", () => {
    expect(extractExtension("file.")).toBe("");
  });

  it("lowercases the extension", () => {
    expect(extractExtension("file.TS")).toBe("ts");
  });

  it("handles deep paths", () => {
    expect(extractExtension("src/deep/nested/file.py")).toBe("py");
  });
});

// ---------------------------------------------------------------------------
// languageForExtension
// ---------------------------------------------------------------------------

describe("languageForExtension", () => {
  it("maps ts to typescript", () => {
    expect(languageForExtension("ts")).toBe("typescript");
  });

  it("maps js to javascript", () => {
    expect(languageForExtension("js")).toBe("javascript");
  });

  it("maps py to python", () => {
    expect(languageForExtension("py")).toBe("python");
  });

  it("maps rs to rust", () => {
    expect(languageForExtension("rs")).toBe("rust");
  });

  it("maps go to go", () => {
    expect(languageForExtension("go")).toBe("go");
  });

  it("maps cpp to cpp", () => {
    expect(languageForExtension("cpp")).toBe("cpp");
  });

  it("maps c to c", () => {
    expect(languageForExtension("c")).toBe("c");
  });

  it("maps h to c (C headers)", () => {
    expect(languageForExtension("h")).toBe("c");
  });

  it("maps java to java", () => {
    expect(languageForExtension("java")).toBe("java");
  });

  it("maps html to html", () => {
    expect(languageForExtension("html")).toBe("html");
  });

  it("maps css to css", () => {
    expect(languageForExtension("css")).toBe("css");
  });

  it("maps json to json", () => {
    expect(languageForExtension("json")).toBe("json");
  });

  it("maps yaml to yaml", () => {
    expect(languageForExtension("yaml")).toBe("yaml");
  });

  it("maps yml to yaml", () => {
    expect(languageForExtension("yml")).toBe("yaml");
  });

  it("maps toml to toml", () => {
    expect(languageForExtension("toml")).toBe("toml");
  });

  it("maps md to markdown", () => {
    expect(languageForExtension("md")).toBe("markdown");
  });

  it("maps sh to shellscript", () => {
    expect(languageForExtension("sh")).toBe("shellscript");
  });

  it("maps bash to shellscript", () => {
    expect(languageForExtension("bash")).toBe("shellscript");
  });

  it("maps swift to swift", () => {
    expect(languageForExtension("swift")).toBe("swift");
  });

  it("maps m to objective-c", () => {
    expect(languageForExtension("m")).toBe("objective-c");
  });

  it("maps mm to objective-cpp", () => {
    expect(languageForExtension("mm")).toBe("objective-cpp");
  });

  it("maps kt to kotlin", () => {
    expect(languageForExtension("kt")).toBe("kotlin");
  });

  it("maps cs to csharp", () => {
    expect(languageForExtension("cs")).toBe("csharp");
  });

  it("maps rb to ruby", () => {
    expect(languageForExtension("rb")).toBe("ruby");
  });

  it("maps php to php", () => {
    expect(languageForExtension("php")).toBe("php");
  });

  it("maps sql to sql", () => {
    expect(languageForExtension("sql")).toBe("sql");
  });

  it("maps scss to scss", () => {
    expect(languageForExtension("scss")).toBe("scss");
  });

  it("maps less to less", () => {
    expect(languageForExtension("less")).toBe("less");
  });

  it("returns null for unknown extensions", () => {
    expect(languageForExtension("xyz")).toBeNull();
  });

  it("is case-insensitive", () => {
    expect(languageForExtension("TS")).toBe("typescript");
    expect(languageForExtension("Py")).toBe("python");
  });
});

// ---------------------------------------------------------------------------
// languageForFile
// ---------------------------------------------------------------------------

describe("languageForFile", () => {
  it("detects typescript from a file path", () => {
    expect(languageForFile("src/components/App.tsx")).toBe("typescript");
  });

  it("detects python from a file path", () => {
    expect(languageForFile("scripts/build.py")).toBe("python");
  });

  it("detects rust from a file path", () => {
    expect(languageForFile("src-tauri/src/main.rs")).toBe("rust");
  });

  it("returns null for unknown file types", () => {
    expect(languageForFile("README")).toBeNull();
  });

  it("returns null for files with no extension", () => {
    expect(languageForFile("Makefile")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// BUNDLED_LANGUAGES
// ---------------------------------------------------------------------------

describe("BUNDLED_LANGUAGES", () => {
  it("contains at least 20 languages", () => {
    expect(BUNDLED_LANGUAGES.length).toBeGreaterThanOrEqual(20);
  });

  it("has no duplicates", () => {
    const unique = new Set(BUNDLED_LANGUAGES);
    expect(unique.size).toBe(BUNDLED_LANGUAGES.length);
  });

  it("contains expected core languages", () => {
    const expected = [
      "javascript",
      "typescript",
      "python",
      "rust",
      "go",
      "java",
      "c",
      "cpp",
      "html",
      "css",
      "json",
      "yaml",
      "toml",
      "markdown",
      "shellscript",
    ];
    for (const lang of expected) {
      expect(BUNDLED_LANGUAGES).toContain(lang);
    }
  });
});
