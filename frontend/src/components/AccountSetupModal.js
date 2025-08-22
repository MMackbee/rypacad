import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';
import RypDrivingIndexTest from './RypDrivingIndexTest';

const AccountSetupModal = ({ isOpen, onComplete, user }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [accountInfo, setAccountInfo] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    age: '',
    experience: '',
    goals: []
  });
  const [rypTestResults, setRypTestResults] = useState(null);
  const [showRypTest, setShowRypTest] = useState(false);

  const modalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: isOpen ? 'flex' : 'none',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    padding: theme.spacing.lg
  };

  const contentStyle = {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    maxWidth: '600px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: theme.shadows.xl,
    border: `1px solid ${theme.colors.border}`
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
    fontFamily: theme.typography.fontFamily.headline
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.lg
  };

  const stepStyle = {
    marginBottom: theme.spacing.xl
  };

  const inputGroupStyle = {
    marginBottom: theme.spacing.lg
  };

  const labelStyle = {
    display: 'block',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm
  };

  const inputStyle = {
    width: '100%',
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.base,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer'
  };

  const buttonStyle = {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    cursor: 'pointer',
    marginRight: theme.spacing.md,
    marginBottom: theme.spacing.md
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border}`
  };

  const checkboxGroupStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg
  };

  const checkboxStyle = {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing.sm,
    cursor: 'pointer'
  };

  const progressStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.md
  };

  const progressStepStyle = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontSize: theme.typography.fontSizes.sm
  };

  const activeStepStyle = {
    ...progressStepStyle,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.bold
  };

  const completedStepStyle = {
    ...progressStepStyle,
    color: theme.colors.success
  };

  const handleInputChange = (field, value) => {
    setAccountInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleGoalToggle = (goal) => {
    setAccountInfo(prev => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter(g => g !== goal)
        : [...prev.goals, goal]
    }));
  };

  const handleNextStep = () => {
    if (currentStep === 1 && isAccountInfoValid()) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setShowRypTest(true);
    }
  };

  const handleRypTestComplete = (results) => {
    setRypTestResults(results);
    setShowRypTest(false);
    setCurrentStep(3);
  };

  const handleFinishSetup = () => {
    onComplete({
      accountInfo,
      rypTestResults
    });
  };

  const isAccountInfoValid = () => {
    return accountInfo.firstName && 
           accountInfo.lastName && 
           accountInfo.phone && 
           accountInfo.age && 
           accountInfo.experience;
  };

  const getStepStatus = (step) => {
    if (step < currentStep) return 'completed';
    if (step === currentStep) return 'active';
    return 'pending';
  };

  if (!isOpen) return null;

  if (showRypTest) {
    return (
      <RypDrivingIndexTest
        isOpen={showRypTest}
        onComplete={handleRypTestComplete}
        onClose={() => setShowRypTest(false)}
      />
    );
  }

  return (
    <div style={modalStyle}>
      <div style={contentStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Complete Your Account Setup</h1>
          <p style={subtitleStyle}>
            Let's get to know you better and set up your personalized experience
          </p>
        </div>

        <div style={progressStyle}>
          <div style={getStepStatus(1) === 'completed' ? completedStepStyle : 
                      getStepStatus(1) === 'active' ? activeStepStyle : progressStepStyle}>
            <div>1</div>
            <div>Account Info</div>
          </div>
          <div style={getStepStatus(2) === 'completed' ? completedStepStyle : 
                      getStepStatus(2) === 'active' ? activeStepStyle : progressStepStyle}>
            <div>2</div>
            <div>Skills Test</div>
          </div>
          <div style={getStepStatus(3) === 'completed' ? completedStepStyle : 
                      getStepStatus(3) === 'active' ? activeStepStyle : progressStepStyle}>
            <div>3</div>
            <div>Complete</div>
          </div>
        </div>

        {currentStep === 1 && (
          <div style={stepStyle}>
            <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
              Tell Us About Yourself
            </h2>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>First Name:</label>
              <input
                type="text"
                style={inputStyle}
                value={accountInfo.firstName}
                onChange={(e) => handleInputChange('firstName', e.target.value)}
                placeholder="Enter your first name"
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Last Name:</label>
              <input
                type="text"
                style={inputStyle}
                value={accountInfo.lastName}
                onChange={(e) => handleInputChange('lastName', e.target.value)}
                placeholder="Enter your last name"
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Phone Number:</label>
              <input
                type="tel"
                style={inputStyle}
                value={accountInfo.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="Enter your phone number"
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Age:</label>
              <input
                type="number"
                style={inputStyle}
                value={accountInfo.age}
                onChange={(e) => handleInputChange('age', e.target.value)}
                placeholder="Enter your age"
                min="5"
                max="100"
              />
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Golf Experience:</label>
              <select
                style={selectStyle}
                value={accountInfo.experience}
                onChange={(e) => handleInputChange('experience', e.target.value)}
              >
                <option value="">Select your experience level</option>
                <option value="beginner">Beginner (0-1 years)</option>
                <option value="intermediate">Intermediate (1-5 years)</option>
                <option value="advanced">Advanced (5+ years)</option>
                <option value="competitive">Competitive Player</option>
              </select>
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>What are your golf goals? (Select all that apply):</label>
              <div style={checkboxGroupStyle}>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={accountInfo.goals.includes('improve_accuracy')}
                    onChange={() => handleGoalToggle('improve_accuracy')}
                  />
                  Improve Accuracy
                </label>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={accountInfo.goals.includes('increase_distance')}
                    onChange={() => handleGoalToggle('increase_distance')}
                  />
                  Increase Distance
                </label>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={accountInfo.goals.includes('lower_handicap')}
                    onChange={() => handleGoalToggle('lower_handicap')}
                  />
                  Lower Handicap
                </label>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={accountInfo.goals.includes('tournament_play')}
                    onChange={() => handleGoalToggle('tournament_play')}
                  />
                  Tournament Play
                </label>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={accountInfo.goals.includes('social_golf')}
                    onChange={() => handleGoalToggle('social_golf')}
                  />
                  Social Golf
                </label>
                <label style={checkboxStyle}>
                  <input
                    type="checkbox"
                    checked={accountInfo.goals.includes('fitness')}
                    onChange={() => handleGoalToggle('fitness')}
                  />
                  Golf Fitness
                </label>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button 
                style={buttonStyle}
                onClick={handleNextStep}
                disabled={!isAccountInfoValid()}
              >
                Continue to Skills Test
              </button>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div style={stepStyle}>
            <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
              RYP Driving Index™ Skills Test
            </h2>
            
            <div style={{ textAlign: 'center', marginBottom: theme.spacing.xl }}>
              <p style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md }}>
                Ready to take your personalized skills assessment?
              </p>
              <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
                This 20-shot test will help us understand your current driving performance and provide personalized recommendations.
              </p>
              
              <button style={buttonStyle} onClick={handleNextStep}>
                Start Skills Test
              </button>
            </div>
          </div>
        )}

        {currentStep === 3 && (
          <div style={stepStyle}>
            <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
              Setup Complete!
            </h2>
            
            <div style={{ textAlign: 'center', marginBottom: theme.spacing.xl }}>
              <div style={{ 
                fontSize: theme.typography.fontSizes['3xl'], 
                fontWeight: theme.typography.fontWeights.bold, 
                color: theme.colors.primary,
                marginBottom: theme.spacing.md 
              }}>
                {rypTestResults?.finalScore}
              </div>
              <p style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md }}>
                Your RYP Driving Index™ Score
              </p>
              <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
                Welcome to RYP Golf Academy! Your personalized training plan is ready.
              </p>
              
              <button style={buttonStyle} onClick={handleFinishSetup}>
                Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSetupModal;

