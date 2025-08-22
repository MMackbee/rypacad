import React from 'react';
import CSVUploader from '../components/CSVUploader';
import { theme } from '../styles/theme';

const DataUploadPage = ({ user }) => {
  const handleUploadComplete = (data) => {
    console.log('Upload completed:', data.length, 'shots uploaded');
    // You can add additional logic here like redirecting to session view
  };

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

  const cardStyle = {
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadows.md,
    padding: theme.spacing.xl,
    border: `1px solid ${theme.colors.border}`
  };

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <div style={cardStyle}>
          <CSVUploader user={user} onUploadComplete={handleUploadComplete} />
        </div>
      </div>
    </div>
  );
};

export default DataUploadPage; 