import React from 'react';
import { theme } from '../styles/theme';

/*
 * After a deploy, an open tab still asks for the old build's chunk names.
 * `serve -s` answers a deleted chunk with index.html, so webpack throws a
 * ChunkLoadError on the next lazy screen. Reload once to pick up the new
 * build. The timestamp stops a loop: a second chunk error within 10 s of the
 * last reload shows the error card instead. Never clear it on mount - a deep
 * link to a chunk that is genuinely broken would then reload forever.
 */
export const CHUNK_RELOAD_KEY = 'ryp.chunkReloadAt';
const CHUNK_RELOAD_WINDOW_MS = 10000;

export function isChunkError(e) {
  return e?.name === 'ChunkLoadError' || /Loading (CSS )?chunk [\w-]+ failed/.test(e?.message || '');
}

function mayReload() {
  try {
    const last = Number(window.sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    return Date.now() - last > CHUNK_RELOAD_WINDOW_MS;
  } catch (err) {
    return false;
  }
}

function shouldReload(error) {
  return isChunkError(error) && navigator.onLine !== false && mayReload();
}

/** Records the reload; false when storage refuses the write, so we never reload unguarded. */
function markReload() {
  try {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(Date.now()));
    return true;
  } catch (err) {
    return false;
  }
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, reloading: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI (or nothing,
    // while a stale-chunk reload is on its way).
    return { hasError: true, reloading: shouldReload(error) };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console
    console.error('Error caught by boundary:', error, errorInfo);

    if (shouldReload(error) && markReload()) {
      window.location.reload();
      return;
    }

    // Update state with error details
    this.setState({
      reloading: false,
      error: error,
      errorInfo: errorInfo
    });
  }

  render() {
    if (this.state.reloading) return null;
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

