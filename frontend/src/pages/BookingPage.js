import React, { useState, useEffect } from 'react';
import { auth } from '../firebase';
import { theme } from '../styles/theme';
import automatedNotificationService from '../services/AutomatedNotificationService';
import { bookingService } from '../services/firebaseService';
import { useUser } from '../contexts/UserContext';

function BookingPage() {
  const { user } = useUser();
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [bookingType, setBookingType] = useState('session'); // 'session' or 'waitlist'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [bookings, setBookings] = useState({});
  const [loadingBookings, setLoadingBookings] = useState(true);

  useEffect(() => {
    loadAllBookings();
  }, []);

  const loadAllBookings = async () => {
    setLoadingBookings(true);
    try {
      const allBookings = await bookingService.getAllBookings();
      
      // Group bookings by date and time
      const groupedBookings = {};
      allBookings.forEach(booking => {
        try {
          const key = `${booking.date}-${booking.time}`;
          if (!groupedBookings[key]) {
            groupedBookings[key] = {
              sessions: [],
              waitlist: []
            };
          }
          
          if (booking.type === 'session') {
            groupedBookings[key].sessions.push(booking);
          } else if (booking.type === 'waitlist') {
            groupedBookings[key].waitlist.push(booking);
          }
        } catch (bookingError) {
          console.error('Error processing booking:', bookingError, booking);
          // Skip malformed bookings
        }
      });
      
      setBookings(groupedBookings);
    } catch (error) {
      console.error('Error loading bookings:', error);
      setMessage('Error loading booking data. Please refresh the page.');
      // Set empty bookings to prevent further errors
      setBookings({});
    } finally {
      setLoadingBookings(false);
    }
  };

  // Generate available dates for the next 4 weeks
  const generateAvailableDates = () => {
    const dates = [];
    const today = new Date();
    
    for (let i = 0; i < 28; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);
      
      // Only include Mon-Thu and Sat
      const dayOfWeek = date.getDay();
      if ((dayOfWeek >= 1 && dayOfWeek <= 4) || dayOfWeek === 6) {
        dates.push(date);
      }
    }
    
    return dates;
  };

  const getTimeSlots = (date) => {
    const dayOfWeek = date.getDay();
    const isSaturday = dayOfWeek === 6;
    
    if (isSaturday) {
      return [
        { time: '08:00', label: '8:00 AM' },
        { time: '09:00', label: '9:00 AM' }
      ];
    } else {
      return [
        { time: '16:00', label: '4:00 PM' },
        { time: '17:00', label: '5:00 PM' },
        { time: '18:00', label: '6:00 PM' }
      ];
    }
  };

  // Get booking data for a specific date and time
  const getBookingData = (date, time) => {
    const key = `${date.toISOString().split('T')[0]}-${time}`;
    const bookingData = bookings[key] || { sessions: [], waitlist: [] };
    
    return {
      sessions: bookingData.sessions.length,
      waitlist: bookingData.waitlist.length,
      waitlistQueue: bookingData.waitlist.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    };
  };

  const formatDate = (date) => {
    const options = { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    };
    return date.toLocaleDateString('en-US', options);
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp);
    const options = { 
      hour: 'numeric', 
      minute: 'numeric', 
      hour12: true 
    };
    return date.toLocaleDateString('en-US', options);
  };

  const handleBooking = async () => {
    if (!user) {
      setMessage('Please log in to book a session');
      return;
    }

    if (!selectedDate || !selectedTime) {
      setMessage('Please select a date and time');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const bookingData = getBookingData(selectedDate, selectedTime);
      const sessionId = `${selectedDate.toISOString().split('T')[0]}-${selectedTime}`;
      
      if (bookingType === 'session') {
        if (bookingData.sessions >= 16) {
          setMessage('Session is full. You have been added to the waitlist automatically.');
          await handleAutomatedWaitlistBooking(sessionId, bookingData);
        } else {
          // Create actual booking in Firebase
          const booking = {
            userId: user.uid,
            userName: user.displayName || 'Golfer',
            userEmail: user.email,
            userPhone: user.phoneNumber || '',
            date: selectedDate.toISOString().split('T')[0],
            time: selectedTime,
            type: 'session',
            status: 'confirmed',
            price: 0, // Free sessions for now
            createdAt: new Date()
          };

          await bookingService.createBooking(booking);
          setMessage(`Successfully booked session for ${formatDate(selectedDate)} at ${selectedTime}!`);
        }
      } else {
        await handleAutomatedWaitlistBooking(sessionId, bookingData);
      }
      
      // Reload bookings to reflect changes
      try {
        await loadAllBookings();
      } catch (reloadError) {
        console.error('Error reloading bookings:', reloadError);
        // Don't show error to user since booking was successful
      }
      
      // Reset selections
      setSelectedDate(null);
      setSelectedTime(null);
      setBookingType('session');
      
      setTimeout(() => setMessage(''), 5000);
    } catch (error) {
      console.error('Booking error:', error);
      setMessage('Booking failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleAutomatedWaitlistBooking = async (sessionId, bookingData) => {
    const userPosition = bookingData.waitlistQueue.length + 1;
    
    if (userPosition <= 5) {
      // Create waitlist booking in Firebase
      const waitlistBooking = {
        userId: user.uid,
        userName: user.displayName || 'Golfer',
        userEmail: user.email,
        userPhone: user.phoneNumber || '',
        date: selectedDate.toISOString().split('T')[0],
        time: selectedTime,
        type: 'waitlist',
        status: 'waiting',
        position: userPosition,
        price: 0,
        createdAt: new Date()
      };

      await bookingService.createBooking(waitlistBooking);
      
      // Use automated notification service
      const userData = {
        name: user.displayName || 'Golfer',
        phone: user.phoneNumber || '+1 (555) 000-0000',
        email: user.email || 'user@email.com'
      };
      
      const result = await automatedNotificationService.addToWaitlist(sessionId, user.uid, userData);
      
      if (result.success) {
        setMessage(`Added to waitlist position #${userPosition} for ${formatDate(selectedDate)} at ${selectedTime}. You will be notified automatically when a spot becomes available.`);
        
        // The automated service will handle notifications automatically
        console.log('Automated waitlist system activated');
      } else {
        setMessage('Failed to add to waitlist. Please try again.');
      }
    } else {
      setMessage('Waitlist is full. Please try a different time or date.');
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

  const bookingContainerStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: theme.spacing.xl,
    marginBottom: theme.spacing.xl
  };

  const sectionStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const sectionTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.headline
  };

  const dateGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: theme.spacing.md
  };

  const dateButtonStyle = {
    padding: theme.spacing.md,
    backgroundColor: 'transparent',
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    textAlign: 'center',
    ':hover': {
      backgroundColor: theme.colors.background.primary,
      borderColor: theme.colors.primary
    }
  };

  const selectedDateButtonStyle = {
    ...dateButtonStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderColor: theme.colors.primary
  };

  const timeGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: theme.spacing.md
  };

  const timeButtonStyle = {
    padding: theme.spacing.md,
    backgroundColor: 'transparent',
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.sm,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    textAlign: 'center',
    ':hover': {
      backgroundColor: theme.colors.background.primary,
      borderColor: theme.colors.primary
    }
  };

  const selectedTimeButtonStyle = {
    ...timeButtonStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderColor: theme.colors.primary
  };

  const capacityInfoStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    marginTop: theme.spacing.lg
  };

  const capacityTitleStyle = {
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const capacityTextStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const waitlistQueueStyle = {
    backgroundColor: 'rgba(244, 238, 25, 0.1)',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
    border: `1px solid ${theme.colors.secondary}`
  };

  const waitlistTitleStyle = {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.secondary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const waitlistItemStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body,
    marginBottom: theme.spacing.xs,
    paddingLeft: theme.spacing.sm
  };

  const bookingTypeContainerStyle = {
    display: 'flex',
    gap: theme.spacing.md,
    marginBottom: theme.spacing.lg
  };

  const bookingTypeButtonStyle = {
    flex: 1,
    padding: theme.spacing.md,
    backgroundColor: 'transparent',
    color: theme.colors.text.primary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease',
    ':hover': {
      backgroundColor: theme.colors.background.primary,
      borderColor: theme.colors.primary
    }
  };

  const selectedBookingTypeButtonStyle = {
    ...bookingTypeButtonStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderColor: theme.colors.primary
  };

  const bookButtonStyle = {
    width: '100%',
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    opacity: loading ? 0.7 : 1,
    ':hover': {
      backgroundColor: loading ? theme.colors.primary : '#009a47',
      boxShadow: loading ? 'none' : theme.shadows.green,
      transform: loading ? 'none' : 'translateY(-1px)'
    }
  };

  const messageStyle = {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily.body
  };

  const successMessageStyle = {
    ...messageStyle,
    backgroundColor: 'rgba(0, 175, 81, 0.1)',
    color: theme.colors.primary,
    border: `1px solid ${theme.colors.primary}`
  };

  const errorMessageStyle = {
    ...messageStyle,
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    color: theme.colors.error,
    border: `1px solid ${theme.colors.error}`
  };

  const infoStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
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

  const automationInfoStyle = {
    backgroundColor: 'rgba(0, 175, 81, 0.1)',
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.primary}`,
    marginBottom: theme.spacing.xl
  };

  const automationTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.md,
    fontFamily: theme.typography.fontFamily.headline
  };

  const automationTextStyle = {
    fontSize: theme.typography.fontSizes.base,
    color: theme.colors.text.secondary,
    lineHeight: theme.typography.lineHeights.normal,
    fontFamily: theme.typography.fontFamily.body,
    marginBottom: theme.spacing.sm
  };

  const availableDates = generateAvailableDates();

  if (loadingBookings) {
    return (
      <div style={containerStyle}>
        <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
          <h2 style={{ color: theme.colors.primary, marginBottom: theme.spacing.md }}>
            Loading Booking System...
          </h2>
          <p style={{ color: theme.colors.text.secondary }}>
            Please wait while we load the latest availability.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>Book Your Training Session</h1>
        <p style={subtitleStyle}>
          Reserve your spot for personalized training sessions with RYP Golf professionals
        </p>
      </div>

      {message && (
        <div style={message.includes('Successfully') || message.includes('Added to waitlist') ? successMessageStyle : errorMessageStyle}>
          {message}
        </div>
      )}

      <div style={infoStyle}>
        <h3 style={infoTitleStyle}>Session Information</h3>
        <p style={infoTextStyle}>
          • <strong>Duration:</strong> 1 hour per session
        </p>
        <p style={infoTextStyle}>
          • <strong>Capacity:</strong> 16 spots per session + 5 waitlist spots
        </p>
        <p style={infoTextStyle}>
          • <strong>Schedule:</strong> Monday-Thursday 4-7 PM, Saturday 8-10 AM
        </p>
        <p style={infoTextStyle}>
          • <strong>Location:</strong> RYP Golf Training Facility
        </p>
      </div>

      <div style={automationInfoStyle}>
        <h3 style={automationTitleStyle}>🤖 Fully Automated Waitlist System</h3>
        <p style={automationTextStyle}>
          • <strong>Automatic Queue:</strong> Join waitlist in order of registration
        </p>
        <p style={automationTextStyle}>
          • <strong>Instant Notifications:</strong> SMS/email sent automatically when spots open
        </p>
        <p style={automationTextStyle}>
          • <strong>24-Hour Response:</strong> Accept or decline within 24 hours
        </p>
        <p style={automationTextStyle}>
          • <strong>No Manual Intervention:</strong> System handles everything automatically
        </p>
        <p style={automationTextStyle}>
          • <strong>Smart Processing:</strong> Automatically moves next person in line when spot opens
        </p>
      </div>

      <div style={bookingContainerStyle}>
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Select Date</h3>
          <div style={dateGridStyle}>
            {availableDates.map((date) => {
              const isSelected = selectedDate && 
                selectedDate.toDateString() === date.toDateString();
              
              return (
                <button
                  key={date.toISOString()}
                  style={isSelected ? selectedDateButtonStyle : dateButtonStyle}
                  onClick={() => setSelectedDate(date)}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.target.style.backgroundColor = theme.colors.background.primary;
                      e.target.style.borderColor = theme.colors.primary;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.target.style.backgroundColor = 'transparent';
                      e.target.style.borderColor = theme.colors.border;
                    }
                  }}
                >
                  {formatDate(date)}
                </button>
              );
            })}
          </div>
        </div>

        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Select Time</h3>
          {selectedDate ? (
            <>
              <div style={timeGridStyle}>
                {getTimeSlots(selectedDate).map((slot) => {
                  const isSelected = selectedTime === slot.time;
                  const bookingData = getBookingData(selectedDate, slot.time);
                  const isFull = bookingData.sessions >= 16;
                  const isWaitlistFull = bookingData.waitlist >= 5;
                  
                  return (
                    <button
                      key={slot.time}
                      style={isSelected ? selectedTimeButtonStyle : timeButtonStyle}
                      onClick={() => setSelectedTime(slot.time)}
                      disabled={isFull && isWaitlistFull}
                      onMouseEnter={(e) => {
                        if (!isSelected && !isFull && !isWaitlistFull) {
                          e.target.style.backgroundColor = theme.colors.background.primary;
                          e.target.style.borderColor = theme.colors.primary;
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isSelected && !isFull && !isWaitlistFull) {
                          e.target.style.backgroundColor = 'transparent';
                          e.target.style.borderColor = theme.colors.border;
                        }
                      }}
                    >
                      <div>{slot.label}</div>
                      <div style={{ fontSize: '0.8em', color: theme.colors.text.secondary }}>
                        {isFull ? 'Full' : `${16 - bookingData.sessions} spots`}
                      </div>
                    </button>
                  );
                })}
              </div>

              {selectedTime && (
                <div style={capacityInfoStyle}>
                  <div style={capacityTitleStyle}>Session Capacity</div>
                  <div style={capacityTextStyle}>
                    {(() => {
                      const bookingData = getBookingData(selectedDate, selectedTime);
                      const availableSpots = 16 - bookingData.sessions;
                      const availableWaitlist = 5 - bookingData.waitlist;
                      
                      return (
                        <>
                          <div>Main Session: {bookingData.sessions}/16 booked</div>
                          <div>Waitlist: {bookingData.waitlist}/5 spots</div>
                          {availableSpots > 0 && (
                            <div style={{ color: theme.colors.primary, fontWeight: 'bold' }}>
                              {availableSpots} spots available
                            </div>
                          )}
                          {availableSpots === 0 && availableWaitlist > 0 && (
                            <div style={{ color: theme.colors.secondary, fontWeight: 'bold' }}>
                              {availableWaitlist} waitlist spots available
                            </div>
                          )}
                          {availableSpots === 0 && availableWaitlist === 0 && (
                            <div style={{ color: theme.colors.error, fontWeight: 'bold' }}>
                              Session full
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Show waitlist queue if there are people waiting */}
                  {(() => {
                    const bookingData = getBookingData(selectedDate, selectedTime);
                    if (bookingData.waitlistQueue.length > 0) {
                      return (
                        <div style={waitlistQueueStyle}>
                          <div style={waitlistTitleStyle}>Current Waitlist Queue</div>
                          {bookingData.waitlistQueue.slice(0, 3).map((user, index) => (
                            <div key={user.id} style={waitlistItemStyle}>
                              #{index + 1}: {user.name} (joined {formatDateTime(user.createdAt)})
                            </div>
                          ))}
                          {bookingData.waitlistQueue.length > 3 && (
                            <div style={waitlistItemStyle}>
                              ... and {bookingData.waitlistQueue.length - 3} more
                            </div>
                          )}
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}
            </>
          ) : (
            <p style={{ color: theme.colors.text.secondary, textAlign: 'center' }}>
              Please select a date first
            </p>
          )}
        </div>
      </div>

      {selectedDate && selectedTime && (
        <div style={sectionStyle}>
          <h3 style={sectionTitleStyle}>Complete Booking</h3>
          
          <div style={bookingTypeContainerStyle}>
            <button
              style={bookingType === 'session' ? selectedBookingTypeButtonStyle : bookingTypeButtonStyle}
              onClick={() => setBookingType('session')}
              onMouseEnter={(e) => {
                if (bookingType !== 'session') {
                  e.target.style.backgroundColor = theme.colors.background.primary;
                  e.target.style.borderColor = theme.colors.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (bookingType !== 'session') {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = theme.colors.border;
                }
              }}
            >
              Main Session
            </button>
            <button
              style={bookingType === 'waitlist' ? selectedBookingTypeButtonStyle : bookingTypeButtonStyle}
              onClick={() => setBookingType('waitlist')}
              onMouseEnter={(e) => {
                if (bookingType !== 'waitlist') {
                  e.target.style.backgroundColor = theme.colors.background.primary;
                  e.target.style.borderColor = theme.colors.primary;
                }
              }}
              onMouseLeave={(e) => {
                if (bookingType !== 'waitlist') {
                  e.target.style.backgroundColor = 'transparent';
                  e.target.style.borderColor = theme.colors.border;
                }
              }}
            >
              Waitlist
            </button>
          </div>

          <div style={{ marginBottom: theme.spacing.lg }}>
            <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
              <strong>Selected:</strong> {formatDate(selectedDate)} at {selectedTime}
            </p>
            <p style={{ color: theme.colors.text.secondary }}>
              <strong>Booking Type:</strong> {bookingType === 'session' ? 'Main Session' : 'Waitlist'}
            </p>
          </div>

          <button
            style={bookButtonStyle}
            onClick={handleBooking}
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
            {loading ? 'Processing...' : `Book ${bookingType === 'session' ? 'Session' : 'Waitlist'}`}
          </button>
        </div>
      )}
    </div>
  );
}

export default BookingPage; 