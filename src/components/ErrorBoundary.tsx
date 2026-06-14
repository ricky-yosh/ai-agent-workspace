import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `: ${this.props.name}` : ""}]`, error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: 24,
          color: "#cccccc",
          background: "#1e1e1e",
          gap: 12,
        }}>
          <div style={{ fontSize: 14, color: "#f44336", fontWeight: 600 }}>
            {this.props.name ? `${this.props.name} crashed` : "Something went wrong"}
          </div>
          <div style={{ fontSize: 12, color: "#6e6e6e", maxWidth: 400, textAlign: "center" }}>
            {this.state.error?.message ?? "An unexpected error occurred"}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              marginTop: 8,
              padding: "6px 16px",
              background: "#0078d4",
              color: "#fff",
              border: "none",
              borderRadius: 4,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
