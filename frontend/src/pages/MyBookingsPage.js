import React, { useState, useEffect, useCallback } from 'react';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';
import { bookingService } from '../services/firebaseService';

function MyBookingsPage() {
  const { user } = useUser();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming' or 'past'
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const [notificationPreferences, setNotificationPreferences] = useState({
    smsEnabled: true,
    emailEnabled: true,
    phoneNumber: '',
    notificationWindow: 24 // hours to respond
  });

  const loadBookings = useCallback(async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const userBookings = await bookingService.getBookingsByUser(user.uid);
      
      // Filter bookings based on active tab
      const now = new Date();
      const filteredBookings = userBookings.filter(booking => {
        try {
          const bookingDate = new Date(booking.date + 'T' + booking.time);
          if (activeTab === 'upcoming') {
            return bookingDate >= now && booking.status !== 'cancelled';
          } else {
            return bookingDate < now || booking.status === 'cancelled';
          }
        } catch (dateError) {
          console.error('Error parsing booking date:', dateError, booking);
          // Include booking with invalid date in past sessions
          return activeTab === 'past';
        }
      });

      setBookings(filteredBookings);
    } catch (error) {
      console.error('Error loading bookings:', error);
      setBookings([]); // Set empty array to prevent further errors
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  const loadNotificationPreferences = useCallback(async () => {
    // Mock data - in real app this would come from Firebase
    const mockPreferences = {
      smsEnabled: true,
      emailEnabled: true,
      phoneNumber: user?.phoneNumber || '+1 (555) 123-4567',
      notificationWindow: 24
    };
    setNotificationPreferences(mockPreferences);
  }, [user]);

  useEffect(() => {
    if (user) {
      loadBookings();
      loadNotificationPreferences();
    }
  }, [user, loadBookings, loadNotificationPreferences]);

  useEffect(() => {
    if (user) {
      loadBookings();
    }
  }, [activeTab, user, loadBookings]);

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

  const getStatusColor = (status) => {
    switch (status) {
      case 'confirmed':
        return theme.colors.success;
      case 'waitlist':
        return theme.colors.secondary;
      case 'cancelled':
        return theme.colors.error;
      case 'completed':
        return theme.colors.text.secondary;
      default:
        return theme.colors.text.secondary;
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'confirmed':
        return 'Confirmed';
      case 'waitlist':
        return 'Waitlist';
      case 'cancelled':
        return 'Cancelled';
      case 'completed':
        return 'Completed';
      default:
        return status;
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (window.confirm('Are you sure you want to cancel this booking?')) {
      try {
        await bookingService.updateBookingStatus(bookingId, 'cancelled');
        
        // Reload bookings to reflect changes
        await loadBookings();
        
        alert('Booking cancelled successfully');
      } catch (error) {
        console.error('Error cancelling booking:', error);
        alert('Failed to cancel booking. Please try again.');
      }
    }
  };

  const handleAcceptWaitlistSpot = async (bookingId) => {
    if (window.confirm('Accept this spot? You will be moved from waitlist to confirmed session.')) {
      try {
        // Update the booking to confirmed status
        await bookingService.updateBookingStatus(bookingId, 'confirmed');
        
        // Reload bookings to reflect changes
        await loadBookings();
        
        alert('Spot accepted! You are now confirmed for this session.');
      } catch (error) {
        console.error('Error accepting waitlist spot:', error);
        alert('Failed to accept spot. Please try again.');
      }
    }
  };

  const handleDeclineWaitlistSpot = async (bookingId) => {
    if (window.confirm('Decline this spot? You will be removed from the waitlist.')) {
      try {
        await bookingService.updateBookingStatus(bookingId, 'cancelled');
        
        // Reload bookings to reflect changes
        await loadBookings();
        
        alert('Spot declined. You have been removed from the waitlist.');
      } catch (error) {
        console.error('Error declining waitlist spot:', error);
        alert('Failed to decline spot. Please try again.');
      }
    }
  };

  const handleUpdateNotificationPreferences = async () => {
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      alert('Notification preferences updated successfully!');
      setShowNotificationSettings(false);
    } catch (error) {
      alert('Failed to update preferences. Please try again.');
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

  const tabsContainerStyle = {
    display: 'flex',
    justifyContent: 'center',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.xl
  };

  const tabStyle = {
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: 'transparent',
    color: theme.colors.text.secondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: theme.colors.background.secondary,
      color: theme.colors.primary,
      borderColor: theme.colors.primary
    }
  };

  const activeTabStyle = {
    ...tabStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderColor: theme.colors.primary
  };

  const notificationSettingsButtonStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    marginBottom: theme.spacing.lg,
    ':hover': {
      backgroundColor: '#009a47',
      boxShadow: theme.shadows.green,
      transform: 'translateY(-1px)'
    }
  };

  const bookingsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
    gap: theme.spacing.lg
  };

  const bookingCardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    transition: 'all 0.3s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: theme.shadows.lg,
      borderColor: theme.colors.primary
    }
  };

  const bookingHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md
  };

  const bookingTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    fontFamily: theme.typography.fontFamily.headline
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

  const bookingInfoStyle = {
    marginBottom: theme.spacing.md
  };

  const infoRowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body
  };

  const infoLabelStyle = {
    color: theme.colors.text.secondary,
    fontWeight: theme.typography.fontWeights.medium
  };

  const infoValueStyle = {
    color: theme.colors.text.primary,
    fontWeight: theme.typography.fontWeights.semibold
  };

  const waitlistInfoStyle = {
    backgroundColor: 'rgba(244, 238, 25, 0.1)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    border: `1px solid ${theme.colors.secondary}`
  };

  const waitlistTitleStyle = {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.headline
  };

  const waitlistTextStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body,
    lineHeight: theme.typography.lineHeights.normal
  };

  const notificationInfoStyle = {
    backgroundColor: 'rgba(0, 175, 81, 0.1)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    border: `1px solid ${theme.colors.primary}`
  };

  const notificationTitleStyle = {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.headline
  };

  const notificationTextStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body,
    lineHeight: theme.typography.lineHeights.normal
  };

  const notesStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
    border: `1px solid ${theme.colors.border}`
  };

  const notesTitleStyle = {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily.headline
  };

  const notesTextStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body,
    lineHeight: theme.typography.lineHeights.normal
  };

  const actionButtonsStyle = {
    display: 'flex',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md
  };

  const actionButtonStyle = {
    flex: 1,
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    ':hover': {
      transform: 'translateY(-1px)'
    }
  };

  const acceptButtonStyle = {
    ...actionButtonStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    ':hover': {
      backgroundColor: '#009a47',
      boxShadow: theme.shadows.green,
      transform: 'translateY(-1px)'
    }
  };

  const declineButtonStyle = {
    ...actionButtonStyle,
    backgroundColor: theme.colors.error,
    color: theme.colors.text.primary,
    ':hover': {
      backgroundColor: '#d32f2f',
      transform: 'translateY(-1px)'
    }
  };

  const cancelButtonStyle = {
    ...actionButtonStyle,
    backgroundColor: theme.colors.error,
    color: theme.colors.text.primary,
    ':hover': {
      backgroundColor: '#d32f2f',
      transform: 'translateY(-1px)'
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

  const modalOverlayStyle = {
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
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto'
  };

  const modalTitleStyle = {
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

  const checkboxStyle = {
    marginRight: theme.spacing.sm
  };

  const modalButtonsStyle = {
    display: 'flex',
    gap: theme.spacing.md,
    marginTop: theme.spacing.xl
  };

  const saveButtonStyle = {
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

  if (!user) {
    return (
      <div style={containerStyle}>
        <div style={headerStyle}>
          <h1 style={titleStyle}>My Bookings</h1>
          <p style={subtitleStyle}>Please log in to view your bookings</p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>My Bookings</h1>
        <p style={subtitleStyle}>
          View and manage your scheduled training sessions
        </p>
      </div>

      <div style={{ textAlign: 'center', marginBottom: theme.spacing.lg }}>
        <button
          style={notificationSettingsButtonStyle}
          onClick={() => setShowNotificationSettings(true)}
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
          ⚙️ Notification Settings
        </button>
      </div>

      <div style={tabsContainerStyle}>
        <button
          style={activeTab === 'upcoming' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('upcoming')}
          onMouseEnter={(e) => {
            if (activeTab !== 'upcoming') {
              e.target.style.backgroundColor = theme.colors.background.secondary;
              e.target.style.color = theme.colors.primary;
              e.target.style.borderColor = theme.colors.primary;
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'upcoming') {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = theme.colors.text.secondary;
              e.target.style.borderColor = theme.colors.border;
            }
          }}
        >
          Upcoming Sessions
        </button>
        <button
          style={activeTab === 'past' ? activeTabStyle : tabStyle}
          onClick={() => setActiveTab('past')}
          onMouseEnter={(e) => {
            if (activeTab !== 'past') {
              e.target.style.backgroundColor = theme.colors.background.secondary;
              e.target.style.color = theme.colors.primary;
              e.target.style.borderColor = theme.colors.primary;
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== 'past') {
              e.target.style.backgroundColor = 'transparent';
              e.target.style.color = theme.colors.text.secondary;
              e.target.style.borderColor = theme.colors.border;
            }
          }}
        >
          Past Sessions
        </button>
      </div>

      {loading ? (
        <div style={loadingStyle}>Loading your bookings...</div>
      ) : bookings.length === 0 ? (
        <div style={emptyStateStyle}>
          <h3 style={{ marginBottom: theme.spacing.md }}>
            {activeTab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions'}
          </h3>
          <p>
            {activeTab === 'upcoming' 
              ? 'Book your first training session to get started!'
              : 'Your completed sessions will appear here.'
            }
          </p>
        </div>
      ) : (
        <div style={bookingsGridStyle}>
          {bookings.map((booking) => (
            <div 
              key={booking.id} 
              style={bookingCardStyle}
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
              <div style={bookingHeaderStyle}>
                <h3 style={bookingTitleStyle}>
                  {booking.type === 'session' ? 'Training Session' : 'Waitlist'}
                </h3>
                <div 
                  style={{
                    ...statusBadgeStyle,
                    backgroundColor: getStatusColor(booking.status),
                    color: booking.status === 'confirmed' ? theme.colors.text.dark : theme.colors.text.primary
                  }}
                >
                  {getStatusText(booking.status)}
                </div>
              </div>

              <div style={bookingInfoStyle}>
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>Date & Time:</span>
                  <span style={infoValueStyle}>{formatDate(booking.date, booking.time)}</span>
                </div>
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>Type:</span>
                  <span style={infoValueStyle}>{booking.type === 'session' ? 'Training Session' : 'Waitlist'}</span>
                </div>
                <div style={infoRowStyle}>
                  <span style={infoLabelStyle}>Location:</span>
                  <span style={infoValueStyle}>RYP Golf Training Facility</span>
                </div>
                {booking.position && (
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>Waitlist Position:</span>
                    <span style={infoValueStyle}>#{booking.position}</span>
                  </div>
                )}
                {booking.price > 0 && (
                  <div style={infoRowStyle}>
                    <span style={infoLabelStyle}>Price:</span>
                    <span style={infoValueStyle}>${booking.price}</span>
                  </div>
                )}
              </div>

              {booking.status === 'waitlist' && (
                <div style={waitlistInfoStyle}>
                  <div style={waitlistTitleStyle}>Waitlist Information</div>
                  <div style={waitlistTextStyle}>
                    You are currently on the waitlist for this session. 
                    You will be notified via SMS/email when a spot becomes available.
                  </div>
                </div>
              )}

              {booking.userName && (
                <div style={notesStyle}>
                  <div style={notesTitleStyle}>Booking Details</div>
                  <div style={notesTextStyle}>
                    Booked by: {booking.userName}<br/>
                    Email: {booking.userEmail}<br/>
                    {booking.userPhone && `Phone: ${booking.userPhone}`}
                  </div>
                </div>
              )}

              {activeTab === 'upcoming' && (
                <div style={actionButtonsStyle}>
                  {booking.status === 'confirmed' && (
                    <button
                      style={cancelButtonStyle}
                      onClick={() => handleCancelBooking(booking.id)}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#d32f2f';
                        e.target.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = theme.colors.error;
                        e.target.style.transform = 'translateY(0)';
                      }}
                    >
                      Cancel Session
                    </button>
                  )}
                  {booking.status === 'waitlist' && (
                    <button
                      style={cancelButtonStyle}
                      onClick={() => handleDeclineWaitlistSpot(booking.id)}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = '#d32f2f';
                        e.target.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = theme.colors.error;
                        e.target.style.transform = 'translateY(0)';
                      }}
                    >
                      Remove from Waitlist
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showNotificationSettings && (
        <div style={modalOverlayStyle} onClick={() => setShowNotificationSettings(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h3 style={modalTitleStyle}>Notification Settings</h3>
            
            <div style={formGroupStyle}>
              <label style={labelStyle}>
                <input
                  type="checkbox"
                  checked={notificationPreferences.smsEnabled}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    smsEnabled: e.target.checked
                  })}
                  style={checkboxStyle}
                />
                Enable SMS Notifications
              </label>
              <p style={{ fontSize: '0.9em', color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}>
                Receive text messages when spots become available
              </p>
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>
                <input
                  type="checkbox"
                  checked={notificationPreferences.emailEnabled}
                  onChange={(e) => setNotificationPreferences({
                    ...notificationPreferences,
                    emailEnabled: e.target.checked
                  })}
                  style={checkboxStyle}
                />
                Enable Email Notifications
              </label>
              <p style={{ fontSize: '0.9em', color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}>
                Receive email notifications when spots become available
              </p>
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Phone Number</label>
              <input
                type="tel"
                value={notificationPreferences.phoneNumber}
                onChange={(e) => setNotificationPreferences({
                  ...notificationPreferences,
                  phoneNumber: e.target.value
                })}
                placeholder="+1 (555) 123-4567"
                style={inputStyle}
              />
              <p style={{ fontSize: '0.9em', color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}>
                Used for SMS notifications
              </p>
            </div>

            <div style={formGroupStyle}>
              <label style={labelStyle}>Response Window</label>
              <select
                value={notificationPreferences.notificationWindow}
                onChange={(e) => setNotificationPreferences({
                  ...notificationPreferences,
                  notificationWindow: parseInt(e.target.value)
                })}
                style={inputStyle}
              >
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>48 hours</option>
              </select>
              <p style={{ fontSize: '0.9em', color: theme.colors.text.secondary, marginTop: theme.spacing.xs }}>
                Time you have to respond to waitlist notifications
              </p>
            </div>

            <div style={modalButtonsStyle}>
              <button
                style={saveButtonStyle}
                onClick={handleUpdateNotificationPreferences}
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
                Save Settings
              </button>
              <button
                style={cancelModalButtonStyle}
                onClick={() => setShowNotificationSettings(false)}
                onMouseEnter={(e) => {
                  e.target.style.backgroundColor = theme.colors.background.primary;
                  e.target.style.borderColor = theme.colors.primary;
                }}
                onMouseLeave={(e) => {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = theme.colors.border;
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

export default MyBookingsPage; 