import React from 'react';
import SessionHistory from '../components/SessionHistory';
import { theme } from '../styles/theme';

const SessionsPage = ({ user }) => {
  const containerStyle = {
    minHeight: '100vh',
    backgroundColor: theme.colors.background.primary,
    padding: `${theme.spacing.xl} 0`,
    fontFamily: theme.typography.fontFamily.body,
    color: theme.colors.text.primary
  };

  const contentStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: `0 ${theme.spacing.lg}`
  };

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <SessionHistory user={user} />
      </div>
    </div>
  );
};

export default SessionsPage; 