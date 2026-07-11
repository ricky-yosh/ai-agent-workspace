import type { ReactNode } from "react";
import { CopyButton } from "./CopyButton";
import "./SnippetCard.css";

export interface SnippetCardProps {
  hint?: string;
  copyText: string;
  disabled?: boolean;
  children: ReactNode;
}

export function SnippetCard({ hint, copyText, disabled = false, children }: SnippetCardProps) {
  return (
    <div className="ui-snippet-card">
      {hint && <p className="ui-snippet-card__hint">{hint}</p>}
      <div className="ui-snippet-card__codewrap">
        <pre className="ui-snippet-card__code">
          <code>{children}</code>
        </pre>
        <div className="ui-snippet-card__copy">
          <CopyButton text={copyText} size="sm" disabled={disabled} />
        </div>
      </div>
    </div>
  );
}
