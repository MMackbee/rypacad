import React from 'react';
import { Link } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';

function UnauthorizedPage() {
  const { userRole } = useUser();

  const containerStyle = {
    maxWidth: '600px',
    margin: '0 auto',
    padding: theme.spacing.xl,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily.body,
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  };

  const cardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing['2xl'],
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.lg
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.error,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.lineHeights.normal
  };

  const roleInfoStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.xl
  };

  const roleTextStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm
  };

  const buttonStyle = {
    display: 'inline-block',
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    textDecoration: 'none',
    borderRadius: theme.borderRadius.md,
    fontWeight: theme.typography.fontWeights.semibold,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#009a47',
      transform: 'translateY(-1px)'
    }
  };

  const getRoleDescription = (role) => {
    switch (role) {
      case 'student':
        return 'You have access to book sessions, view your progress, and manage your training schedule.';
      case 'coach':
        return 'You have access to manage students, create sessions, and view coaching analytics.';
      case 'admin':
        return 'You have full system access including user management and system analytics.';
      default:
        return 'You have basic access to the platform.';
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Access Denied</h1>
        <p style={subtitleStyle}>
          You don't have permission to access this page. Please contact an administrator if you believe this is an error.
        </p>

        <div style={roleInfoStyle}>
          <p style={roleTextStyle}>
            <strong>Current Role:</strong> {userRole || 'Unknown'}
          </p>
          <p style={roleTextStyle}>
            <strong>Your Access:</strong> {getRoleDescription(userRole)}
          </p>
        </div>

        <Link to="/dashboard" style={buttonStyle}>
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

export default UnauthorizedPage;
