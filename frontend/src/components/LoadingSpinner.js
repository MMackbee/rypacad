import React from 'react';
import { theme } from '../styles/theme';

const LoadingSpinner = ({ 
  message = 'Loading...', 
  size = 'medium',
  fullScreen = false 
}) => {
  const sizeMap = {
    small: '20px',
    medium: '40px',
    large: '60px'
  };

  const spinnerSize = sizeMap[size] || sizeMap.medium;

  const containerStyle = fullScreen ? {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    fontFamily: theme.typography.fontFamily.body
  } : {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
    fontFamily: theme.typography.fontFamily.body
  };

  const contentStyle = {
    textAlign: 'center',
    color: theme.colors.text.secondary
  };

  const spinnerStyle = {
    width: spinnerSize,
    height: spinnerSize,
    border: `4px solid ${theme.colors.border}`,
    borderTop: `4px solid ${theme.colors.primary}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    margin: '0 auto 16px'
  };

  const messageStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    margin: 0
  };

  return (
    <div style={containerStyle}>
      <div style={contentStyle}>
        <div style={spinnerStyle}></div>
        <p style={messageStyle}>{message}</p>
      </div>
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;

