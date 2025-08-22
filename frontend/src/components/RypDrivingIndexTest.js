import React, { useState, useEffect } from 'react';
import { theme } from '../styles/theme';

const RypDrivingIndexTest = ({ isOpen, onComplete, onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [baselineHandicap, setBaselineHandicap] = useState(null);
  const [averageDrive, setAverageDrive] = useState('');
  const [gender, setGender] = useState('');
  const [testResults, setTestResults] = useState({
    badMissLeft: 0,
    goodMissLeft: 0,
    fairwayHit: 0,
    goodMissRight: 0,
    badMissRight: 0
  });
  const [finalScore, setFinalScore] = useState(null);
  const [showResults, setShowResults] = useState(false);

  // Baseline handicap lookup table
  const baselineHandicapTable = {
    men: {
      310: 5, 305: 4, 300: 3, 295: 2, 290: 1, 285: 0, 280: 1, 275: 2, 270: 3, 265: 4, 260: 5, 255: 6, 250: 7, 245: 8, 240: 9, 235: 10, 230: 11, 225: 12, 222: 13, 220: 14, 218: 15, 210: 20, 200: 25
    },
    women: {
      260: 5, 255: 4, 250: 3, 245: 2, 240: 1, 235: 0, 232: 1, 230: 2, 227: 3, 225: 4, 222: 5, 220: 6, 218: 7, 215: 8, 212: 9, 210: 10, 208: 11, 205: 12, 202: 13, 200: 14, 198: 15, 188: 20, 178: 25
    }
  };

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
    maxWidth: '800px',
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

  const cardGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(5, 1fr)',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl
  };

  const cardStyle = {
    padding: theme.spacing.md,
    border: `2px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: theme.colors.background.secondary
  };

  const selectedCardStyle = {
    ...cardStyle,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark
  };

  const disabledCardStyle = {
    ...cardStyle,
    opacity: 0.5,
    cursor: 'not-allowed',
    backgroundColor: theme.colors.background.primary
  };

  const resultsStyle = {
    textAlign: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.xl
  };

  const scoreStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.md
  };

  const calculateBaselineHandicap = (distance, gender) => {
    const table = baselineHandicapTable[gender];
    const distances = Object.keys(table).map(Number).sort((a, b) => b - a);
    
    for (let dist of distances) {
      if (distance >= dist) {
        return table[dist];
      }
    }
    return 25; // Default for very short distances
  };

  const handleBaselineSubmit = () => {
    if (averageDrive && gender) {
      const distance = parseInt(averageDrive);
      const handicap = calculateBaselineHandicap(distance, gender);
      setBaselineHandicap(handicap);
      setCurrentStep(2);
    }
  };

  const handleShotClick = (category) => {
    const totalShots = Object.values(testResults).reduce((sum, count) => sum + count, 0);
    
    // Prevent adding shots if already at 20
    if (totalShots >= 20) {
      return;
    }
    
    setTestResults(prev => ({
      ...prev,
      [category]: prev[category] + 1
    }));
  };

  const handleUndoLastShot = () => {
    const totalShots = Object.values(testResults).reduce((sum, count) => sum + count, 0);
    if (totalShots > 0) {
      // Find the last category with shots and remove one
      const categories = ['badMissLeft', 'goodMissLeft', 'fairwayHit', 'goodMissRight', 'badMissRight'];
      for (let i = categories.length - 1; i >= 0; i--) {
        const category = categories[i];
        if (testResults[category] > 0) {
          setTestResults(prev => ({
            ...prev,
            [category]: prev[category] - 1
          }));
          break;
        }
      }
    }
  };

  const calculateFinalScore = () => {
    const fairwayHits = testResults.fairwayHit;
    const badMisses = testResults.badMissLeft + testResults.badMissRight;
    const adjustedScore = fairwayHits - badMisses;
    const handicapAdjustment = baselineHandicap - adjustedScore;
    const finalRypIndex = baselineHandicap + handicapAdjustment;
    
    // Apply the display rules
    let displayScore = finalRypIndex;
    if (finalRypIndex < 0) {
      displayScore = Math.abs(finalRypIndex);
    }
    
    return displayScore;
  };

  const handleCompleteTest = () => {
    const totalShots = Object.values(testResults).reduce((sum, count) => sum + count, 0);
    if (totalShots === 20) {
      const score = calculateFinalScore();
      setFinalScore(score);
      setShowResults(true);
    }
  };

  const handleFinish = () => {
    onComplete({
      baselineHandicap,
      averageDrive: parseInt(averageDrive),
      gender,
      testResults,
      finalScore
    });
  };

  const totalShots = Object.values(testResults).reduce((sum, count) => sum + count, 0);

  if (!isOpen) return null;

  return (
    <div style={modalStyle}>
      <div style={contentStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>RYP Driving Index™ Test</h1>
          <p style={subtitleStyle}>
            Complete this 20-shot test to get your personalized driving index
          </p>
        </div>

        {currentStep === 1 && (
          <div style={stepStyle}>
            <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
              Step 1: Determine Your Baseline Handicap
            </h2>
            
            <div style={inputGroupStyle}>
              <label style={labelStyle}>Gender:</label>
              <select 
                style={selectStyle}
                value={gender}
                onChange={(e) => setGender(e.target.value)}
              >
                <option value="">Select gender</option>
                <option value="men">Men</option>
                <option value="women">Women</option>
              </select>
            </div>

            <div style={inputGroupStyle}>
              <label style={labelStyle}>Average Driving Distance (yards):</label>
              <input
                type="number"
                style={inputStyle}
                value={averageDrive}
                onChange={(e) => setAverageDrive(e.target.value)}
                placeholder="Enter your average drive distance"
                min="150"
                max="350"
              />
            </div>

            <button 
              style={buttonStyle}
              onClick={handleBaselineSubmit}
              disabled={!averageDrive || !gender}
            >
              Continue to Test Setup
            </button>
          </div>
        )}

        {currentStep === 2 && !showResults && (
          <div style={stepStyle}>
            <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
              Step 2: Set Up Your Test Area
            </h2>
            
            <div style={{ marginBottom: theme.spacing.lg }}>
              <p style={{ marginBottom: theme.spacing.md }}>
                <strong>Setup Instructions:</strong>
              </p>
              <ol style={{ paddingLeft: theme.spacing.lg }}>
                <li>Define your target fairway: Pick two landmarks downrange about 30 yards apart</li>
                <li>Define your "Bad Miss" zones: Identify landmarks well outside your fairway (approx. 15 yards from the edge)</li>
                <li>Hit 20 drives and categorize each shot using the grid below</li>
              </ol>
            </div>

            <div style={{ marginBottom: theme.spacing.lg }}>
              <p style={{ textAlign: 'center', fontWeight: 'bold', marginBottom: theme.spacing.md }}>
                Shots Completed: {totalShots}/20
              </p>
            </div>

            <div style={cardGridStyle}>
              <div 
                style={testResults.badMissLeft > 0 ? selectedCardStyle : totalShots >= 20 ? disabledCardStyle : cardStyle}
                onClick={() => handleShotClick('badMissLeft')}
              >
                <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.sm }}>
                  Bad Miss Left
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.xl }}>
                  {testResults.badMissLeft}
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                  Penalty Shot
                </div>
              </div>

              <div 
                style={testResults.goodMissLeft > 0 ? selectedCardStyle : totalShots >= 20 ? disabledCardStyle : cardStyle}
                onClick={() => handleShotClick('goodMissLeft')}
              >
                <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.sm }}>
                  Good Miss Left
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.xl }}>
                  {testResults.goodMissLeft}
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                  Playable
                </div>
              </div>

              <div 
                style={testResults.fairwayHit > 0 ? selectedCardStyle : totalShots >= 20 ? disabledCardStyle : cardStyle}
                onClick={() => handleShotClick('fairwayHit')}
              >
                <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.sm }}>
                  Fairway Hit
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.xl }}>
                  {testResults.fairwayHit}
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                  Success
                </div>
              </div>

              <div 
                style={testResults.goodMissRight > 0 ? selectedCardStyle : totalShots >= 20 ? disabledCardStyle : cardStyle}
                onClick={() => handleShotClick('goodMissRight')}
              >
                <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.sm }}>
                  Good Miss Right
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.xl }}>
                  {testResults.goodMissRight}
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                  Playable
                </div>
              </div>

              <div 
                style={testResults.badMissRight > 0 ? selectedCardStyle : totalShots >= 20 ? disabledCardStyle : cardStyle}
                onClick={() => handleShotClick('badMissRight')}
              >
                <div style={{ fontWeight: 'bold', marginBottom: theme.spacing.sm }}>
                  Bad Miss Right
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.xl }}>
                  {testResults.badMissRight}
                </div>
                <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                  Penalty Shot
                </div>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button 
                style={secondaryButtonStyle}
                onClick={handleUndoLastShot}
                disabled={totalShots === 0}
              >
                Undo Last Shot
              </button>
              
              <button 
                style={buttonStyle}
                onClick={handleCompleteTest}
                disabled={totalShots !== 20}
              >
                Complete Test
              </button>
            </div>
          </div>
        )}

        {showResults && (
          <div style={stepStyle}>
            <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
              Your RYP Driving Index™ Results
            </h2>

            <div style={resultsStyle}>
              <div style={scoreStyle}>
                {finalScore}
              </div>
              <p style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md }}>
                Your RYP Driving Index™ Score
              </p>
              <p style={{ color: theme.colors.text.secondary }}>
                Baseline Handicap: {baselineHandicap} | 
                Fairway Hits: {testResults.fairwayHit} | 
                Bad Misses: {testResults.badMissLeft + testResults.badMissRight}
              </p>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button style={buttonStyle} onClick={handleFinish}>
                Complete Setup & Go to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RypDrivingIndexTest;
