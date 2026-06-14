import type { CSSProperties } from "react";

export type ProjectType =
  | "rust"
  | "node"
  | "python"
  | "go"
  | "java"
  | "ruby"
  | "php"
  | "swift"
  | "c-cpp"
  | "dotnet"
  | "git"
  | "generic";

export function detectColorFromPath(path: string): string {
  let hash = 0;
  for (let i = 0; i < path.length; i++) {
    hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
  }
  const h = ((hash % 360) + 360) % 360;
  return `hsl(${h}, 30%, 50%)`;
}

function getSessionColor(sessionId: string): string {
  return detectColorFromPath(sessionId);
}

function RustIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 12h8" />
      <path d="M12 8v8" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function NodeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 22,8.5 22,15.5 12,22 2,15.5 2,8.5" />
      <path d="M12 22V12" />
      <path d="M22 8.5L12 12 2 8.5" />
    </svg>
  );
}

function PythonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2c-4 0-4.5 2-4.5 2v3.5s1-.5 2.5-.5c1.5 0 2 1 2 3s-.5 3-2 3H9.5S7 12 7 14.5 9 18 12 18c3.5 0 5-2 5-5V4s-.5-2-5-2z" />
      <circle cx="10" cy="5.5" r="1" fill="currentColor" />
    </svg>
  );
}

function GoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12h4l2-4 3 8 2-4h4" />
      <path d="M17 12h4" />
    </svg>
  );
}

function JavaIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 17s-2 1 1 1 5-3 5-3" />
      <path d="M14 17s2 1-1 1-5-3-5-3" />
      <path d="M12 2C8 2 6 4 6 4v12s2 2 6 2 6-2 6-2V4s-2-2-6-2z" />
    </svg>
  );
}

function RubyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12,2 4,9 12,14 20,9" />
      <path d="M4 9l8 5 8-5" />
      <path d="M4 9v6l8 5 8-5V9" />
    </svg>
  );
}

function PhpIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="12" rx="9" ry="6" />
      <path d="M7 9v6" />
      <path d="M17 9c2 0 3 1.5 3 3s-1 3-3 3h-2v-6" />
    </svg>
  );
}

function SwiftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4c-4-1-9 1-9 7 0 8 11 8 11 0 0-3-2-5-4-5" />
      <path d="M13 18c4 1 9-1 9-7 0-8-11-8-11 0 0 3 2 5 4 5" />
    </svg>
  );
}

function CCppIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="12" r="5" />
      <path d="M15 9c1.5 1 2 3 2 3s-.5 2-2 3" />
      <path d="M15 15c-1.5-1-2-3-2-3s.5-2 2-3" />
    </svg>
  );
}

function DotnetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M8 8v8" />
      <path d="M14 8v8" />
      <path d="M14 12h4" />
    </svg>
  );
}

function GitIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="6" r="2" />
      <circle cx="12" cy="18" r="2" />
      <circle cx="18" cy="12" r="2" />
      <path d="M12 8v4" />
      <path d="M12 12c3 0 6 0 6 0" />
    </svg>
  );
}

function GenericIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h5l2 2h9a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
    </svg>
  );
}

const ICONS = {
  rust: RustIcon,
  node: NodeIcon,
  python: PythonIcon,
  go: GoIcon,
  java: JavaIcon,
  ruby: RubyIcon,
  php: PhpIcon,
  swift: SwiftIcon,
  "c-cpp": CCppIcon,
  dotnet: DotnetIcon,
  git: GitIcon,
  generic: GenericIcon,
};

interface SessionIconProps {
  sessionId: string;
  projectType: string;
  size?: number;
  className?: string;
}

export function SessionIcon({
  sessionId,
  projectType,
  size = 18,
  className,
}: SessionIconProps) {
  const color = getSessionColor(sessionId);
  function isProjectType(val: string): val is ProjectType {
    return val in ICONS;
  }
  const ptype = isProjectType(projectType) ? projectType : "generic";
  const IconComponent = ICONS[ptype];

  const style: CSSProperties = {
    width: size,
    height: size,
    flexShrink: 0,
  };

  return (
    <span
      className={`session-icon${className ? ` ${className}` : ""}`}
      style={{
        ...style,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        backgroundColor: color,
        color: "#fff",
        flexShrink: 0,
      }}
      title={projectType !== "generic" ? projectType : undefined}
    >
      <span style={{ width: size * 0.6, height: size * 0.6, display: "flex" }}>
        <IconComponent />
      </span>
    </span>
  );
}
