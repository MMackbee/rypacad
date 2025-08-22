import React, { useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';
import TrainingProgress from '../components/TrainingProgress';
import DrivingStatsCard from '../components/DrivingStatsCard';
import CoachDashboardPage from './CoachDashboardPage';
import ParentDashboardPage from './ParentDashboardPage';
import AdminDashboardPage from './AdminDashboardPage';

function DashboardPage() {
  const { user, loading } = useUser();

  useEffect(() => {
    if (user && !loading) {
      // Check if user has completed account setup
      // if (!setupComplete) { // This line is removed as per the edit hint
      //   setShowAccountSetup(true); // This line is removed as per the edit hint
      // }
    }
  }, [user, loading]); // Removed setupComplete from dependency array

  // Removed handleAccountSetupComplete function

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: theme.spacing.xl,
    fontFamily: theme.typography.fontFamily.body,
    backgroundColor: theme.colors.background.primary,
    minHeight: '100vh',
    color: theme.colors.text.primary
  };

  const headerStyle = {
    textAlign: 'center',
    marginBottom: theme.spacing['2xl']
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body
  };

  const welcomeStyle = {
    fontSize: theme.typography.fontSizes.xl,
    color: theme.colors.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const actionsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing['2xl']
  };

  const actionCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    textDecoration: 'none',
    color: 'inherit'
  };

  const actionCardHoverStyle = {
    transform: 'translateY(-2px)',
    boxShadow: theme.shadows.lg,
    borderColor: theme.colors.primary
  };

  const actionTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    marginBottom: theme.spacing.sm,
    color: theme.colors.text.primary
  };

  const actionDescriptionStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal
  };

  const statsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing['2xl']
  };

  const statCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center'
  };

  const statValueStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm
  };

  const statLabelStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: theme.spacing['2xl'] }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: `4px solid ${theme.colors.border}`,
            borderTop: `4px solid ${theme.colors.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p>Loading dashboard...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Authentication is enforced by ProtectedRoute; no in-component redirect needed

  // If user is a coach, render the Coach Dashboard
  if (user.role === 'coach') {
    return <CoachDashboardPage />;
  }

  // If user is a parent, render the Parent Dashboard
  if (user.role === 'parent') {
    return <ParentDashboardPage />;
  }

  // If user is an admin, render the Admin Dashboard
  if (user.role === 'admin') {
    return <AdminDashboardPage />;
  }

  // Otherwise render the regular student dashboard
  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>RYP Golf Academy</h1>
        <p style={welcomeStyle}>
          Welcome back, {user.displayName || user.email}!
        </p>
        <p style={subtitleStyle}>
          Your personalized golf training journey starts here
        </p>
      </div>

      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <div style={statValueStyle}>12</div>
          <div style={statLabelStyle}>Lessons</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>+15</div>
          <div style={statLabelStyle}>Handicap Improvement</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>8</div>
          <div style={statLabelStyle}># of Lessons</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: theme.spacing.lg, marginBottom: theme.spacing['2xl'] }}>
        <DrivingStatsCard user={user} />
        <TrainingProgress />
      </div>

      <div style={actionsGridStyle}>
        <a href="/booking" style={actionCardStyle} onMouseEnter={(e) => {
          e.target.style.transform = actionCardHoverStyle.transform;
          e.target.style.boxShadow = actionCardHoverStyle.boxShadow;
          e.target.style.borderColor = actionCardHoverStyle.borderColor;
        }} onMouseLeave={(e) => {
          e.target.style.transform = 'none';
          e.target.style.boxShadow = 'none';
          e.target.style.borderColor = theme.colors.border;
        }}>
          <div style={actionTitleStyle}>Book a Session</div>
          <div style={actionDescriptionStyle}>
            Schedule your next training session with our expert coaches
          </div>
        </a>

        <a href="/my-bookings" style={actionCardStyle} onMouseEnter={(e) => {
          e.target.style.transform = actionCardHoverStyle.transform;
          e.target.style.boxShadow = actionCardHoverStyle.boxShadow;
          e.target.style.borderColor = actionCardHoverStyle.borderColor;
        }} onMouseLeave={(e) => {
          e.target.style.transform = 'none';
          e.target.style.boxShadow = 'none';
          e.target.style.borderColor = theme.colors.border;
        }}>
          <div style={actionTitleStyle}>My Bookings</div>
          <div style={actionDescriptionStyle}>
            View and manage your upcoming and past sessions
          </div>
        </a>

        <a href="/videos" style={actionCardStyle} onMouseEnter={(e) => {
          e.target.style.transform = actionCardHoverStyle.transform;
          e.target.style.boxShadow = actionCardHoverStyle.boxShadow;
          e.target.style.borderColor = actionCardHoverStyle.borderColor;
        }} onMouseLeave={(e) => {
          e.target.style.transform = 'none';
          e.target.style.boxShadow = 'none';
          e.target.style.borderColor = theme.colors.border;
        }}>
          <div style={actionTitleStyle}>Training Videos</div>
          <div style={actionDescriptionStyle}>
            Access your personalized training video library
          </div>
        </a>

        {/* Removed Build Package card; Programs hub serves discovery */}

        <a href="/sessions" style={actionCardStyle} onMouseEnter={(e) => {
          e.target.style.transform = actionCardHoverStyle.transform;
          e.target.style.boxShadow = actionCardHoverStyle.boxShadow;
          e.target.style.borderColor = actionCardHoverStyle.borderColor;
        }} onMouseLeave={(e) => {
          e.target.style.transform = 'none';
          e.target.style.boxShadow = 'none';
          e.target.style.borderColor = theme.colors.border;
        }}>
          <div style={actionTitleStyle}>Session History</div>
          <div style={actionDescriptionStyle}>
            Review your past sessions and track your progress
          </div>
        </a>

        <a href="/profile" style={actionCardStyle} onMouseEnter={(e) => {
          e.target.style.transform = actionCardHoverStyle.transform;
          e.target.style.boxShadow = actionCardHoverStyle.boxShadow;
          e.target.style.borderColor = actionCardHoverStyle.borderColor;
        }} onMouseLeave={(e) => {
          e.target.style.transform = 'none';
          e.target.style.boxShadow = 'none';
          e.target.style.borderColor = theme.colors.border;
        }}>
          <div style={actionTitleStyle}>Profile & Settings</div>
          <div style={actionDescriptionStyle}>
            Update your profile and manage your account settings
          </div>
        </a>
      </div>

      {/* Account Setup Modal - shows as overlay above dashboard */}
      {/* Removed AccountSetupModal component */}
    </div>
  );
}

export default DashboardPage; 