import { AlertTriangle, RotateCcw } from "lucide-react";
import React, { Component, ReactNode } from "react";
import ServerError from "@/pages/ServerError";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return <ServerError onRetry={() => window.location.reload()} />;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
