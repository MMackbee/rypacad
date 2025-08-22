import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../styles/theme';

function ProgramListPage() {
  const [selectedCategory, setSelectedCategory] = useState('youth');

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
    fontFamily: theme.typography.fontFamily.body,
    marginBottom: theme.spacing.xl
  };

  const categoryTabsStyle = {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
    gap: theme.spacing.md
  };

  const categoryTabStyle = {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.secondary,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    fontWeight: theme.typography.fontWeights.medium,
    transition: 'all 0.2s ease'
  };

  const activeCategoryTabStyle = {
    ...categoryTabStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderColor: theme.colors.primary
  };

  const programsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: theme.spacing.xl
  };

  const programCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    boxShadow: theme.shadows.md,
    border: `1px solid ${theme.colors.border}`,
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    textDecoration: 'none',
    color: 'inherit',
    display: 'block',
    position: 'relative',
    overflow: 'hidden'
  };

  const programTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const programSubtitleStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body,
    fontStyle: 'italic'
  };

  const programDescriptionStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body
  };

  const programFeaturesStyle = {
    listStyle: 'none',
    padding: 0,
    margin: '0 0 20px 0'
  };

  const featureItemStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
    paddingLeft: theme.spacing.sm,
    position: 'relative',
    fontFamily: theme.typography.fontFamily.body
  };

  const priceStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginTop: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const priceNoteStyle = {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.text.secondary,
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.body
  };

  const youthPrograms = [
    {
      id: 'youth-starter',
      title: 'Starter',
      subtitle: 'Perfect for beginners',
      description: 'Ideal for young golfers starting their journey. Build fundamental skills and develop a love for the game.',
      features: [
        '4 Sessions per Month',
        '2 Tournaments per Month',
        'Professional coaching',
        'Equipment provided',
        'Progress tracking'
      ],
      price: '$200',
      period: 'per month'
    },
    {
      id: 'youth-developer',
      title: 'Developer',
      subtitle: 'For improving players',
      description: 'Take your game to the next level with more intensive training and competitive opportunities.',
      features: [
        '8 Sessions per Month',
        '3 Tournaments per Month',
        'Advanced skill development',
        'Video analysis',
        'Mental game training'
      ],
      price: '$380',
      period: 'per month'
    },
    {
      id: 'youth-elite',
      title: 'Elite',
      subtitle: 'For serious competitors',
      description: 'Maximum training and tournament exposure for players committed to competitive golf.',
      features: [
        '12 Sessions per Month',
        '4 Tournaments per Month',
        'Elite coaching',
        'Performance analytics',
        'Tournament preparation'
      ],
      price: '$540',
      period: 'per month'
    },
    {
      id: 'youth-champion',
      title: 'Champion',
      subtitle: 'For tournament champions',
      description: 'The ultimate option for players aiming for championship success and college golf opportunities.',
      features: [
        '16 Sessions per Month',
        '4 Tournaments per Month',
        'Championship coaching',
        'Advanced analytics',
        'College prep guidance'
      ],
      price: '$680',
      period: 'per month'
    },
    {
      id: 'youth-casual',
      title: 'Casual Session',
      subtitle: 'One-off training',
      description: 'Perfect for trying out our coaching or for occasional training sessions.',
      features: [
        'Single session',
        'Professional coaching',
        'Equipment provided',
        'Skill assessment',
        'Flexible scheduling'
      ],
      price: '$50',
      period: 'one-off'
    }
  ];

  const adultPrograms = [
    {
      id: 'adult-starter',
      title: 'Starter',
      subtitle: 'Perfect for beginners',
      description: 'Ideal for adult golfers starting their journey. Build fundamental skills and develop a love for the game.',
      features: [
        '4 Sessions per Month',
        '2 Tournaments per Month',
        'Professional coaching',
        'Equipment provided',
        'Progress tracking'
      ],
      price: '$240',
      period: 'per month'
    },
    {
      id: 'adult-developer',
      title: 'Developer',
      subtitle: 'For improving players',
      description: 'Take your game to the next level with more intensive training and competitive opportunities.',
      features: [
        '8 Sessions per Month',
        '3 Tournaments per Month',
        'Advanced skill development',
        'Video analysis',
        'Mental game training'
      ],
      price: '$456',
      period: 'per month'
    },
    {
      id: 'adult-elite',
      title: 'Elite',
      subtitle: 'For serious competitors',
      description: 'Maximum training and tournament exposure for adult players committed to competitive golf.',
      features: [
        '12 Sessions per Month',
        '4 Tournaments per Month',
        'Elite coaching',
        'Performance analytics',
        'Tournament preparation'
      ],
      price: '$648',
      period: 'per month'
    },
    {
      id: 'adult-champion',
      title: 'Champion',
      subtitle: 'For tournament champions',
      description: 'The ultimate option for adult players aiming for championship success and competitive golf opportunities.',
      features: [
        '16 Sessions per Month',
        '4 Tournaments per Month',
        'Championship coaching',
        'Advanced analytics',
        'Tournament prep guidance'
      ],
      price: '$816',
      period: 'per month'
    },
    {
      id: 'adult-casual',
      title: 'Casual Session',
      subtitle: 'One-off training',
      description: 'Perfect for trying out our coaching or for occasional training sessions.',
      features: [
        'Single session',
        'Professional coaching',
        'Equipment provided',
        'Skill assessment',
        'Flexible scheduling'
      ],
      price: '$60',
      period: 'one-off'
    }
  ];

  const addOnPrograms = [
    {
      id: 'ryp-academy-starter',
      title: 'RYP Academy Starter',
      subtitle: 'Basic fitness training',
      description: '4 sessions per month of golf-specific strength training',
      features: [
        '4 Sessions per Month',
        'Golf-specific strength training',
        'Core and stability work',
        'Flexibility and mobility',
        'Progress tracking'
      ],
      price: '$120',
      period: 'per month'
    },
    {
      id: 'ryp-academy-developer',
      title: 'RYP Academy Developer',
      subtitle: 'Intermediate fitness program',
      description: '8 sessions per month of advanced strength training',
      features: [
        '8 Sessions per Month',
        'Advanced strength training',
        'Power development',
        'Recovery protocols',
        'Performance analytics'
      ],
      price: '$200',
      period: 'per month'
    },
    {
      id: 'mental-starter',
      title: 'Mental Performance Starter',
      subtitle: 'Foundation mental skills',
      description: '2 sessions per month of mental game training',
      features: [
        '2 Mental performance sessions',
        'Focus training',
        'Stress management',
        'Goal setting',
        'Mindfulness techniques'
      ],
      price: '$100',
      period: 'per month'
    },
    {
      id: 'mental-developer',
      title: 'Mental Performance Developer',
      subtitle: 'Advanced mental training',
      description: '4 sessions per month of elite mental training',
      features: [
        '4 Mental performance sessions',
        'Pressure simulation',
        'Competition psychology',
        'Visualization training',
        'Performance routines'
      ],
      price: '$150',
      period: 'per month'
    },
    {
      id: 'tournament-prep',
      title: 'Tournament Prep',
      subtitle: 'Custom mental game planning',
      description: 'Personalized mental game strategy for specific tournaments',
      features: [
        'Pre-tournament consultation',
        'Custom mental game plan',
        'Course-specific strategy',
        'Pressure management techniques',
        'Post-tournament review'
      ],
      price: '$400',
      period: 'per tournament'
    }
  ];

  const currentPrograms = selectedCategory === 'youth' ? youthPrograms : adultPrograms;

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Coaching Packages</h1>
        <p style={subtitleStyle}>
          Choose the perfect coaching package for your golf journey. All packages include professional instruction, 
          tournament opportunities, and progress tracking.
        </p>
        <div style={{ marginTop: theme.spacing.lg }}>
          <Link 
            to="/package-builder"
            style={{
              display: 'inline-block',
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              backgroundColor: theme.colors.secondary,
              color: theme.colors.text.dark,
              textDecoration: 'none',
              borderRadius: theme.borderRadius.md,
              fontWeight: theme.typography.fontWeights.semibold,
              fontSize: theme.typography.fontSizes.base,
              fontFamily: theme.typography.fontFamily.body,
              transition: 'all 0.2s ease',
              boxShadow: theme.shadows.md
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = theme.shadows.lg;
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = theme.shadows.md;
            }}
          >
            🎯 Build Custom Package with Add-ons
          </Link>
        </div>
      </div>

      <div style={categoryTabsStyle}>
        <button
          style={selectedCategory === 'youth' ? activeCategoryTabStyle : categoryTabStyle}
          onClick={() => setSelectedCategory('youth')}
        >
          Youth Programs (Ages 6-17)
        </button>
        <button
          style={selectedCategory === 'adult' ? activeCategoryTabStyle : categoryTabStyle}
          onClick={() => setSelectedCategory('adult')}
        >
          Adult Programs (18+)
        </button>
        <button
          style={selectedCategory === 'addons' ? activeCategoryTabStyle : categoryTabStyle}
          onClick={() => setSelectedCategory('addons')}
        >
          Add-On Programs
        </button>
      </div>

      {selectedCategory === 'addons' ? (
        <div>
          <h2 style={{ 
            fontSize: theme.typography.fontSizes.xl, 
            textAlign: 'center', 
            marginBottom: theme.spacing.lg,
            color: theme.colors.text.primary,
            fontFamily: theme.typography.fontFamily.headline
          }}>
            Performance Enhancement Programs
          </h2>
          <p style={{ 
            textAlign: 'center', 
            marginBottom: theme.spacing.xl,
            color: theme.colors.text.secondary,
            fontFamily: theme.typography.fontFamily.body
          }}>
            Enhance your golf coaching with specialized fitness training, mental performance coaching, and indoor walkthroughs.
          </p>
          <div style={programsGridStyle}>
            {addOnPrograms.map((program) => (
              <div 
                key={program.id} 
                style={programCardStyle}
                onMouseEnter={(e) => {
                  e.target.style.transform = 'translateY(-4px)';
                  e.target.style.boxShadow = theme.shadows.lg;
                  e.target.style.borderColor = theme.colors.secondary;
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = theme.shadows.md;
                  e.target.style.borderColor = theme.colors.border;
                }}
              >
                <h3 style={programTitleStyle}>{program.title}</h3>
                <p style={programSubtitleStyle}>{program.subtitle}</p>
                <p style={programDescriptionStyle}>
                  {program.description}
                </p>
                <ul style={programFeaturesStyle}>
                  {program.features.map((feature, index) => (
                    <li key={index} style={featureItemStyle}>• {feature}</li>
                  ))}
                </ul>
                <div style={priceStyle}>{program.price} {program.period}</div>
                <div style={priceNoteStyle}>* Available as add-on to coaching packages</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div style={programsGridStyle}>
          {currentPrograms.map((program) => (
            <Link 
              key={program.id} 
              to={`/programs/${program.id}`} 
              style={programCardStyle}
              onMouseEnter={(e) => {
                e.target.style.transform = 'translateY(-4px)';
                e.target.style.boxShadow = theme.shadows.lg;
                e.target.style.borderColor = theme.colors.primary;
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = theme.shadows.md;
                e.target.style.borderColor = theme.colors.border;
              }}
            >
              <h3 style={programTitleStyle}>{program.title}</h3>
              <p style={programSubtitleStyle}>{program.subtitle}</p>
              <p style={programDescriptionStyle}>
                {program.description}
              </p>
              <ul style={programFeaturesStyle}>
                {program.features.map((feature, index) => (
                  <li key={index} style={featureItemStyle}>• {feature}</li>
                ))}
              </ul>
              <div style={priceStyle}>{program.price} {program.period}</div>
              {selectedCategory === 'adult' && (
                <div style={priceNoteStyle}>* 20% premium for adult programs</div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default ProgramListPage; 