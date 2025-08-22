import React from 'react';
import { useNavigate } from 'react-router-dom';
import { theme } from '../styles/theme';

function HomePage() {
  const navigate = useNavigate();

  const containerStyle = {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: theme.spacing.xl,
    fontFamily: theme.typography.fontFamily.body,
    backgroundColor: theme.colors.background.primary,
    minHeight: '100vh',
    color: theme.colors.text.primary
  };

  const heroStyle = {
    textAlign: 'center',
    marginBottom: theme.spacing['2xl'],
    padding: `${theme.spacing['2xl']} 0`
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['5xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.primary,
    marginBottom: theme.spacing.lg,
    lineHeight: theme.typography.lineHeights.relaxed,
    fontFamily: theme.typography.fontFamily.body
  };

  const descriptionStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    maxWidth: '800px',
    margin: '0 auto',
    fontFamily: theme.typography.fontFamily.body
  };

  const featuresStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: theme.spacing.xl,
    marginTop: theme.spacing['2xl']
  };

  const featureCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadows.md,
    border: `1px solid ${theme.colors.border}`,
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    cursor: 'pointer',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows.lg
    }
  };

  const featureTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const featureTextStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body
  };

  const ctaContainerStyle = {
    display: 'flex',
    gap: theme.spacing.md,
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: theme.spacing.lg
  };

  const ctaStyle = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    borderRadius: theme.borderRadius.md,
    border: 'none',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#009a47',
      boxShadow: theme.shadows.green,
      transform: 'translateY(-1px)'
    }
  };

  const secondaryCtaStyle = {
    backgroundColor: 'transparent',
    color: theme.colors.text.primary,
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: theme.colors.background.secondary,
      borderColor: theme.colors.primary
    }
  };

  return (
    <div style={containerStyle}>
      <div style={heroStyle}>
        <h1 style={titleStyle}>RYP Golf</h1>
        <p style={subtitleStyle}>Performance-Driven Golf Training</p>
        <p style={descriptionStyle}>
          Transform your golf game through innovative tools, expert coaching, and science-based protocols. 
          Our performance-driven approach combines biomechanics-based training with data-driven development 
          to help every golfer reach their full potential.
        </p>
        <div style={ctaContainerStyle}>
          <button 
            style={ctaStyle}
            onClick={() => navigate('/booking')}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = '#009a47';
              e.target.style.boxShadow = theme.shadows.green;
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = theme.colors.primary;
              e.target.style.boxShadow = 'none';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            Book Session
          </button>
          <button 
            style={secondaryCtaStyle}
            onClick={() => navigate('/programs')}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = theme.colors.background.secondary;
              e.target.style.borderColor = theme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.borderColor = theme.colors.border;
            }}
          >
            Explore Programs
          </button>

          <button 
            style={secondaryCtaStyle}
            onClick={() => navigate('/videos')}
            onMouseEnter={(e) => {
              e.target.style.backgroundColor = theme.colors.background.secondary;
              e.target.style.borderColor = theme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.borderColor = theme.colors.border;
            }}
          >
            Watch Videos
          </button>
        </div>
      </div>

      <div style={featuresStyle}>
        <div style={featureCardStyle}>
          <h3 style={featureTitleStyle}>Training Tools</h3>
          <p style={featureTextStyle}>
            Data-driven swing speed development tools like Rypstick and RypRadar for measurable improvement.
          </p>
        </div>
        
        <div style={featureCardStyle}>
          <h3 style={featureTitleStyle}>Expert Coaching</h3>
          <p style={featureTextStyle}>
            Elite-level coaching and instructional content from proven protocols used by Tour athletes.
          </p>
        </div>
        
        <div style={featureCardStyle}>
          <h3 style={featureTitleStyle}>Science-Based Protocols</h3>
          <p style={featureTextStyle}>
            Biomechanics-based training methodology that delivers real, lasting results without gimmicks.
          </p>
        </div>
      </div>
    </div>
  );
}

export default HomePage; 