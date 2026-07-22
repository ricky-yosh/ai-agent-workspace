export interface FileTreeEntry {
  name: string;
  path: string;
  kind: "file" | "directory";
  status?: "added" | "modified" | "deleted" | "renamed";
  additions?: number;
  deletions?: number;
  children?: FileTreeEntry[];
}

export function parseNumstatToTree(numstatOutput: string): FileTreeEntry[] {
  if (!numstatOutput.trim()) return [];

  const files: FileTreeEntry[] = [];
  const lines = numstatOutput.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const parts = line.split("\t");
    if (parts.length < 3) continue;

    const additions = parts[0];
    const deletions = parts[1];
    const rawPath = parts[2];

    let path = rawPath;
    let oldPath: string | undefined;
    const nulIdx = rawPath.indexOf("\0");
    if (nulIdx > 0) {
      oldPath = rawPath.slice(0, nulIdx);
      path = rawPath.slice(nulIdx + 1);
    }

    const status = oldPath
      ? ("renamed" as const)
      : additions === "0" && deletions !== "0"
        ? ("deleted" as const)
        : additions !== "0" && deletions === "0"
          ? ("added" as const)
          : ("modified" as const);

    files.push({
      name: path.split("/").pop() || path,
      path,
      kind: "file",
      status,
      additions: additions === "-" ? undefined : parseInt(additions, 10) || 0,
      deletions: deletions === "-" ? undefined : parseInt(deletions, 10) || 0,
    });
  }

  return buildTree(files);
}

function buildTree(files: FileTreeEntry[]): FileTreeEntry[] {
  const root: FileTreeEntry[] = [];
  const dirMap = new Map<string, FileTreeEntry>();

  for (const file of files) {
    const segments = file.path.split("/");
    if (segments.length === 1) {
      root.push(file);
      continue;
    }

    let current = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const dirPath = segments.slice(0, i + 1).join("/");
      let dir = dirMap.get(dirPath);
      if (!dir) {
        dir = {
          name: segments[i],
          path: dirPath,
          kind: "directory",
          additions: 0,
          deletions: 0,
          children: [],
        };
        dirMap.set(dirPath, dir);
        current.push(dir);
      }
      dir.additions = (dir.additions || 0) + (file.additions || 0);
      dir.deletions = (dir.deletions || 0) + (file.deletions || 0);
      current = dir.children!;
    }

    current.push(file);
  }

  return root;
}
