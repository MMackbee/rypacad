import React, { useEffect } from 'react';
import SignInButton from '../components/SignInButton';
import { theme } from '../styles/theme';
import { useUser } from '../contexts/UserContext';
import { useNavigate } from 'react-router-dom';

function LoginPage() {
  const { isAuthenticated, loading } = useUser();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, loading, navigate]);
  const containerStyle = {
    maxWidth: '500px',
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
    boxShadow: theme.shadows.lg,
    border: `1px solid ${theme.colors.border}`,
    width: '100%'
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
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xl,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body
  };

  const buttonContainerStyle = {
    marginTop: theme.spacing.xl
  };

  const registerLinkStyle = {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background.primary
  };

  const registerTextStyle = {
    color: theme.colors.text.secondary,
    fontSize: theme.typography.fontSizes.sm,
    marginBottom: theme.spacing.sm
  };

  const registerButtonStyle = {
    color: theme.colors.primary,
    textDecoration: 'none',
    fontWeight: theme.typography.fontWeights.semibold,
    fontSize: theme.typography.fontSizes.base
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <h1 style={titleStyle}>Welcome to RYP Golf</h1>
        <p style={subtitleStyle}>
          Sign in to access your performance dashboard and continue your golf development journey with data-driven training.
        </p>
        <div style={buttonContainerStyle}>
          <SignInButton />
        </div>
        
        <div style={registerLinkStyle}>
          <p style={registerTextStyle}>New to RYP Golf Academy?</p>
          <a href="/register" style={registerButtonStyle}>
            Create your account
          </a>
        </div>
      </div>
    </div>
  );
}

export default LoginPage; 