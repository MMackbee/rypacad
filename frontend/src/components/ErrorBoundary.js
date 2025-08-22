import React from 'react';
import { theme } from '../styles/theme';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console
    console.error('Error caught by boundary:', error, errorInfo);
    
    // Update state with error details
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minHeight: '100vh',
          padding: theme.spacing.xl,
          fontFamily: theme.typography.fontFamily.body,
          backgroundColor: theme.colors.background.primary,
          color: theme.colors.text.primary
        }}>
          <div style={{
            maxWidth: '600px',
            textAlign: 'center',
            padding: theme.spacing.xl,
            backgroundColor: theme.colors.background.secondary,
            borderRadius: theme.borderRadius.lg,
            border: `1px solid ${theme.colors.border}`
          }}>
            <h1 style={{
              fontSize: theme.typography.fontSizes['2xl'],
              color: theme.colors.error,
              marginBottom: theme.spacing.lg,
              fontFamily: theme.typography.fontFamily.headline
            }}>
              Something went wrong
            </h1>
            
            <p style={{
              fontSize: theme.typography.fontSizes.lg,
              color: theme.colors.text.secondary,
              marginBottom: theme.spacing.lg,
              lineHeight: theme.typography.lineHeights.normal
            }}>
              We're sorry, but something unexpected happened. Please try refreshing the page.
            </p>
            
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: `${theme.spacing.md} ${theme.spacing.xl}`,
                backgroundColor: theme.colors.primary,
                color: theme.colors.text.dark,
                border: 'none',
                borderRadius: theme.borderRadius.md,
                fontSize: theme.typography.fontSizes.base,
                fontWeight: theme.typography.fontWeights.semibold,
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = '#009a47';
                e.target.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = theme.colors.primary;
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Refresh Page
            </button>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details style={{
                marginTop: theme.spacing.lg,
                textAlign: 'left',
                backgroundColor: theme.colors.background.primary,
                padding: theme.spacing.md,
                borderRadius: theme.borderRadius.md,
                border: `1px solid ${theme.colors.border}`
              }}>
                <summary style={{
                  cursor: 'pointer',
                  color: theme.colors.text.secondary,
                  fontSize: theme.typography.fontSizes.sm
                }}>
                  Error Details (Development Only)
                </summary>
                <pre style={{
                  fontSize: theme.typography.fontSizes.xs,
                  color: theme.colors.text.secondary,
                  overflow: 'auto',
                  marginTop: theme.spacing.sm
                }}>
                  {this.state.error && this.state.error.toString()}
                  <br />
                  {this.state.errorInfo.componentStack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;

