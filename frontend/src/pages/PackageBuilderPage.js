import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { theme } from '../styles/theme';

function PackageBuilderPage() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedCoachingPackage, setSelectedCoachingPackage] = useState(null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [currentStep, setCurrentStep] = useState(1);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Coaching Packages Data
  const coachingPackages = {
    youth: [
      {
        id: 'youth-starter',
        title: 'Starter',
        subtitle: 'Perfect for beginners',
        description: 'Ideal for young golfers starting their journey',
        price: 200,
        period: 'per month',
        features: [
          '4 Sessions per Month',
          '2 Tournaments per Month',
          'Professional coaching',
          'Equipment provided',
          'Progress tracking'
        ]
      },
      {
        id: 'youth-developer',
        title: 'Developer',
        subtitle: 'For improving players',
        description: 'Take your game to the next level',
        price: 380,
        period: 'per month',
        features: [
          '8 Sessions per Month',
          '3 Tournaments per Month',
          'Advanced skill development',
          'Video analysis',
          'Mental game training'
        ]
      },
      {
        id: 'youth-elite',
        title: 'Elite',
        subtitle: 'For serious competitors',
        description: 'Maximum training and tournament exposure',
        price: 540,
        period: 'per month',
        features: [
          '12 Sessions per Month',
          '4 Tournaments per Month',
          'Elite coaching',
          'Performance analytics',
          'Tournament preparation'
        ]
      },
      {
        id: 'youth-champion',
        title: 'Champion',
        subtitle: 'For tournament champions',
        description: 'The ultimate package for championship success',
        price: 680,
        period: 'per month',
        features: [
          '16 Sessions per Month',
          '4 Tournaments per Month',
          'Championship coaching',
          'Advanced analytics',
          'College prep guidance'
        ]
      },
      {
        id: 'youth-casual',
        title: 'Casual Session',
        subtitle: 'One-off training',
        description: 'Perfect for trying out our coaching',
        price: 50,
        period: 'one-off',
        features: [
          'Single session',
          'Professional coaching',
          'Equipment provided',
          'Skill assessment',
          'Flexible scheduling'
        ]
      }
    ],
    adult: [
      {
        id: 'adult-starter',
        title: 'Starter',
        subtitle: 'Perfect for beginners',
        description: 'Ideal for adult golfers starting their journey',
        price: 240,
        period: 'per month',
        features: [
          '4 Sessions per Month',
          '2 Tournaments per Month',
          'Professional coaching',
          'Equipment provided',
          'Progress tracking'
        ]
      },
      {
        id: 'adult-developer',
        title: 'Developer',
        subtitle: 'For improving players',
        description: 'Take your game to the next level',
        price: 456,
        period: 'per month',
        features: [
          '8 Sessions per Month',
          '3 Tournaments per Month',
          'Advanced skill development',
          'Video analysis',
          'Mental game training'
        ]
      },
      {
        id: 'adult-elite',
        title: 'Elite',
        subtitle: 'For serious competitors',
        description: 'Maximum training and tournament exposure',
        price: 648,
        period: 'per month',
        features: [
          '12 Sessions per Month',
          '4 Tournaments per Month',
          'Elite coaching',
          'Performance analytics',
          'Tournament preparation'
        ]
      },
      {
        id: 'adult-champion',
        title: 'Champion',
        subtitle: 'For tournament champions',
        description: 'The ultimate package for championship success',
        price: 816,
        period: 'per month',
        features: [
          '16 Sessions per Month',
          '4 Tournaments per Month',
          'Championship coaching',
          'Advanced analytics',
          'Tournament prep guidance'
        ]
      },
      {
        id: 'adult-casual',
        title: 'Casual Session',
        subtitle: 'One-off training',
        description: 'Perfect for trying out our coaching',
        price: 60,
        period: 'one-off',
        features: [
          'Single session',
          'Professional coaching',
          'Equipment provided',
          'Skill assessment',
          'Flexible scheduling'
        ]
      }
    ]
  };

  // Add-on Programs Data with default 20% package prices
  const addOnPrograms = [
    {
      id: 'ryp-academy-starter',
      title: 'RYP Academy Starter',
      subtitle: 'Basic fitness training',
      description: '4 sessions per month of golf-specific strength training',
      standalonePrice: 120,
      packagePrice: 96, // 20% discount
      period: 'per month',
      features: [
        '4 Sessions per Month',
        'Golf-specific strength training',
        'Core and stability work',
        'Flexibility and mobility',
        'Progress tracking'
      ]
    },
    {
      id: 'ryp-academy-developer',
      title: 'RYP Academy Developer',
      subtitle: 'Intermediate fitness program',
      description: '8 sessions per month of advanced strength training',
      standalonePrice: 200,
      packagePrice: 160, // 20% discount
      period: 'per month',
      features: [
        '8 Sessions per Month',
        'Advanced strength training',
        'Power development',
        'Recovery protocols',
        'Performance analytics'
      ]
    },
    {
      id: 'ryp-academy-elite',
      title: 'RYP Academy Elite',
      subtitle: 'Comprehensive fitness program',
      description: '12 sessions per month of elite strength training',
      standalonePrice: 240,
      packagePrice: 192, // 20% discount
      period: 'per month',
      features: [
        '12 Sessions per Month',
        'Elite strength training',
        'Advanced power development',
        'Nutrition guidance',
        'Comprehensive analytics'
      ]
    },
    {
      id: 'ryp-academy-casual',
      title: 'RYP Academy Casual',
      subtitle: 'One-off private fitness session',
      description: 'One-off private fitness session',
      standalonePrice: 75,
      packagePrice: 60, // 20% discount
      period: 'one-off',
      features: [
        'Single 1-hour session',
        'Personalized fitness assessment',
        'Golf-specific exercises',
        'Home workout plan',
        'Flexible scheduling'
      ]
    },
    {
      id: 'mental-starter',
      title: 'Mental Performance Starter',
      subtitle: 'Foundation mental skills',
      description: '2 sessions per month of mental game training',
      standalonePrice: 100,
      packagePrice: 80, // 20% discount
      period: 'per month',
      features: [
        '2 Mental performance sessions',
        'Focus training',
        'Stress management',
        'Goal setting',
        'Mindfulness techniques'
      ]
    },
    {
      id: 'mental-developer',
      title: 'Mental Performance Developer',
      subtitle: 'Advanced mental training',
      description: '4 sessions per month of elite mental training',
      standalonePrice: 150,
      packagePrice: 120, // 20% discount
      period: 'per month',
      features: [
        '4 Mental performance sessions',
        'Pressure simulation',
        'Competition psychology',
        'Visualization training',
        'Performance routines'
      ]
    },
    {
      id: 'tournament-prep',
      title: 'Tournament Prep',
      subtitle: 'Custom mental game planning',
      description: 'Personalized mental game strategy for specific tournaments',
      standalonePrice: 400,
      packagePrice: 320, // 20% discount
      period: 'per tournament',
      features: [
        'Pre-tournament consultation',
        'Custom mental game plan',
        'Course-specific strategy',
        'Pressure management techniques',
        'Post-tournament review'
      ]
    }
  ];

  const handleAddOnToggle = (addOnId) => {
    setSelectedAddOns(prev => 
      prev.includes(addOnId) 
        ? prev.filter(id => id !== addOnId)
        : [...prev, addOnId]
    );
  };

  const calculateTotal = () => {
    const coachingPrice = selectedCoachingPackage ? selectedCoachingPackage.price : 0;
    let addOnsPrice = 0;
    const selectedFitnessAddOns = selectedAddOns.filter(id => id.startsWith('ryp-academy-') || id.startsWith('fitness-'));
    const selectedMentalAddOns = selectedAddOns.filter(id => id.startsWith('mental-') || id.startsWith('tournament-prep'));

    selectedAddOns.forEach(addOnId => {
      const addOn = addOnPrograms.find(a => a.id === addOnId);
      if (addOn) {
        if (selectedFitnessAddOns.length > 0 && selectedMentalAddOns.length > 0) {
          addOnsPrice += addOn.standalonePrice * 0.7; // 30% discount
        } else {
          addOnsPrice += addOn.standalonePrice * 0.8; // 20% discount
        }
      }
    });
    return coachingPrice + addOnsPrice;
  };

  const calculateSavings = () => {
    const addOnsStandalonePrice = selectedAddOns.reduce((total, addOnId) => {
      const addOn = addOnPrograms.find(a => a.id === addOnId);
      return total + (addOn ? addOn.standalonePrice : 0);
    }, 0);

    const addOnsPackagePrice = selectedAddOns.reduce((total, addOnId) => {
      const addOn = addOnPrograms.find(a => a.id === addOnId);
      if (addOn) {
        const selectedFitnessAddOns = selectedAddOns.filter(id => id.startsWith('ryp-academy-') || id.startsWith('fitness-'));
        const selectedMentalAddOns = selectedAddOns.filter(id => id.startsWith('mental-') || id.startsWith('tournament-prep'));
        if (selectedFitnessAddOns.length > 0 && selectedMentalAddOns.length > 0) {
          return total + (addOn.standalonePrice * 0.7); // 30% discount
        } else {
          return total + (addOn.standalonePrice * 0.8); // 20% discount
        }
      }
      return total;
    }, 0);
    return addOnsStandalonePrice - addOnsPackagePrice;
  };

  // Auto-switch to add-ons when package is selected
  useEffect(() => {
    if (selectedCoachingPackage && currentStep === 1) {
      setCurrentStep(2);
    }
  }, [selectedCoachingPackage, currentStep]);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        backgroundColor: theme.colors.background.primary 
      }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{
        maxWidth: '600px',
        margin: '100px auto',
        padding: theme.spacing.xl,
        textAlign: 'center',
        backgroundColor: theme.colors.background.secondary,
        borderRadius: theme.borderRadius.lg,
        border: `1px solid ${theme.colors.border}`
      }}>
        <h2 style={{ 
          fontSize: theme.typography.fontSizes.xl,
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.primary
        }}>
          Sign In Required
        </h2>
        <p style={{ 
          marginBottom: theme.spacing.lg,
          color: theme.colors.text.secondary
        }}>
          Please sign in to build your custom package and access exclusive pricing.
        </p>
        <div style={{ display: 'flex', gap: theme.spacing.md, justifyContent: 'center' }}>
          <Link 
            to="/login"
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              backgroundColor: theme.colors.primary,
              color: theme.colors.text.dark,
              textDecoration: 'none',
              borderRadius: theme.borderRadius.md,
              fontWeight: theme.typography.fontWeights.semibold
            }}
          >
            Sign In
          </Link>
          <Link 
            to="/programs"
            style={{
              padding: `${theme.spacing.md} ${theme.spacing.xl}`,
              backgroundColor: 'transparent',
              color: theme.colors.text.primary,
              textDecoration: 'none',
              borderRadius: theme.borderRadius.md,
              border: `1px solid ${theme.colors.border}`,
              fontWeight: theme.typography.fontWeights.semibold
            }}
          >
            View Programs
          </Link>
        </div>
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
    textAlign: 'center',
    marginBottom: theme.spacing.xl
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body
  };

  const stepIndicatorStyle = {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md
  };

  const stepStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body,
    fontWeight: theme.typography.fontWeights.medium,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const activeStepStyle = {
    ...stepStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark
  };

  const inactiveStepStyle = {
    ...stepStyle,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.secondary,
    border: `1px solid ${theme.colors.border}`
  };

  const contentStyle = {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: theme.spacing.lg
  };

  const mainContentStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const sidebarStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    height: 'fit-content',
    position: 'sticky',
    top: theme.spacing.lg
  };

  const sectionTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const categoryTabsStyle = {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
    gap: theme.spacing.md
  };

  const categoryTabStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
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

  const packageGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: theme.spacing.md
  };

  const packageCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
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

  const packageTitleStyle = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.headline
  };

  const packageSubtitleStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.body
  };

  const packageDescriptionStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const packagePriceStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    fontFamily: theme.typography.fontFamily.headline
  };

  const addOnGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: theme.spacing.md
  };

  const addOnCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const selectedAddOnCardStyle = {
    ...addOnCardStyle,
    borderColor: theme.colors.secondary,
    backgroundColor: 'rgba(244, 238, 25, 0.05)'
  };

  const addOnTitleStyle = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.headline
  };

  const addOnSubtitleStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.body
  };

  const addOnDescriptionStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const priceComparisonStyle = {
    display: 'flex',
    gap: theme.spacing.sm,
    alignItems: 'center',
    marginBottom: theme.spacing.xs
  };

  const standalonePriceStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    textDecoration: 'line-through',
    fontFamily: theme.typography.fontFamily.body
  };

  const packagePriceStyle2 = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.secondary,
    fontFamily: theme.typography.fontFamily.headline
  };

  const savingsBadgeStyle = {
    backgroundColor: theme.colors.secondary,
    color: theme.colors.text.dark,
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    fontFamily: theme.typography.fontFamily.body
  };

  const summaryTitleStyle = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const summaryItemStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const summaryTotalStyle = {
    ...summaryItemStyle,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    borderTop: `1px solid ${theme.colors.border}`,
    paddingTop: theme.spacing.sm,
    marginTop: theme.spacing.sm
  };

  const savingsStyle = {
    ...summaryItemStyle,
    color: theme.colors.secondary,
    fontWeight: theme.typography.fontWeights.semibold
  };

  const buttonStyle = {
    width: '100%',
    padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: theme.spacing.md
  };

  const renderStep1 = () => (
    <div>
      <h3 style={sectionTitleStyle}>Step 1: Select Age Category</h3>
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
      </div>

      {selectedCategory && (
        <>
          <h3 style={sectionTitleStyle}>Step 2: Select Coaching Package</h3>
          <div style={packageGridStyle}>
            {coachingPackages[selectedCategory].map((pkg) => (
              <div
                key={pkg.id}
                style={selectedCoachingPackage?.id === pkg.id ? selectedPackageCardStyle : packageCardStyle}
                onClick={() => setSelectedCoachingPackage(pkg)}
                onMouseEnter={(e) => {
                  if (selectedCoachingPackage?.id !== pkg.id) {
                    e.target.style.borderColor = theme.colors.primary;
                    e.target.style.backgroundColor = 'rgba(0, 175, 81, 0.02)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedCoachingPackage?.id !== pkg.id) {
                    e.target.style.borderColor = theme.colors.border;
                    e.target.style.backgroundColor = theme.colors.background.primary;
                  }
                }}
              >
                <div style={packageTitleStyle}>{pkg.title}</div>
                <div style={packageSubtitleStyle}>{pkg.subtitle}</div>
                <div style={packageDescriptionStyle}>{pkg.description}</div>
                <div style={packagePriceStyle}>${pkg.price} {pkg.period}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );

  const renderStep2 = () => (
    <div>
      <h3 style={sectionTitleStyle}>Step 3: Add Performance Programs (Optional)</h3>
      <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md, fontSize: theme.typography.fontSizes.sm }}>
        Enhance your coaching package with specialized training programs. 
        {selectedAddOns.length === 1 && ' Get 20% discount on add-ons!'}
        {selectedAddOns.length >= 2 && ' Get 30% discount when adding both fitness and mental training!'}
      </p>
      <div style={addOnGridStyle}>
        {addOnPrograms.map((addOn) => (
          <div
            key={addOn.id}
            style={selectedAddOns.includes(addOn.id) ? selectedAddOnCardStyle : addOnCardStyle}
            onClick={() => handleAddOnToggle(addOn.id)}
            onMouseEnter={(e) => {
              if (!selectedAddOns.includes(addOn.id)) {
                e.target.style.borderColor = theme.colors.secondary;
                e.target.style.backgroundColor = 'rgba(244, 238, 25, 0.02)';
              }
            }}
            onMouseLeave={(e) => {
              if (!selectedAddOns.includes(addOn.id)) {
                e.target.style.borderColor = theme.colors.border;
                e.target.style.backgroundColor = theme.colors.background.primary;
              }
            }}
          >
            <div style={addOnTitleStyle}>{addOn.title}</div>
            <div style={addOnSubtitleStyle}>{addOn.subtitle}</div>
            <div style={addOnDescriptionStyle}>{addOn.description}</div>
            <div style={priceComparisonStyle}>
              <span style={standalonePriceStyle}>${addOn.standalonePrice}</span>
              <span style={packagePriceStyle2}>${addOn.packagePrice}</span>
              <span style={savingsBadgeStyle}>
                Save ${addOn.standalonePrice - addOn.packagePrice}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSummary = () => (
    <div style={sidebarStyle}>
      <h3 style={summaryTitleStyle}>Package Summary</h3>
      
      {selectedCoachingPackage && (
        <div style={summaryItemStyle}>
          <span>{selectedCoachingPackage.title}</span>
          <span>${selectedCoachingPackage.price}</span>
        </div>
      )}

      {selectedAddOns.map((addOnId) => {
        const addOn = addOnPrograms.find(a => a.id === addOnId);
        return (
          <div key={addOnId} style={summaryItemStyle}>
            <span>+ {addOn.title}</span>
            <span>${addOn.packagePrice}</span>
          </div>
        );
      })}

      {selectedAddOns.length > 0 && (
        <div style={savingsStyle}>
          <span>Total Savings</span>
          <span>-${calculateSavings()}</span>
        </div>
      )}

      <div style={summaryTotalStyle}>
        <span>Total Monthly</span>
        <span>${calculateTotal()}</span>
      </div>

      <button
        style={buttonStyle}
        onClick={() => {
          console.log('Selected Package:', selectedCoachingPackage);
          console.log('Selected Add-ons:', selectedAddOns);
          console.log('Total:', calculateTotal());
        }}
      >
        Proceed to Checkout
      </button>
    </div>
  );

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Build Your Perfect Package</h1>
        <p style={subtitleStyle}>
          Choose your coaching package and enhance it with specialized training programs
        </p>
      </div>

      <div style={stepIndicatorStyle}>
        <div 
          style={currentStep >= 1 ? activeStepStyle : inactiveStepStyle}
          onClick={() => setCurrentStep(1)}
        >
          Select Package
        </div>
        <div 
          style={currentStep >= 2 ? activeStepStyle : inactiveStepStyle}
          onClick={() => selectedCoachingPackage && setCurrentStep(2)}
        >
          Add Programs
        </div>
      </div>

      <div style={contentStyle}>
        <div style={mainContentStyle}>
          {currentStep === 1 && renderStep1()}
          {currentStep === 2 && renderStep2()}
        </div>

        {selectedCoachingPackage && renderSummary()}
      </div>
    </div>
  );
}

export default PackageBuilderPage;
