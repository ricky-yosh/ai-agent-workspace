import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./IssueBody.css";

interface IssueBodyProps {
  body: string;
}

export function IssueBody({ body }: IssueBodyProps) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => <h2>{children}</h2>,
        h3: ({ children }) => <h3>{children}</h3>,
        code: ({ children, className }) => {
          const isBlock = Boolean(className);
          if (isBlock) {
            return <code className="issue-md-code--block">{children}</code>;
          }
          return <code className="issue-md-code--inline">{children}</code>;
        },
        pre: ({ children }) => <pre>{children}</pre>,
        blockquote: ({ children }) => <blockquote>{children}</blockquote>,
        p: ({ children }) => <p>{children}</p>,
        ul: ({ children }) => <ul>{children}</ul>,
        ol: ({ children }) => <ol>{children}</ol>,
        a: ({ children, href }) => (
          <a href={href}>{children}</a>
        ),
        input: ({ checked }: React.InputHTMLAttributes<HTMLInputElement>) => (
          <input type="checkbox" disabled checked={checked ?? false} onChange={() => {}} />
        ),
      }}
    >
      {body}
    </ReactMarkdown>
  );
}
