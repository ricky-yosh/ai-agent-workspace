export { fileContentCache, FileContentCache, fnv1a } from "./cache";
export type { CacheEntry } from "./cache";
export { useFileContent } from "./useFileContent";
export type { FileContentResult } from "./useFileContent";
export { DiffRenderer } from "./renderers/DiffRenderer";
export type { DiffRendererProps, DiffLine, DiffFile, DiffLineType } from "./renderers/DiffRenderer";
export { parseUnifiedDiff } from "./renderers/DiffRenderer";
export { MarkdownRenderer } from "./renderers/MarkdownRenderer";
export { PlainTextRenderer } from "./renderers/PlainTextRenderer";
export { useVirtualRows } from "./virtualizer";
export type { VirtualRow, UseVirtualRowsResult } from "./virtualizer";
export {
  languageForExtension,
  languageForFile,
  extractExtension,
  BUNDLED_LANGUAGES,
} from "./languageRegistry";
export type { ShikiLanguageId } from "./languageRegistry";
export { CodeRenderer } from "./renderers/CodeRenderer";
