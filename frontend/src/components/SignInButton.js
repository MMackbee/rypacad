import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, provider } from '../firebase';
import { signInWithPopup } from 'firebase/auth';
import { theme } from '../styles/theme';
import { useUser } from '../contexts/UserContext';

function SignInButton() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const { refreshUser } = useUser();

  const handleSignIn = async () => {
    setIsLoading(true);
    setError('');
    
    try {
      console.log('Attempting Google sign-in...');
      const result = await signInWithPopup(auth, provider);
      console.log('User signed in successfully:', result.user);

      // Ensure context updates before navigating
      try {
        await refreshUser();
      } catch (e) {
        // non-fatal
      }
      navigate('/dashboard', { replace: true });
    } catch (error) {
      console.error('Sign-in error:', error);
      
      // Provide specific error messages
      if (error.code === 'auth/popup-closed-by-user') {
        setError('Sign-in was cancelled. Please try again.');
      } else if (error.code === 'auth/popup-blocked') {
        setError('Pop-up was blocked. Please allow pop-ups for this site.');
      } else if (error.code === 'auth/unauthorized-domain') {
        setError('This domain is not authorized for sign-in. Please contact support.');
      } else {
        setError(`Sign-in failed: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const buttonStyle = {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: isLoading ? 'not-allowed' : 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    letterSpacing: '0.05em',
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    boxShadow: theme.shadows.sm,
    opacity: isLoading ? 0.7 : 1,
    ':hover': {
      backgroundColor: isLoading ? theme.colors.primary : '#009a47',
      transform: isLoading ? 'none' : 'translateY(-1px)',
      boxShadow: isLoading ? theme.shadows.sm : theme.shadows.green
    }
  };

  const errorStyle = {
    color: theme.colors.error,
    fontSize: theme.typography.fontSizes.sm,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily.body
  };

  return (
    <div>
      <button
        onClick={handleSignIn}
        disabled={isLoading}
        style={buttonStyle}
      >
        {isLoading ? 'Signing in...' : 'Sign in with Google'}
      </button>
      {error && <p style={errorStyle}>{error}</p>}
    </div>
  );
}

export default SignInButton; 