import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { theme } from '../styles/theme';

function MentalPerformancePage() {
  const [selectedPackage, setSelectedPackage] = useState(null);

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
    marginBottom: theme.spacing.lg
  };

  const heroSectionStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.xl,
    textAlign: 'center'
  };

  const heroTitleStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const heroSubtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.body
  };

  const importantNoteStyle = {
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    border: `1px solid #ffc107`,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.xl
  };

  const importantNoteTitleStyle = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#856404',
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const importantNoteTextStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: '#856404',
    fontFamily: theme.typography.fontFamily.body
  };

  const contentGridStyle = {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: theme.spacing.xl
  };

  const mainContentStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const sidebarStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    height: 'fit-content',
    position: 'sticky',
    top: theme.spacing.xl
  };

  const sectionTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline
  };

  const sectionTextStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body
  };

  const benefitsListStyle = {
    listStyle: 'none',
    padding: 0,
    margin: '20px 0'
  };

  const benefitItemStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
    paddingLeft: theme.spacing.md,
    position: 'relative',
    fontFamily: theme.typography.fontFamily.body
  };

  const coachCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
  };

  const credentialsListStyle = {
    listStyle: 'none',
    padding: 0,
    margin: 0
  };

  const credentialItemStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
    paddingLeft: theme.spacing.sm,
    position: 'relative',
    fontFamily: theme.typography.fontFamily.body
  };

  const stepCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
  };

  const stepTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const stepPriceStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const packageGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.lg
  };

  const packageCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const selectedPackageCardStyle = {
    ...packageCardStyle,
    borderColor: theme.colors.primary,
    backgroundColor: 'rgba(0, 175, 81, 0.05)'
  };

  const packageNameStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const packageDetailsStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const packagePriceStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const packageRateStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const addOnSectionStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
  };

  const addOnTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const addOnPriceStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const ctaButtonStyle = {
    display: 'inline-block',
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    textDecoration: 'none',
    borderRadius: theme.borderRadius.md,
    fontWeight: theme.typography.fontWeights.semibold,
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    marginTop: theme.spacing.md
  };

  const freeCallStyle = {
    backgroundColor: 'rgba(0, 175, 81, 0.1)',
    border: `1px solid ${theme.colors.primary}`,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    textAlign: 'center',
    marginTop: theme.spacing.xl
  };

  const freeCallTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const freeCallTextStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body
  };

  const followUpPackages = [
    {
      id: 'starter',
      name: 'Mental Game Starter',
      sessions: '2 x 1-hour sessions',
      price: 370,
      avgRate: 185,
      discount: '7.5%'
    },
    {
      id: 'consistent',
      name: 'Consistent Performer',
      sessions: '5 x 1-hour sessions',
      price: 850,
      avgRate: 170,
      discount: '15%'
    },
    {
      id: 'peak',
      name: 'Peak Performance Pathway',
      sessions: '9 x 1-hour sessions',
      price: 1350,
      avgRate: 150,
      discount: '25%'
    }
  ];

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Mental Performance Coaching</h1>
        <p style={subtitleStyle}>
          Book Mental Performance Coaching with Coach Yannick (Online and/or In-Person)
        </p>
      </div>

      <div style={importantNoteStyle}>
        <div style={importantNoteTitleStyle}>IMPORTANT NOTE:</div>
        <div style={importantNoteTextStyle}>
          To begin mental performance sessions, please purchase the INTAKE SESSION FIRST, then purchase the follow-up sessions after completing the intake session.
        </div>
      </div>

      <div style={heroSectionStyle}>
        <h2 style={heroTitleStyle}>Train Your Mind Like You Train Your Swing</h2>
        <p style={heroSubtitleStyle}>
          Unlock consistency, focus, and resilience on the golf course with customized mental performance coaching from Yannick Artigolle, RYP Golf's Mental Performance Coach. Whether you're struggling to close out rounds, rebound from mistakes, or trust your game under pressure, this is where you train the mindset behind great golf.
        </p>
        <p style={heroSubtitleStyle}>
          Yannick combines real tournament experience with cutting-edge mental strategies based in ACT (Acceptance and Commitment Therapy) and sport psychology. These sessions aren't about "thinking positive"—they're about performing with confidence and purpose when it matters most.
        </p>
      </div>

      <div style={contentGridStyle}>
        <div style={mainContentStyle}>
          <h3 style={sectionTitleStyle}>What You'll Learn</h3>
          <ul style={benefitsListStyle}>
            <li style={benefitItemStyle}>• Build your reset routine to recover quickly after mistakes</li>
            <li style={benefitItemStyle}>• Strengthen confidence, focus, and composure</li>
            <li style={benefitItemStyle}>• Manage nerves and pressure in tournament environments</li>
            <li style={benefitItemStyle}>• Develop clear routines and decision-making processes</li>
            <li style={benefitItemStyle}>• Learn to transfer your range game to competition</li>
          </ul>

          <div style={coachCardStyle}>
            <h3 style={sectionTitleStyle}>About Coach Yannick</h3>
            <ul style={credentialsListStyle}>
              <li style={credentialItemStyle}>• Former NCAA Division I Golfer at Northwestern University</li>
              <li style={credentialItemStyle}>• Master's in Sport, Exercise, and Performance Psychology</li>
              <li style={credentialItemStyle}>• RYP Golf's Mental Performance Coach</li>
              <li style={credentialItemStyle}>• Specializes in junior and competitive amateur athletes</li>
              <li style={credentialItemStyle}>• Uses ACT, CBT, and performance psychology tools</li>
              <li style={credentialItemStyle}>• Certified Mental Performance Consultant Applicant (CMPC-in-progress)</li>
            </ul>
          </div>

          <h3 style={sectionTitleStyle}>How to Begin</h3>
          
          <div style={stepCardStyle}>
            <h4 style={stepTitleStyle}>Step 1: Book Your Initial Intake Session</h4>
            <div style={stepPriceStyle}>Initial Intake (1.5 hours): $250</div>
            <p style={sectionTextStyle}>
              This foundational session includes:
            </p>
            <ul style={benefitsListStyle}>
              <li style={benefitItemStyle}>• Mental game assessment</li>
              <li style={benefitItemStyle}>• Performance profiling</li>
              <li style={benefitItemStyle}>• Goal-setting and training plan</li>
            </ul>
            <p style={sectionTextStyle}>
              <strong>💬 Important:</strong> If you decide not to continue coaching, simply notify Coach Yannick within 3 business days after your intake. In that case, the $250 fee will be waived. If you choose to continue with coaching after those 3 days, the fee will be applied and follow-up sessions can be scheduled.
            </p>
            <Link to="/booking" style={ctaButtonStyle}>
              Book Intake Session - $250
            </Link>
          </div>

          <div style={stepCardStyle}>
            <h4 style={stepTitleStyle}>Step 2: Choose a Follow-Up Option</h4>
            <p style={sectionTextStyle}>
              Available only after completing the initial intake session. Discounted from the standard rate of $200/hour.
            </p>
            
            <div style={packageGridStyle}>
              {followUpPackages.map((pkg) => (
                <div
                  key={pkg.id}
                  style={selectedPackage?.id === pkg.id ? selectedPackageCardStyle : packageCardStyle}
                  onClick={() => setSelectedPackage(pkg)}
                  onMouseEnter={(e) => {
                    if (selectedPackage?.id !== pkg.id) {
                      e.target.style.borderColor = theme.colors.primary;
                      e.target.style.backgroundColor = 'rgba(0, 175, 81, 0.02)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedPackage?.id !== pkg.id) {
                      e.target.style.borderColor = theme.colors.border;
                      e.target.style.backgroundColor = theme.colors.background.primary;
                    }
                  }}
                >
                  <div style={packageNameStyle}>{pkg.name}</div>
                  <div style={packageDetailsStyle}>{pkg.sessions}</div>
                  <div style={packagePriceStyle}>${pkg.price}</div>
                  <div style={packageRateStyle}>Avg: ${pkg.avgRate}/hour (~{pkg.discount} discount)</div>
                </div>
              ))}
            </div>
            
            {selectedPackage && (
              <Link to="/booking" style={ctaButtonStyle}>
                Book {selectedPackage.name} - ${selectedPackage.price}
              </Link>
            )}
          </div>

          <div style={addOnSectionStyle}>
            <h4 style={addOnTitleStyle}>Tournament Prep (Optional Add-On)</h4>
            <div style={addOnPriceStyle}>Tournament Prep: $400</div>
            <p style={sectionTextStyle}>
              Custom mental game planning for specific tournaments. Let Coach Yannick know about an upcoming tournament in advance, and he'll create a personalized mental game strategy tailored to the course, conditions, and your playing style.
            </p>
            <p style={sectionTextStyle}>
              <strong>What's Included:</strong>
            </p>
            <ul style={sectionTextStyle}>
              <li>Pre-tournament consultation to understand your goals and concerns</li>
              <li>Custom mental game plan for the specific tournament</li>
              <li>Course-specific strategy and mental approach</li>
              <li>Pressure management techniques for tournament conditions</li>
              <li>Post-tournament review and lessons learned</li>
            </ul>
            <p style={sectionTextStyle}>
              <em>Perfect for players preparing for important tournaments, championships, or competitive events.</em>
            </p>
            <Link to="/booking" style={ctaButtonStyle}>
              Book Tournament Prep
            </Link>
          </div>
        </div>

        <div style={sidebarStyle}>
          <div style={freeCallStyle}>
            <h4 style={freeCallTitleStyle}>Still Unsure?</h4>
            <p style={freeCallTextStyle}>
              Schedule a free 30-min informational call with Coach Yannick!
            </p>
            <p style={freeCallTextStyle}>
              Ask Yannick how personalized mental coaching can transform your game and any other questions you may have.
            </p>
            <Link to="/booking" style={ctaButtonStyle}>
              Schedule Free Call
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default MentalPerformancePage;
