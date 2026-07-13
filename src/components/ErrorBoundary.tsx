import { Button } from "./ui";
import { Component, type ReactNode } from "react";
import "./ErrorBoundary.css";

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
        <div className="error-boundary">
          <div className="error-boundary__title">
            {this.props.name ? `${this.props.name} crashed` : "Something went wrong"}
          </div>
          <div className="error-boundary__message">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </div>
          <Button variant="primary" size="sm" onClick={this.handleReset} className="error-boundary__btn">
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
