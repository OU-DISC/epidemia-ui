import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("EPIDEMIA render error:", error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <div className="app-error-boundary" role="alert">
          <h1>Something went wrong</h1>
          <p className="app-error-boundary__message">
            {error.message || "An unexpected error stopped the dashboard from rendering."}
          </p>
          <button type="button" className="app-error-boundary__reload" onClick={this.handleReload}>
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
