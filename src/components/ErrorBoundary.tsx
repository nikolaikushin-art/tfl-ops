import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Shown in the message, e.g. the page name. */
  label?: string;
  /** Compact (inside the app shell) or full-screen (outermost). */
  fullScreen?: boolean;
}
interface State {
  error: Error | null;
}

/**
 * One page crashing must never blank the whole app or sign anyone out.
 * The signed-in session is stored separately, so "Try again" and a full reload
 * both keep you signed in.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[TFL] page crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const { label, fullScreen } = this.props;
    return (
      <div
        role="alert"
        style={{
          minHeight: fullScreen ? "100vh" : 320,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 460,
            border: "1px solid rgba(128,128,128,.35)",
            borderRadius: 12,
            padding: 24,
            textAlign: "center",
          }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>
            {label ? `${label} hit a problem` : "Something went wrong"}
          </h2>
          <p style={{ fontSize: 14, opacity: 0.75, marginBottom: 16 }}>
            Your data is safe and you are still signed in.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(128,128,128,.5)" }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid rgba(128,128,128,.5)" }}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
