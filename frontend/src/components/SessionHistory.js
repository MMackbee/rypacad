import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getUserSessions, deleteSession } from '../services/dataService';
import { theme } from '../styles/theme';

const SessionHistory = ({ user }) => {
  const [history, setHistory] = useState([]);
  const [deleting, setDeleting] = useState(null); // batchId being deleted
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    const unsubscribe = getUserSessions(user, (sessions) => {
      setHistory(sessions);
      setLoading(false);
    });

    // Fallback timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
    }, 5000); // 5 second timeout

    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [user]);

  const handleDeleteSession = async (batchId) => {
    if (!window.confirm('Are you sure you want to delete this session? This cannot be undone.')) return;
    
    setDeleting(batchId);
    try {
      await deleteSession(user, batchId);
    } catch (err) {
      alert('Failed to delete session. Please try again.');
    }
    setDeleting(null);
  };

  const formatDate = (date) => {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const containerStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.body,
    color: theme.colors.text.primary
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: theme.spacing.xl
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const loadingStyle = {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: `${theme.spacing.xl} 0`,
    color: theme.colors.text.secondary
  };

  const spinnerStyle = {
    animation: 'spin 1s linear infinite',
    border: `2px solid ${theme.colors.border}`,
    borderTop: `2px solid ${theme.colors.primary}`,
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    marginRight: theme.spacing.md
  };

  const emptyStateStyle = {
    textAlign: 'center',
    padding: `${theme.spacing.xl} 0`,
    maxWidth: '800px',
    margin: '0 auto'
  };

  const emptyIconStyle = {
    fontSize: '72px',
    marginBottom: theme.spacing.lg
  };

  const emptyTitleStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const emptyDescriptionStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.lineHeights.relaxed
  };

  const setupGuideStyle = {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    border: `1px solid ${theme.colors.border}`
  };

  const setupTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline
  };

  const stepStyle = {
    display: 'flex',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md
  };

  const stepNumberStyle = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: theme.typography.fontWeights.bold,
    fontSize: theme.typography.fontSizes.sm,
    flexShrink: 0
  };

  const stepContentStyle = {
    flex: 1
  };

  const stepTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs
  };

  const stepDescriptionStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal
  };

  const criticalStepStyle = {
    ...stepDescriptionStyle,
    border: `2px solid ${theme.colors.warning}`,
    backgroundColor: `${theme.colors.warning}10`,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm
  };

  const ctaButtonStyle = {
    display: 'inline-block',
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    fontWeight: theme.typography.fontWeights.bold,
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.lg,
    textDecoration: 'none',
    transition: 'all 0.2s ease',
    border: 'none',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: '#009a47',
      transform: 'translateY(-1px)',
      boxShadow: theme.shadows.green
    }
  };

  const sessionsGridStyle = {
    display: 'grid',
    gap: theme.spacing.lg,
    gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))'
  };

  const sessionCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.sm
  };

  const sessionHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md
  };

  const sessionInfoStyle = {
    flex: 1
  };

  const sessionTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm
  };

  const sessionMetaStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.lg,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary
  };

  const sessionNotesStyle = {
    color: theme.colors.text.secondary,
    marginTop: theme.spacing.sm,
    fontStyle: 'italic'
  };

  const sessionActionsStyle = {
    display: 'flex',
    gap: theme.spacing.sm
  };

  const viewButtonStyle = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
    textDecoration: 'none',
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    transition: 'all 0.2s ease',
    border: 'none',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: '#009a47'
    }
  };

  const deleteButtonStyle = {
    backgroundColor: theme.colors.error,
    color: theme.colors.text.primary,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    transition: 'all 0.2s ease',
    border: 'none',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: '#d32f2f'
    }
  };

  if (loading) {
    return (
      <div style={loadingStyle}>
        <div style={spinnerStyle}></div>
        <span>Loading sessions...</span>
      </div>
    );
  }

  // Fallback: if we're not loading and have no user, show empty state
  if (!user) {
    return (
      <div style={emptyStateStyle}>
        <div style={emptyIconStyle}>🔐</div>
        <h3 style={emptyTitleStyle}>Authentication Required</h3>
        <p style={emptyDescriptionStyle}>
          Please log in to view your session history.
        </p>
        <Link 
          to="/login" 
          style={{
            display: 'inline-block',
            backgroundColor: theme.colors.primary,
            color: theme.colors.text.dark,
            fontWeight: theme.typography.fontWeights.bold,
            padding: `${theme.spacing.md} ${theme.spacing.xl}`,
            borderRadius: theme.borderRadius.md,
            fontSize: theme.typography.fontSizes.lg,
            textDecoration: 'none',
            marginTop: theme.spacing.lg,
            transition: 'all 0.2s ease',
            border: 'none',
            cursor: 'pointer',
            ':hover': {
              backgroundColor: '#009a47',
              transform: 'translateY(-1px)',
              boxShadow: theme.shadows.green
            }
          }}
        >
          Go to Login
        </Link>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>Session History</h2>
        <p style={subtitleStyle}>Review and manage your practice sessions</p>
      </div>

      {history.length === 0 ? (
        <div style={emptyStateStyle}>
          <div style={emptyIconStyle}>📊</div>
          <h3 style={emptyTitleStyle}>No Sessions Yet</h3>
          <p style={emptyDescriptionStyle}>
            Get started by following the directions below to set up your data collection properly. 
            Once you upload your first session, you'll be able to analyze your golf performance data.
          </p>
          
          <div style={setupGuideStyle}>
            <h4 style={setupTitleStyle}>📋 Data Collection Setup Guide</h4>
            
            <div style={stepStyle}>
              <div style={stepNumberStyle}>1</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Prepare Your Driving Range</div>
                <div style={stepDescriptionStyle}>
                  Start with a clean driving range setup. If your launch monitor software has been running 
                  for a while, perform a refresh or restart to ensure optimal performance. This helps 
                  prevent data corruption and ensures accurate readings.
                </div>
              </div>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>2</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Calibrate Your Launch Monitor</div>
                <div style={stepDescriptionStyle}>
                  Ensure your launch monitor (GSPro, Rapsodo, Foresight, or Trackman) is properly calibrated 
                  and positioned according to manufacturer guidelines. Clean the hitting area and verify ball detection.
                </div>
              </div>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>3</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Create a New Session</div>
                <div style={stepDescriptionStyle}>
                  Create a new session in your launch monitor software. Use descriptive names like 
                  "Driver Testing" or "Iron Practice" to help organize your data later.
                </div>
              </div>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>4</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Configure Data Collection</div>
                <div style={stepDescriptionStyle}>
                  Enable all relevant metrics: ball speed, carry distance, total distance, spin rate, 
                  launch angle, and side dispersion. Ensure consistent club selection for accurate analysis.
                </div>
              </div>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>5</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Accurately Tag Each Club</div>
                <div style={criticalStepStyle}>
                  <strong>⚠️ CRITICAL STEP:</strong> For each shot, make sure to accurately tag which club you are hitting. 
                  This is essential for proper analysis. Use consistent club names (e.g., "Driver", "7 Iron", "Pitching Wedge"). 
                  Our system will automatically standardize club names, but accurate tagging is crucial for meaningful results.
                </div>
              </div>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>6</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Record Your Shots</div>
                <div style={stepDescriptionStyle}>
                  Take your practice shots, ensuring each shot is properly detected and recorded. 
                  Aim for 10-20 shots per club for meaningful analysis. Include warm-up shots in your data.
                  Double-check that each shot has the correct club tag before moving to the next shot.
                </div>
              </div>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>7</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Export Your Session Data</div>
                <div style={stepDescriptionStyle}>
                  When finished, export your session data as a CSV file from your launch monitor software. 
                  Most systems allow export through the session summary or settings menu. Ensure the CSV 
                  file includes all shot data with club information.
                </div>
              </div>
            </div>

            <div style={stepStyle}>
              <div style={stepNumberStyle}>8</div>
              <div style={stepContentStyle}>
                <div style={stepTitleStyle}>Import Using Our Upload Feature</div>
                <div style={stepDescriptionStyle}>
                  Use our upload feature to import your CSV file. Select the correct launch monitor vendor, 
                  add session details, and upload. Our system will automatically process and standardize 
                  your data for comprehensive performance analysis.
                </div>
              </div>
            </div>
          </div>

          <Link to="/upload" style={ctaButtonStyle}>
            Upload Your First Session
          </Link>
        </div>
      ) : (
        <div style={sessionsGridStyle}>
          {history.map((session) => (
            <div key={session.batchId} style={sessionCardStyle}>
              <div style={sessionHeaderStyle}>
                <div style={sessionInfoStyle}>
                  <h3 style={sessionTitleStyle}>
                    {session.sessionName || 'Untitled Session'}
                  </h3>
                  <div style={sessionMetaStyle}>
                    <span>📅 {formatDate(session.uploadedAt)}</span>
                    <span>🎯 {session.shotCount} shots</span>
                    <span>📱 {session.vendor}</span>
                  </div>
                  {session.notes && session.notes !== 'No notes' && (
                    <p style={sessionNotesStyle}>"{session.notes}"</p>
                  )}
                </div>
                <div style={sessionActionsStyle}>
                  <Link
                    to={`/session/${session.batchId}`}
                    style={viewButtonStyle}
                  >
                    View
                  </Link>
                  <button
                    onClick={() => handleDeleteSession(session.batchId)}
                    disabled={deleting === session.batchId}
                    style={{
                      ...deleteButtonStyle,
                      opacity: deleting === session.batchId ? 0.5 : 1
                    }}
                  >
                    {deleting === session.batchId ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SessionHistory; 