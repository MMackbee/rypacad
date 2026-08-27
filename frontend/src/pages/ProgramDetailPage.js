import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { theme } from '../styles/theme';

function ProgramDetailPage() {
  const { programId } = useParams();
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('overview');

  // Updated program data with new coaching packages
  const programData = {
    // Youth Programs
    'youth-starter': {
      id: 'youth-starter',
      title: 'Starter',
      subtitle: 'Perfect for beginners',
      category: 'Youth (Ages 6-17)',
      description: 'Ideal for young golfers starting their journey. Build fundamental skills and develop a love for the game through structured coaching and fun tournament experiences.',
      duration: 'Monthly',
      difficulty: 'Beginner',
      price: '$200',
      period: 'per month',
      features: [
        '4 Sessions per Month',
        '2 Tournaments per Month',
        'Professional coaching',
        'Equipment provided',
        'Progress tracking',
        'Age-appropriate instruction',
        'Fun, engaging environment'
      ],
      curriculum: [
        {
          week: 1,
          title: 'Foundation Skills',
          description: 'Learn basic grip, stance, and swing fundamentals'
        },
        {
          week: 2,
          title: 'Short Game Basics',
          description: 'Master putting and chipping techniques'
        },
        {
          week: 3,
          title: 'Full Swing Development',
          description: 'Build consistent swing mechanics'
        },
        {
          week: 4,
          title: 'Course Introduction',
          description: 'Learn course etiquette and basic strategy'
        }
      ],
      testimonials: [
        {
          name: 'Emma Johnson',
          age: '12',
          text: 'I love coming to practice! The coaches make it so fun and I\'m getting so much better.'
        },
        {
          name: 'Michael Chen',
          age: '10',
          text: 'My first tournament was amazing! I made new friends and learned so much.'
        }
      ]
    },
    'youth-developer': {
      id: 'youth-developer',
      title: 'Developer',
      subtitle: 'For improving players',
      category: 'Youth (Ages 6-17)',
      description: 'Take your game to the next level with more intensive training and competitive opportunities. Perfect for players ready to advance their skills.',
      duration: 'Monthly',
      difficulty: 'Intermediate',
      price: '$380',
      period: 'per month',
      features: [
        '8 Sessions per Month',
        '3 Tournaments per Month',
        'Advanced skill development',
        'Video analysis',
        'Mental game training',
        'Performance tracking',
        'Competitive preparation'
      ],
      curriculum: [
        {
          week: 1,
          title: 'Advanced Mechanics',
          description: 'Refine swing technique and ball striking'
        },
        {
          week: 2,
          title: 'Course Management',
          description: 'Learn strategic thinking and shot selection'
        },
        {
          week: 3,
          title: 'Mental Toughness',
          description: 'Develop focus and competitive mindset'
        },
        {
          week: 4,
          title: 'Tournament Skills',
          description: 'Practice under competitive conditions'
        }
      ],
      testimonials: [
        {
          name: 'Alex Rodriguez',
          age: '15',
          text: 'The video analysis helped me see exactly what I needed to fix. My scores improved dramatically.'
        },
        {
          name: 'Sophie Williams',
          age: '14',
          text: 'I love the extra practice time and tournament experience. It\'s really helping my game.'
        }
      ]
    },
    'youth-elite': {
      id: 'youth-elite',
      title: 'Elite',
      subtitle: 'For serious competitors',
      category: 'Youth (Ages 6-17)',
      description: 'Maximum training and tournament exposure for players committed to competitive golf. Designed for serious young athletes.',
      duration: 'Monthly',
      difficulty: 'Advanced',
      price: '$540',
      period: 'per month',
      features: [
        '12 Sessions per Month',
        '4 Tournaments per Month',
        'Elite coaching',
        'Performance analytics',
        'Tournament preparation',
        'Advanced equipment access',
        'College prep guidance'
      ],
      curriculum: [
        {
          week: 1,
          title: 'Elite Training',
          description: 'High-intensity practice and skill refinement'
        },
        {
          week: 2,
          title: 'Performance Analysis',
          description: 'Advanced data tracking and improvement strategies'
        },
        {
          week: 3,
          title: 'Competition Prep',
          description: 'Tournament-specific training and mental preparation'
        },
        {
          week: 4,
          title: 'Advanced Strategy',
          description: 'Course management and competitive tactics'
        }
      ],
      testimonials: [
        {
          name: 'Jordan Smith',
          age: '16',
          text: 'The elite option is perfect for serious players. I\'ve seen huge improvements in my tournament results.'
        },
        {
          name: 'Taylor Davis',
          age: '17',
          text: 'The college prep guidance is invaluable. I feel ready for the next level.'
        }
      ]
    },
    'youth-champion': {
      id: 'youth-champion',
      title: 'Champion',
      subtitle: 'For tournament champions',
      category: 'Youth (Ages 6-17)',
      description: 'The ultimate option for players aiming for championship success and college golf opportunities. Maximum training and support.',
      duration: 'Monthly',
      difficulty: 'Elite',
      price: '$680',
      period: 'per month',
      features: [
        '16 Sessions per Month',
        '4 Tournaments per Month',
        'Championship coaching',
        'Advanced analytics',
        'College prep guidance',
        'Personalized training plans',
        'Tournament travel support'
      ],
      curriculum: [
        {
          week: 1,
          title: 'Championship Training',
          description: 'Elite-level practice and skill mastery'
        },
        {
          week: 2,
          title: 'Advanced Analytics',
          description: 'Comprehensive performance tracking and analysis'
        },
        {
          week: 3,
          title: 'Tournament Excellence',
          description: 'Championship-level preparation and execution'
        },
        {
          week: 4,
          title: 'Future Planning',
          description: 'College recruitment and career development'
        }
      ],
      testimonials: [
        {
          name: 'Cameron Wilson',
          age: '17',
          text: 'This option helped me win the state championship and get recruited by a top college program.'
        },
        {
          name: 'Riley Johnson',
          age: '16',
          text: 'The personalized attention and tournament support is incredible. I\'m achieving my goals faster than ever.'
        }
      ]
    },
    'youth-casual': {
      id: 'youth-casual',
      title: 'Casual Session',
      subtitle: 'One-off training',
      category: 'Youth (Ages 6-17)',
      description: 'Perfect for trying out our coaching or for occasional training sessions. Flexible scheduling to fit your needs.',
      duration: 'Single Session',
      difficulty: 'All Levels',
      price: '$50',
      period: 'one-off',
      features: [
        'Single session',
        'Professional coaching',
        'Equipment provided',
        'Skill assessment',
        'Flexible scheduling',
        'No commitment required'
      ],
      curriculum: [
        {
          week: 1,
          title: 'Skill Assessment',
          description: 'Evaluate current abilities and identify areas for improvement'
        },
        {
          week: 2,
          title: 'Focused Instruction',
          description: 'Targeted coaching on specific skills or techniques'
        },
        {
          week: 3,
          title: 'Practice Guidance',
          description: 'Learn effective practice methods and drills'
        },
        {
          week: 4,
          title: 'Next Steps',
          description: 'Recommendations for continued improvement'
        }
      ],
      testimonials: [
        {
          name: 'Lucas Brown',
          age: '13',
          text: 'Great way to try out coaching without a big commitment. I learned so much in just one session!'
        },
        {
          name: 'Ava Garcia',
          age: '11',
          text: 'Perfect for when I can\'t commit to a full month. The coaches are so helpful.'
        }
      ]
    }
  };

  const program = programData[programId];

  if (!program) {
    return (
      <div style={{ padding: theme.spacing.xl, textAlign: 'center' }}>
        <h2>Program not found</h2>
        <button 
          onClick={() => navigate('/programs')}
          style={{
            backgroundColor: theme.colors.primary,
            color: theme.colors.text.dark,
            padding: `${theme.spacing.sm} ${theme.spacing.md}`,
            border: 'none',
            borderRadius: theme.borderRadius.md,
            cursor: 'pointer',
            marginTop: theme.spacing.md
          }}
        >
          Back to Programs
        </button>
      </div>
    );
  }

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
    marginBottom: theme.spacing.xl
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['4xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const categoryStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body
  };

  const descriptionStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.body
  };

  const statsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xl
  };

  const statCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center'
  };

  const statValueStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const statLabelStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const tabContainerStyle = {
    display: 'flex',
    marginBottom: theme.spacing.xl,
    borderBottom: `1px solid ${theme.colors.border}`
  };

  const tabStyle = {
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.secondary,
    border: 'none',
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    borderBottom: `2px solid transparent`,
    transition: 'all 0.2s ease'
  };

  const activeTabStyle = {
    ...tabStyle,
    color: theme.colors.primary,
    borderBottom: `2px solid ${theme.colors.primary}`
  };

  const contentStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const featureListStyle = {
    listStyle: 'none',
    padding: 0,
    margin: 0
  };

  const featureItemStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    position: 'relative',
    fontFamily: theme.typography.fontFamily.body
  };

  const curriculumItemStyle = {
    marginBottom: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`
  };

  const curriculumWeekStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semibold,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const curriculumTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const testimonialStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
  };

  const testimonialNameStyle = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.body
  };

  const testimonialAgeStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const ctaButtonStyle = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    borderRadius: theme.borderRadius.md,
    border: 'none',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const renderContent = () => {
    switch (selectedTab) {
      case 'overview':
        return (
          <div>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              What's Included
            </h3>
            <ul style={featureListStyle}>
              {program.features.map((feature, index) => (
                <li key={index} style={featureItemStyle}>✓ {feature}</li>
              ))}
            </ul>
            <div style={{ marginTop: theme.spacing.xl }}>
              <button style={ctaButtonStyle}>Enroll Now - {program.price} {program.period}</button>
            </div>
          </div>
        );
      case 'curriculum':
        return (
          <div>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Program Curriculum
            </h3>
            {program.curriculum.map((week, index) => (
              <div key={index} style={curriculumItemStyle}>
                <div style={curriculumWeekStyle}>Week {week.week}</div>
                <div style={curriculumTitleStyle}>{week.title}</div>
                <div style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.fontFamily.body }}>
                  {week.description}
                </div>
              </div>
            ))}
          </div>
        );
      case 'testimonials':
        return (
          <div>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Student Success Stories
            </h3>
            {program.testimonials.map((testimonial, index) => (
              <div key={index} style={testimonialStyle}>
                <div style={testimonialNameStyle}>{testimonial.name}</div>
                <div style={testimonialAgeStyle}>Age: {testimonial.age}</div>
                <div style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.fontFamily.body, fontStyle: 'italic' }}>
                  "{testimonial.text}"
                </div>
              </div>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>{program.title}</h1>
        <p style={subtitleStyle}>{program.subtitle}</p>
        <p style={categoryStyle}>{program.category}</p>
        <p style={descriptionStyle}>{program.description}</p>
      </div>

      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{program.duration}</div>
          <div style={statLabelStyle}>Duration</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{program.difficulty}</div>
          <div style={statLabelStyle}>Level</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>{program.price} {program.period}</div>
          <div style={statLabelStyle}>Investment</div>
        </div>
      </div>

      <div style={tabContainerStyle}>
        <button 
          style={selectedTab === 'overview' ? activeTabStyle : tabStyle}
          onClick={() => setSelectedTab('overview')}
        >
          Overview
        </button>
        <button 
          style={selectedTab === 'curriculum' ? activeTabStyle : tabStyle}
          onClick={() => setSelectedTab('curriculum')}
        >
          Curriculum
        </button>
        <button 
          style={selectedTab === 'testimonials' ? activeTabStyle : tabStyle}
          onClick={() => setSelectedTab('testimonials')}
        >
          Testimonials
        </button>
      </div>

      <div style={contentStyle}>
        {renderContent()}
      </div>
    </div>
  );
}

export default ProgramDetailPage; 