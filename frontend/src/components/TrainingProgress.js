import React, { useState } from 'react';
import { theme } from '../styles/theme';

function TrainingProgress() {
  const [selectedMetric, setSelectedMetric] = useState('speed');

  // Mock training data - in real app this would come from Firebase
  const trainingData = {
    speed: {
      title: 'Clubhead Speed',
      current: 95,
      target: 105,
      unit: 'mph',
      progress: 75,
      history: [88, 90, 92, 93, 94, 95],
      improvement: '+7 mph'
    },
    distance: {
      title: 'Driving Distance',
      current: 245,
      target: 265,
      unit: 'yards',
      progress: 60,
      history: [230, 235, 238, 240, 242, 245],
      improvement: '+15 yards'
    },
    accuracy: {
      title: 'Fairway Accuracy',
      current: 68,
      target: 75,
      unit: '%',
      progress: 85,
      history: [62, 64, 65, 66, 67, 68],
      improvement: '+6%'
    },
    handicap: {
      title: 'Handicap Index',
      current: 8.5,
      target: 5.0,
      unit: '',
      progress: 30,
      history: [12.2, 11.8, 11.2, 10.5, 9.2, 8.5],
      improvement: '-3.7'
    }
  };

  const containerStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.xl
  };

  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily.headline
  };

  const metricTabsStyle = {
    display: 'flex',
    gap: theme.spacing.sm,
    marginBottom: theme.spacing.lg
  };

  const tabStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.secondary,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: theme.colors.background.primary,
      color: theme.colors.primary
    }
  };

  const activeTabStyle = {
    ...tabStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark
  };

  const progressGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: theme.spacing.lg
  };

  const progressCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center',
    transition: 'all 0.3s ease',
    cursor: 'pointer',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows.md,
      borderColor: theme.colors.primary
    }
  };

  const metricValueStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline,
    transition: 'color 0.2s ease'
  };

  const metricLabelStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.body
  };

  const progressBarContainerStyle = {
    width: '100%',
    height: '8px',
    backgroundColor: theme.colors.background.secondary,
    borderRadius: theme.borderRadius.sm,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm
  };

  const progressBarStyle = {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.sm,
    transition: 'width 0.3s ease'
  };

  const progressTextStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const improvementStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body
  };

  const chartContainerStyle = {
    marginTop: theme.spacing.lg,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`
  };

  const chartTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline
  };

  const chartStyle = {
    width: '100%',
    height: '200px',
    display: 'flex',
    alignItems: 'end',
    gap: '2px',
    padding: theme.spacing.md
  };

  const barStyle = {
    flex: 1,
    backgroundColor: theme.colors.primary,
    borderRadius: '2px 2px 0 0',
    transition: 'height 0.3s ease'
  };

  const barLabelStyle = {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.text.secondary,
    textAlign: 'center',
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.body
  };

  const renderChart = (data) => {
    const maxValue = Math.max(...data.history);
    const minValue = Math.min(...data.history);
    const range = maxValue - minValue;

    return (
      <div style={chartContainerStyle}>
        <h4 style={chartTitleStyle}>Progress Over Time</h4>
        <div style={chartStyle}>
          {data.history.map((value, index) => {
            const height = range > 0 ? ((value - minValue) / range) * 100 : 50;
            return (
              <div key={index} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div 
                  style={{
                    ...barStyle,
                    height: `${height}%`,
                    backgroundColor: index === data.history.length - 1 ? theme.colors.primary : theme.colors.text.secondary
                  }}
                />
                <div style={barLabelStyle}>{value}{data.unit}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const currentMetric = trainingData[selectedMetric];

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h3 style={titleStyle}>Training Progress</h3>
      </div>

      <div style={metricTabsStyle}>
        {Object.keys(trainingData).map((metric) => (
          <button
            key={metric}
            style={selectedMetric === metric ? activeTabStyle : tabStyle}
            onClick={() => setSelectedMetric(metric)}
            onMouseEnter={(e) => {
              if (selectedMetric !== metric) {
                e.target.style.backgroundColor = theme.colors.background.primary;
                e.target.style.color = theme.colors.primary;
              }
            }}
            onMouseLeave={(e) => {
              if (selectedMetric !== metric) {
                e.target.style.backgroundColor = 'transparent';
                e.target.style.color = theme.colors.text.secondary;
              }
            }}
          >
            {trainingData[metric].title}
          </button>
        ))}
      </div>

      <div style={progressGridStyle}>
        <div 
          style={progressCardStyle}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = theme.shadows.md;
            e.target.style.borderColor = theme.colors.primary;
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
            e.target.style.borderColor = theme.colors.border;
          }}
        >
          <div style={metricValueStyle}>
            {currentMetric.current}{currentMetric.unit}
          </div>
          <div style={metricLabelStyle}>{currentMetric.title}</div>
          <div style={progressBarContainerStyle}>
            <div 
              style={{
                ...progressBarStyle,
                width: `${currentMetric.progress}%`
              }}
            />
          </div>
          <div style={progressTextStyle}>
            {currentMetric.progress}% to target ({currentMetric.target}{currentMetric.unit})
          </div>
          <div style={improvementStyle}>
            {currentMetric.improvement} improvement
          </div>
        </div>

        <div 
          style={progressCardStyle}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = theme.shadows.md;
            e.target.style.borderColor = theme.colors.primary;
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
            e.target.style.borderColor = theme.colors.border;
          }}
        >
          <div style={metricValueStyle}>
            {currentMetric.target}{currentMetric.unit}
          </div>
          <div style={metricLabelStyle}>Target Goal</div>
          <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSizes.sm }}>
            {currentMetric.title} target for this training cycle
          </div>
        </div>

        <div 
          style={progressCardStyle}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-2px)';
            e.target.style.boxShadow = theme.shadows.md;
            e.target.style.borderColor = theme.colors.primary;
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)';
            e.target.style.boxShadow = 'none';
            e.target.style.borderColor = theme.colors.border;
          }}
        >
          <div style={metricValueStyle}>
            {currentMetric.history.length}
          </div>
          <div style={metricLabelStyle}>Training Sessions</div>
          <div style={{ color: theme.colors.text.secondary, fontSize: theme.typography.fontSizes.sm }}>
            Sessions completed this month
          </div>
        </div>
      </div>

      {renderChart(currentMetric)}
    </div>
  );
}

export default TrainingProgress; 