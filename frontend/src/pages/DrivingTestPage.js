import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';
import RypDrivingIndexTest from '../components/RypDrivingIndexTest';

function DrivingTestPage() {
  const { user, loading, setupData } = useUser();
  const navigate = useNavigate();
  const [showTest, setShowTest] = useState(false);
  const [testHistory, setTestHistory] = useState([]);
  const [currentResults, setCurrentResults] = useState(null);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login');
    }
  }, [user, loading, navigate]);

  // Initialize with setup data if available
  useEffect(() => {
    if (setupData && setupData.rypTestResults) {
      setCurrentResults(setupData.rypTestResults);
    }
  }, [setupData]);

  const handleTestComplete = (results) => {
    setCurrentResults(results);
    setShowTest(false);
    
    // Add to test history
    const newTestEntry = {
      ...results,
      date: new Date().toISOString(),
      id: Date.now()
    };
    setTestHistory(prev => [newTestEntry, ...prev.slice(0, 9)]); // Keep last 10 tests
  };

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
    fontFamily: theme.typography.fontFamily.headline
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.lg
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

  const cardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
  };

  const resultsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xl
  };

  const historyItemStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.sm
  };

  const scoreStyle = {
    fontSize: theme.typography.fontSizes['2xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm
  };

  const dateStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm
  };

  const statsStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: theme.spacing['2xl'] }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: `4px solid ${theme.colors.border}`,
            borderTop: `4px solid ${theme.colors.primary}`,
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            margin: '0 auto 16px'
          }}></div>
          <p>Loading...</p>
        </div>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>RYP Driving Index™ Test</h1>
        <p style={subtitleStyle}>
          Track your driving performance and see your improvement over time
        </p>
      </div>

      {!showTest && (
        <>
          <div style={{ textAlign: 'center', marginBottom: theme.spacing.xl }}>
            <button style={buttonStyle} onClick={() => setShowTest(true)}>
              Take New Test
            </button>
            <button style={secondaryButtonStyle} onClick={() => navigate('/dashboard')}>
              Back to Dashboard
            </button>
          </div>

          {currentResults && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
                Latest Test Results
              </h2>
              <div style={resultsGridStyle}>
                <div style={{ textAlign: 'center' }}>
                  <div style={scoreStyle}>{currentResults.finalScore}</div>
                  <div style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.sm }}>
                    RYP Driving Index™
                  </div>
                  <div style={statsStyle}>
                    Baseline: {currentResults.baselineHandicap} | 
                    Distance: {currentResults.averageDrive} yards
                  </div>
                </div>
                <div>
                  <h3 style={{ fontSize: theme.typography.fontSizes.lg, marginBottom: theme.spacing.md }}>
                    Shot Breakdown
                  </h3>
                  <div style={statsStyle}>
                    <div>Fairway Hits: {currentResults.testResults.fairwayHit}</div>
                    <div>Good Miss Left: {currentResults.testResults.goodMissLeft}</div>
                    <div>Good Miss Right: {currentResults.testResults.goodMissRight}</div>
                    <div>Bad Miss Left: {currentResults.testResults.badMissLeft}</div>
                    <div>Bad Miss Right: {currentResults.testResults.badMissRight}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {testHistory.length > 0 && (
            <div style={cardStyle}>
              <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
                Test History
              </h2>
              {testHistory.map((test, index) => (
                <div key={test.id} style={historyItemStyle}>
                  <div style={dateStyle}>
                    {new Date(test.date).toLocaleDateString()} - {new Date(test.date).toLocaleTimeString()}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: theme.typography.fontSizes.lg, fontWeight: 'bold' }}>
                        Score: {test.finalScore}
                      </div>
                      <div style={statsStyle}>
                        Distance: {test.averageDrive} yards | 
                        Fairway Hits: {test.testResults.fairwayHit} | 
                        Bad Misses: {test.testResults.badMissLeft + test.testResults.badMissRight}
                      </div>
                    </div>
                    <div style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
                      #{index + 1}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {showTest && (
        <RypDrivingIndexTest
          isOpen={showTest}
          onComplete={handleTestComplete}
          onClose={() => setShowTest(false)}
        />
      )}
    </div>
  );
}

export default DrivingTestPage;
