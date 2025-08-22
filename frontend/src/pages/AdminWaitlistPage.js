import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { theme } from '../styles/theme';

function AdminWaitlistPage() {
  const [user, setUser] = useState(null);
  const [waitlistData, setWaitlistData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSession, setSelectedSession] = useState(null);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [sendingNotification, setSendingNotification] = useState(false);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
      if (user) {
        loadWaitlistData();
      }
    });

    return () => unsubscribe();
  }, []);

  const loadWaitlistData = async () => {
    setLoading(true);
    try {
      // Mock data - in real app this would come from Firebase
      const mockWaitlistData = [
        {
          sessionId: 'session-1',
          date: '2024-01-15',
          time: '16:00',
          instructor: 'Mike Rypien',
          location: 'RYP Golf Training Facility',
          maxCapacity: 16,
          currentBookings: 14,
          waitlistUsers: [
            {
              id: 'user-1',
              name: 'John Smith',
              email: 'john.smith@email.com',
              phone: '+1 (555) 123-4567',
              waitlistPosition: 1,
              notificationSent: false,
              notificationSentAt: null,
              responseDeadline: null
            },
            {
              id: 'user-2',
              name: 'Sarah Johnson',
              email: 'sarah.johnson@email.com',
              phone: '+1 (555) 234-5678',
              waitlistPosition: 2,
              notificationSent: false,
              notificationSentAt: null,
              responseDeadline: null
            },
            {
              id: 'user-3',
              name: 'Mike Davis',
              email: 'mike.davis@email.com',
              phone: '+1 (555) 345-6789',
              waitlistPosition: 3,
              notificationSent: false,
              notificationSentAt: null,
              responseDeadline: null
            }
          ]
        },
        {
          sessionId: 'session-2',
          date: '2024-01-18',
          time: '17:00',
          instructor: 'Coach Mark Davis',
          location: 'RYP Golf Training Facility',
          maxCapacity: 16,
          currentBookings: 16,
          waitlistUsers: [
            {
              id: 'user-4',
              name: 'Lisa Chen',
              email: 'lisa.chen@email.com',
              phone: '+1 (555) 456-7890',
              waitlistPosition: 1,
              notificationSent: true,
              notificationSentAt: '2024-01-16T10:30:00Z',
              responseDeadline: '2024-01-17T10:30:00Z'
            },
            {
              id: 'user-5',
              name: 'David Wilson',
              email: 'david.wilson@email.com',
              phone: '+1 (555) 567-8901',
              waitlistPosition: 2,
              notificationSent: false,
              notificationSentAt: null,
              responseDeadline: null
            }
          ]
        }
      ];

      setWaitlistData(mockWaitlistData);
    } catch (error) {
      console.error('Error loading waitlist data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr, timeStr) => {
    const date = new Date(dateStr + 'T' + timeStr);
    const options = { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleDateString('en-US', options);
  };

  const formatDateTime = (dateTimeStr) => {
    const date = new Date(dateTimeStr);
    const options = { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    };
    return date.toLocaleDateString('en-US', options);
  };

  const handleSendNotification = async (sessionId, userId) => {
    if (!notificationMessage.trim()) {
      alert('Please enter a notification message');
      return;
    }

    setSendingNotification(true);
    try {
      // Simulate API call to send SMS/email
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update the waitlist data
      setWaitlistData(prevData => 
        prevData.map(session => {
          if (session.sessionId === sessionId) {
            return {
              ...session,
              waitlistUsers: session.waitlistUsers.map(user => {
                if (user.id === userId) {
                  const now = new Date();
                  const deadline = new Date(now.getTime() + (24 * 60 * 60 * 1000)); // 24 hours
                  return {
                    ...user,
                    notificationSent: true,
                    notificationSentAt: now.toISOString(),
                    responseDeadline: deadline.toISOString()
                  };
                }
                return user;
              })
            };
          }
          return session;
        })
      );
      
      alert('Notification sent successfully!');
      setNotificationMessage('');
    } catch (error) {
      alert('Failed to send notification. Please try again.');
    } finally {
      setSendingNotification(false);
    }
  };

  const handleMoveToConfirmed = async (sessionId, userId) => {
    if (window.confirm('Move this user from waitlist to confirmed session?')) {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update the waitlist data
        setWaitlistData(prevData => 
          prevData.map(session => {
            if (session.sessionId === sessionId) {
              return {
                ...session,
                currentBookings: session.currentBookings + 1,
                waitlistUsers: session.waitlistUsers.filter(user => user.id !== userId)
              };
            }
            return session;
          })
        );
        
        alert('User moved to confirmed session successfully!');
      } catch (error) {
        alert('Failed to move user. Please try again.');
      }
    }
  };

  const handleRemoveFromWaitlist = async (sessionId, userId) => {
    if (window.confirm('Remove this user from the waitlist?')) {
      try {
        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Update the waitlist data
        setWaitlistData(prevData => 
          prevData.map(session => {
            if (session.sessionId === sessionId) {
              return {
                ...session,
                waitlistUsers: session.waitlistUsers.filter(user => user.id !== userId)
              };
            }
            return session;
          })
        );
        
        alert('User removed from waitlist successfully!');
      } catch (error) {
        alert('Failed to remove user. Please try again.');
      }
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

  const sessionCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg,
    transition: 'all 0.3s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows.lg,
      borderColor: theme.colors.primary
    }
  };

  const sessionHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg
  };

  const sessionTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily.headline
  };

  const sessionInfoStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const capacityStyle = {
    display: 'flex',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg
  };

  const capacityItemStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center',
    flex: 1
  };

  const capacityNumberStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    fontFamily: theme.typography.fontFamily.headline
  };

  const capacityLabelStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const waitlistTableStyle = {
    width: '100%',
    borderCollapse: 'collapse',
    marginTop: theme.spacing.lg
  };

  const tableHeaderStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
    textAlign: 'left',
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily.body,
    borderBottom: `1px solid ${theme.colors.border}`
  };

  const tableCellStyle = {
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily.body,
    borderBottom: `1px solid ${theme.colors.border}`
  };

  const statusBadgeStyle = {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  };

  const notificationSentStyle = {
    ...statusBadgeStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark
  };

  const notificationPendingStyle = {
    ...statusBadgeStyle,
    backgroundColor: theme.colors.secondary,
    color: theme.colors.text.dark
  };

  const actionButtonStyle = {
    padding: `${theme.spacing.xs} ${theme.spacing.sm}`,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.xs,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    marginRight: theme.spacing.xs,
    ':hover': {
      transform: 'translateY(-1px)'
    }
  };

  const sendButtonStyle = {
    ...actionButtonStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    ':hover': {
      backgroundColor: '#009a47',
      boxShadow: theme.shadows.green,
      transform: 'translateY(-1px)'
    }
  };

  const moveButtonStyle = {
    ...actionButtonStyle,
    backgroundColor: theme.colors.success,
    color: theme.colors.text.dark,
    ':hover': {
      backgroundColor: '#2e7d32',
      transform: 'translateY(-1px)'
    }
  };

  const removeButtonStyle = {
    ...actionButtonStyle,
    backgroundColor: theme.colors.error,
    color: theme.colors.text.primary,
    ':hover': {
      backgroundColor: '#d32f2f',
      transform: 'translateY(-1px)'
    }
  };

  const notificationModalStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const modalStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    maxWidth: '500px',
    width: '90%'
  };

  const modalTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline
  };

  const textareaStyle = {
    width: '100%',
    minHeight: '100px',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.background.primary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    color: theme.colors.text.primary,
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    resize: 'vertical',
    transition: 'border-color 0.2s ease',
    ':focus': {
      outline: 'none',
      borderColor: theme.colors.primary
    }
  };

  const modalButtonsStyle = {
    display: 'flex',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg
  };

  const sendModalButtonStyle = {
    flex: 1,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: '#009a47',
      boxShadow: theme.shadows.green,
      transform: 'translateY(-1px)'
    }
  };

  const cancelModalButtonStyle = {
    flex: 1,
    padding: `${theme.spacing.md} ${theme.spacing.lg}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: theme.colors.background.primary,
      borderColor: theme.colors.primary
    }
  };

  const emptyStateStyle = {
    textAlign: 'center',
    padding: theme.spacing['2xl'],
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const loadingStyle = {
    textAlign: 'center',
    padding: theme.spacing['2xl'],
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  if (!user) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>Admin Waitlist Management</h1>
          <p style={subtitleStyle}>Please log in to access admin features</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Admin Waitlist Management</h1>
        <p style={subtitleStyle}>
          Manage waitlist notifications and send SMS alerts to users when spots become available
        </p>
      </div>

      {loading ? (
        <div style={loadingStyle}>Loading waitlist data...</div>
      ) : waitlistData.length === 0 ? (
        <div style={emptyStateStyle}>
          <h3 style={{ marginBottom: theme.spacing.md }}>No waitlist data</h3>
          <p>No sessions currently have waitlist users.</p>
        </div>
      ) : (
        waitlistData.map((session) => (
          <div 
            key={session.sessionId} 
            style={sessionCardStyle}
            onMouseEnter={(e) => {
              e.target.style.transform = 'translateY(-2px)';
              e.target.style.boxShadow = theme.shadows.lg;
              e.target.style.borderColor = theme.colors.primary;
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = 'none';
              e.target.style.borderColor = theme.colors.border;
            }}
          >
            <div style={sessionHeaderStyle}>
              <div>
                <h3 style={sessionTitleStyle}>
                  {formatDate(session.date, session.time)}
                </h3>
                <p style={sessionInfoStyle}>
                  {session.instructor} • {session.location}
                </p>
              </div>
            </div>

            <div style={capacityStyle}>
              <div style={capacityItemStyle}>
                <div style={capacityNumberStyle}>{session.currentBookings}</div>
                <div style={capacityLabelStyle}>Confirmed</div>
              </div>
              <div style={capacityItemStyle}>
                <div style={capacityNumberStyle}>{session.maxCapacity}</div>
                <div style={capacityLabelStyle}>Capacity</div>
              </div>
              <div style={capacityItemStyle}>
                <div style={capacityNumberStyle}>{session.waitlistUsers.length}</div>
                <div style={capacityLabelStyle}>Waitlist</div>
              </div>
              <div style={capacityItemStyle}>
                <div style={capacityNumberStyle}>{session.maxCapacity - session.currentBookings}</div>
                <div style={capacityLabelStyle}>Available</div>
              </div>
            </div>

            {session.waitlistUsers.length > 0 && (
              <table style={waitlistTableStyle}>
                <thead>
                  <tr>
                    <th style={tableHeaderStyle}>Position</th>
                    <th style={tableHeaderStyle}>Name</th>
                    <th style={tableHeaderStyle}>Contact</th>
                    <th style={tableHeaderStyle}>Notification Status</th>
                    <th style={tableHeaderStyle}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {session.waitlistUsers.map((user) => (
                    <tr key={user.id}>
                      <td style={tableCellStyle}>#{user.waitlistPosition}</td>
                      <td style={tableCellStyle}>{user.name}</td>
                      <td style={tableCellStyle}>
                        <div>{user.email}</div>
                        <div style={{ color: theme.colors.text.secondary, fontSize: '0.9em' }}>
                          {user.phone}
                        </div>
                      </td>
                      <td style={tableCellStyle}>
                        {user.notificationSent ? (
                          <div>
                            <div style={notificationSentStyle}>Sent</div>
                            <div style={{ fontSize: '0.8em', color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}>
                              {formatDateTime(user.notificationSentAt)}
                            </div>
                            {user.responseDeadline && (
                              <div style={{ fontSize: '0.8em', color: theme.colors.text.secondary }}>
                                Deadline: {formatDateTime(user.responseDeadline)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={notificationPendingStyle}>Pending</div>
                        )}
                      </td>
                      <td style={tableCellStyle}>
                        {!user.notificationSent && (
                          <button
                            style={sendButtonStyle}
                            onClick={() => setSelectedSession({ sessionId: session.sessionId, userId: user.id })}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#009a47';
                              e.target.style.boxShadow = theme.shadows.green;
                              e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = theme.colors.primary;
                              e.target.style.boxShadow = 'none';
                              e.target.style.transform = 'translateY(0)';
                            }}
                          >
                            Send SMS
                          </button>
                        )}
                        {session.currentBookings < session.maxCapacity && (
                          <button
                            style={moveButtonStyle}
                            onClick={() => handleMoveToConfirmed(session.sessionId, user.id)}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = '#2e7d32';
                              e.target.style.transform = 'translateY(-1px)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = theme.colors.success;
                              e.target.style.transform = 'translateY(0)';
                            }}
                          >
                            Move to Confirmed
                          </button>
                        )}
                        <button
                          style={removeButtonStyle}
                          onClick={() => handleRemoveFromWaitlist(session.sessionId, user.id)}
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#d32f2f';
                            e.target.style.transform = 'translateY(-1px)';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = theme.colors.error;
                            e.target.style.transform = 'translateY(0)';
                          }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))
      )}

      {selectedSession && (
        <div style={notificationModalStyle} onClick={() => setSelectedSession(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={modalTitleStyle}>Send Waitlist Notification</h3>
            
            <div style={{ marginBottom: theme.spacing.lg }}>
              <label style={{ display: 'block', marginBottom: theme.spacing.sm, fontWeight: 'bold' }}>
                Notification Message
              </label>
              <textarea
                value={notificationMessage}
                onChange={(e) => setNotificationMessage(e.target.value)}
                placeholder="A spot has opened up for your waitlisted session. Please respond within 24 hours to accept or decline."
                style={textareaStyle}
              />
            </div>

            <div style={{ marginBottom: theme.spacing.lg }}>
              <p style={{ fontSize: '0.9em', color: theme.colors.text.secondary }}>
                This message will be sent via SMS and email to the user. They will have 24 hours to respond.
              </p>
            </div>

            <div style={modalButtonsStyle}>
              <button
                style={sendModalButtonStyle}
                onClick={() => handleSendNotification(selectedSession.sessionId, selectedSession.userId)}
                disabled={sendingNotification}
                onMouseEnter={(e) => {
                  if (!sendingNotification) {
                    e.target.style.backgroundColor = '#009a47';
                    e.target.style.boxShadow = theme.shadows.green;
                    e.target.style.transform = 'translateY(-1px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!sendingNotification) {
                    e.target.style.backgroundColor = theme.colors.primary;
                    e.target.style.boxShadow = 'none';
                    e.target.style.transform = 'translateY(0)';
                  }
                }}
              >
                {sendingNotification ? 'Sending...' : 'Send Notification'}
              </button>
              <button
                style={cancelModalButtonStyle}
                onClick={() => setSelectedSession(null)}
                disabled={sendingNotification}
                onMouseEnter={(e) => {
                  if (!sendingNotification) {
                    e.target.style.backgroundColor = theme.colors.background.primary;
                    e.target.style.borderColor = theme.colors.primary;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!sendingNotification) {
                    e.target.style.backgroundColor = 'transparent';
                    e.target.style.borderColor = theme.colors.border;
                  }
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminWaitlistPage; 