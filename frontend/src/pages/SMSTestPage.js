import React, { useState } from 'react';
import { theme } from '../styles/theme';
import smsResponseHandler from '../services/SMSResponseHandler';

function SMSTestPage() {
  const [testPhone, setTestPhone] = useState('+1 (555) 123-4567');
  const [testMessage, setTestMessage] = useState('YES');
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleTestSMS = async () => {
    setLoading(true);
    try {
      const result = await smsResponseHandler.testSMSResponse(testPhone, testMessage);
      
      setTestResults(prev => [{
        timestamp: new Date().toISOString(),
        phone: testPhone,
        message: testMessage,
        result: result
      }, ...prev]);
      
    } catch (error) {
      console.error('Test failed:', error);
      setTestResults(prev => [{
        timestamp: new Date().toISOString(),
        phone: testPhone,
        message: testMessage,
        error: error.message
      }, ...prev]);
    } finally {
      setLoading(false);
    }
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
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body
  };

  const testSectionStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.xl
  };

  const sectionTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline
  };

  const formGroupStyle = {
    marginBottom: theme.spacing.lg
  };

  const labelStyle = {
    display: 'block',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const inputStyle = {
    width: '100%',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.primary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'border-color 0.2s ease',
    ':focus': {
      outline: 'none',
      borderColor: theme.colors.primary
    }
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
    fontFamily: theme.typography.fontFamily.body,
    cursor: loading ? 'not-allowed' : 'pointer',
    transition: 'all 0.2s ease',
    opacity: loading ? 0.7 : 1,
    ':hover': {
      backgroundColor: loading ? theme.colors.primary : '#009a47',
      boxShadow: loading ? 'none' : theme.shadows.green,
      transform: loading ? 'none' : 'translateY(-1px)'
    }
  };

  const resultsSectionStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const resultItemStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.md
  };

  const resultHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm
  };

  const resultTitleStyle = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily.headline
  };

  const resultTimeStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const resultDetailsStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body,
    lineHeight: theme.typography.lineHeights.normal
  };

  const successStyle = {
    color: theme.colors.success,
    fontWeight: theme.typography.fontWeights.semibold
  };

  const errorStyle = {
    color: theme.colors.error,
    fontWeight: theme.typography.fontWeights.semibold
  };

  const infoStyle = {
    backgroundColor: 'rgba(0, 175, 81, 0.1)',
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.primary}`,
    marginBottom: theme.spacing.xl
  };

  const infoTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const infoTextStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body,
    marginBottom: theme.spacing.sm
  };

  const predefinedResponses = [
    { value: 'YES', label: 'YES (Accept)' },
    { value: 'Y', label: 'Y (Accept)' },
    { value: 'NO', label: 'NO (Decline)' },
    { value: 'N', label: 'N (Decline)' },
    { value: 'ACCEPT', label: 'ACCEPT' },
    { value: 'DECLINE', label: 'DECLINE' },
    { value: 'MAYBE', label: 'MAYBE (Invalid)' },
    { value: 'HELLO', label: 'HELLO (Invalid)' }
  ];

  const predefinedPhones = [
    { value: '+1 (555) 123-4567', label: 'John Smith (user-1)' },
    { value: '+1 (555) 234-5678', label: 'Sarah Johnson (user-2)' },
    { value: '+1 (555) 456-7890', label: 'Lisa Chen (user-4)' },
    { value: '+1 (555) 999-9999', label: 'Unknown User' }
  ];

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>SMS Response Testing</h1>
        <p style={subtitleStyle}>
          Test the automated SMS response handling system for waitlist notifications
        </p>
      </div>

      <div style={infoStyle}>
        <h3 style={infoTitleStyle}>📱 SMS Response System</h3>
        <p style={infoTextStyle}>
          • <strong>Accept Responses:</strong> YES, Y, ACCEPT, OK, SURE, CONFIRM
        </p>
        <p style={infoTextStyle}>
          • <strong>Decline Responses:</strong> NO, N, DECLINE, REJECT, CANCEL, PASS
        </p>
        <p style={infoTextStyle}>
          • <strong>Invalid Responses:</strong> Any other message will receive an error response
        </p>
        <p style={infoTextStyle}>
          • <strong>Confirmation:</strong> Users receive confirmation SMS after responding
        </p>
      </div>

      <div style={testSectionStyle}>
        <h3 style={sectionTitleStyle}>Test SMS Response</h3>
        
        <div style={formGroupStyle}>
          <label style={labelStyle}>Phone Number</label>
          <select
            value={testPhone}
            onChange={(e) => setTestPhone(e.target.value)}
            style={selectStyle}
          >
            {predefinedPhones.map((phone) => (
              <option key={phone.value} value={phone.value}>
                {phone.label}
              </option>
            ))}
          </select>
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Response Message</label>
          <select
            value={testMessage}
            onChange={(e) => setTestMessage(e.target.value)}
            style={selectStyle}
          >
            {predefinedResponses.map((response) => (
              <option key={response.value} value={response.value}>
                {response.label}
              </option>
            ))}
          </select>
        </div>

        <button
          style={buttonStyle}
          onClick={handleTestSMS}
          disabled={loading}
          onMouseEnter={(e) => {
            if (!loading) {
              e.target.style.backgroundColor = '#009a47';
              e.target.style.boxShadow = theme.shadows.green;
              e.target.style.transform = 'translateY(-1px)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.target.style.backgroundColor = theme.colors.primary;
              e.target.style.boxShadow = 'none';
              e.target.style.transform = 'translateY(0)';
            }
          }}
        >
          {loading ? 'Processing...' : 'Test SMS Response'}
        </button>
      </div>

      <div style={resultsSectionStyle}>
        <h3 style={sectionTitleStyle}>Test Results</h3>
        
        {testResults.length === 0 ? (
          <p style={{ color: theme.colors.text.secondary, textAlign: 'center' }}>
            No tests run yet. Use the form above to test SMS responses.
          </p>
        ) : (
          testResults.map((result, index) => (
            <div key={index} style={resultItemStyle}>
              <div style={resultHeaderStyle}>
                <div style={resultTitleStyle}>
                  {result.error ? (
                    <span style={errorStyle}>❌ Test Failed</span>
                  ) : (
                    <span style={successStyle}>✅ Test Successful</span>
                  )}
                </div>
                <div style={resultTimeStyle}>
                  {new Date(result.timestamp).toLocaleTimeString()}
                </div>
              </div>
              
              <div style={resultDetailsStyle}>
                <div><strong>Phone:</strong> {result.phone}</div>
                <div><strong>Message:</strong> "{result.message}"</div>
                
                {result.error ? (
                  <div style={errorStyle}>
                    <strong>Error:</strong> {result.error}
                  </div>
                ) : (
                  <div>
                    <div><strong>Response Type:</strong> {result.result.responseType}</div>
                    <div><strong>Session ID:</strong> {result.result.sessionId}</div>
                    <div><strong>User ID:</strong> {result.result.userId}</div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default SMSTestPage; 