import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';

const DrivingStatsCard = () => {
  const { setupData } = useUser();
  const navigate = useNavigate();
  const [latestScore, setLatestScore] = useState(null);
  const [testCount, setTestCount] = useState(0);
  const [improvement, setImprovement] = useState(null);

  // Use setup data if available, otherwise use mock data
  useEffect(() => {
    if (setupData && setupData.rypTestResults) {
      setLatestScore(setupData.rypTestResults.finalScore);
      setTestCount(1); // First test
      setImprovement(null); // No improvement yet
    } else {
      // Mock data - in production this would come from Firebase
      const mockStats = {
        latestScore: 12,
        testCount: 3,
        improvement: '+2',
        lastTestDate: '2024-01-15',
        bestScore: 10,
        averageScore: 11.5
      };
      
      setLatestScore(mockStats.latestScore);
      setTestCount(mockStats.testCount);
      setImprovement(mockStats.improvement);
    }
  }, [setupData]);

  const cardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    margin: 0
  };

  const buttonStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    cursor: 'pointer',
    textDecoration: 'none'
  };

  const statsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg
  };

  const statItemStyle = {
    textAlign: 'center',
    padding: theme.spacing.sm
  };

  const statValueStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs
  };

  const statLabelStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  };

  const scoreDisplayStyle = {
    textAlign: 'center',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md
  };

  const mainScoreStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs
  };

  const scoreLabelStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.sm
  };

  const improvementStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeights.semibold
  };

  const handleTakeTest = () => {
    navigate('/driving-test');
  };

  const handleViewHistory = () => {
    navigate('/driving-test');
  };

  if (!latestScore) {
    return (
      <div style={cardStyle}>
        <div style={headerStyle}>
          <h3 style={titleStyle}>RYP Driving Index™</h3>
        </div>
        <div style={{ textAlign: 'center', padding: theme.spacing.lg }}>
          <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
            Take your first driving test to see your stats
          </p>
          <button style={buttonStyle} onClick={handleTakeTest}>
            Take First Test
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>RYP Driving Index™</h3>
        <button style={buttonStyle} onClick={handleTakeTest}>
          Take Test
        </button>
      </div>

      <div style={scoreDisplayStyle}>
        <div style={mainScoreStyle}>{latestScore}</div>
        <div style={scoreLabelStyle}>Current Score</div>
        {improvement && (
          <div style={improvementStyle}>
            {improvement} from last test
          </div>
        )}
      </div>

      <div style={statsGridStyle}>
        <div style={statItemStyle}>
          <div style={statValueStyle}>{testCount}</div>
          <div style={statLabelStyle}>Tests Taken</div>
        </div>
        <div style={statItemStyle}>
          <div style={statValueStyle}>10</div>
          <div style={statLabelStyle}>Best Score</div>
        </div>
        <div style={statItemStyle}>
          <div style={statValueStyle}>11.5</div>
          <div style={statLabelStyle}>Average</div>
        </div>
        <div style={statItemStyle}>
          <div style={statValueStyle}>3</div>
          <div style={statLabelStyle}>This Month</div>
        </div>
      </div>

      <div style={{ textAlign: 'center' }}>
        <button 
          style={{
            ...buttonStyle,
            backgroundColor: 'transparent',
            color: theme.colors.primary,
            border: `1px solid ${theme.colors.primary}`
          }}
          onClick={handleViewHistory}
        >
          View History
        </button>
      </div>
    </div>
  );
};

export default DrivingStatsCard;
