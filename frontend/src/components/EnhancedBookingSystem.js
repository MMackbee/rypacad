import React, { useState, useEffect } from 'react';
import { useUser } from '../contexts/UserContext';
import { theme } from '../styles/theme';
import { paymentService, pricingUtils } from '../services/paymentService';
import { tokenService } from '../services/tokenService';

function EnhancedBookingSystem() {
  const { user } = useUser();
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [selectedSessions, setSelectedSessions] = useState([]);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [userTokens, setUserTokens] = useState(null);
  const [tokenLoading, setTokenLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadUserTokens();
    }
  }, [user]);

  const loadUserTokens = async () => {
    setTokenLoading(true);
    try {
      const tokens = await tokenService.getUserTokens(user.uid);
      setUserTokens(tokens);
    } catch (error) {
      console.error('Error loading user tokens:', error);
    }
    setTokenLoading(false);
  };

  // Enhanced package data - group sessions with multiple coaches
  const packages = [
    {
      id: 'youth-starter',
      title: 'Starter',
      price: 200,
      sessionsPerMonth: 4,
      tournamentsPerMonth: 2,
      description: 'Perfect for beginners',
      sessionType: 'group', // Group sessions with multiple coaches
      maxStudents: 16,
      coaches: ['coach-mike', 'coach-sarah', 'coach-john'], // All coaches available
      sessionTypes: ['group-training']
    },
    {
      id: 'youth-developer',
      title: 'Developer',
      price: 380,
      sessionsPerMonth: 8,
      tournamentsPerMonth: 3,
      description: 'For improving players',
      sessionType: 'group',
      maxStudents: 16,
      coaches: ['coach-mike', 'coach-sarah', 'coach-john'],
      sessionTypes: ['group-training', 'video-analysis']
    },
    {
      id: 'youth-elite',
      title: 'Elite',
      price: 540,
      sessionsPerMonth: 12,
      tournamentsPerMonth: 4,
      description: 'For serious competitors',
      sessionType: 'group',
      maxStudents: 16,
      coaches: ['coach-mike', 'coach-john'], // Elite coaches only
      sessionTypes: ['group-training', 'video-analysis', 'performance-analytics']
    }
  ];

  // Coach data - for add-on programs only
  const coaches = [
    {
      id: 'coach-mike',
      name: 'Coach Mike',
      specialties: ['beginners', 'intermediate'],
      availability: ['monday', 'wednesday', 'friday'],
      rating: 4.8,
      students: 24
    },
    {
      id: 'coach-sarah',
      name: 'Coach Sarah',
      specialties: ['beginners', 'youth'],
      availability: ['tuesday', 'thursday', 'saturday'],
      rating: 4.9,
      students: 18
    },
    {
      id: 'coach-john',
      name: 'Coach John',
      specialties: ['advanced', 'elite', 'tournament-prep'],
      availability: ['monday', 'wednesday', 'friday', 'saturday'],
      rating: 4.7,
      students: 12
    }
  ];

  // Session templates for group sessions
  const sessionTemplates = [
    {
      id: 'group-training',
      title: 'Group Training Session',
      duration: 60,
      maxStudents: 16,
      description: 'Group instruction with multiple coaches',
      type: 'group'
    },
    {
      id: 'video-analysis',
      title: 'Video Analysis Session',
      duration: 45,
      maxStudents: 8,
      description: 'Small group video analysis',
      type: 'group'
    },
    {
      id: 'performance-analytics',
      title: 'Performance Analytics',
      duration: 30,
      maxStudents: 4,
      description: 'Advanced performance tracking',
      type: 'group'
    }
  ];

  // Enhanced booking flow for group sessions
  const handlePackageSelection = (package) => {
    setSelectedPackage(package);
    setSelectedAddOns([]);
    setSelectedSessions([]);
    
    // Load available group sessions for this package
    loadAvailableGroupSessions(package);
  };

  const loadAvailableGroupSessions = async (package) => {
    setLoading(true);
    try {
      // This would fetch from your Firebase backend
      const sessions = await fetchGroupSessionAvailability(package.id);
      setAvailableSessions(sessions);
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
    setLoading(false);
  };

  const handleSessionSelection = (session) => {
    if (selectedSessions.find(s => s.id === session.id)) {
      setSelectedSessions(selectedSessions.filter(s => s.id !== session.id));
    } else {
      // Check if user has already selected maximum sessions for this package
      if (selectedSessions.length >= selectedPackage.sessionsPerMonth) {
        alert(`You can only select ${selectedPackage.sessionsPerMonth} sessions per month for the ${selectedPackage.title} package.`);
        return;
      }

      // Check if user has sufficient tokens for this session
      const tokenRequirements = tokenService.getTokenRequirements();
      const requiredTokens = tokenRequirements[session.type] || { groupSessions: 1 };
      
      for (const [tokenType, quantity] of Object.entries(requiredTokens)) {
        if (!userTokens || userTokens[tokenType] < quantity) {
          alert(`Insufficient ${tokenType} tokens. You need ${quantity} tokens for this session.`);
          return;
        }
      }

      setSelectedSessions([...selectedSessions, session]);
    }
  };

  const handleAddOnSelection = (addOn) => {
    if (selectedAddOns.find(a => a.id === addOn.id)) {
      setSelectedAddOns(selectedAddOns.filter(a => a.id !== addOn.id));
    } else {
      setSelectedAddOns([...selectedAddOns, addOn]);
    }
  };

  const calculateTotal = () => {
    let total = selectedPackage ? selectedPackage.price : 0;
    selectedAddOns.forEach(addOn => {
      total += addOn.standalonePrice;
    });
    return total;
  };

  const calculateDiscount = () => {
    if (selectedAddOns.length === 0) return 0;
    
    let discountPercentage = 20; // 20% for 1 add-on
    
    const hasFitness = selectedAddOns.some(addOn => 
      addOn.id.startsWith('ryp-academy-')
    );
    const hasMental = selectedAddOns.some(addOn => 
      addOn.id.startsWith('mental-') || addOn.id.startsWith('tournament-prep')
    );
    
    if (hasFitness && hasMental) {
      discountPercentage = 30; // 30% for both
    }

    const addOnsTotal = selectedAddOns.reduce((sum, addOn) => sum + addOn.standalonePrice, 0);
    return (addOnsTotal * discountPercentage) / 100;
  };

  const handlePackageBooking = async () => {
    if (!selectedPackage || selectedSessions.length === 0) {
      alert('Please select a package and at least one session');
      return;
    }

    setPaymentProcessing(true);
    try {
      const bookingData = {
        userId: user.uid,
        packageId: selectedPackage.id,
        packageType: 'group', // Group sessions
        sessions: selectedSessions,
        addOns: selectedAddOns,
        totalAmount: calculateTotal() - calculateDiscount(),
        discount: calculateDiscount()
      };

      // Process payment through Stripe
      const paymentResult = await processStripePayment(bookingData);
      
      if (paymentResult.success) {
        // Add tokens to user account
        const packageTokens = tokenService.calculatePackageTokens(selectedPackage.id);
        for (const [tokenType, quantity] of Object.entries(packageTokens)) {
          await tokenService.addTokens(user.uid, tokenType, quantity, 'package_purchase');
        }

        // Add add-on tokens
        for (const addOn of selectedAddOns) {
          const addOnTokens = tokenService.calculateAddOnTokens(addOn.id);
          for (const [tokenType, quantity] of Object.entries(addOnTokens)) {
            await tokenService.addTokens(user.uid, tokenType, quantity, 'addon_purchase');
          }
        }

        // Use tokens for selected sessions
        for (const session of selectedSessions) {
          const tokenRequirements = tokenService.getTokenRequirements();
          const requiredTokens = tokenRequirements[session.type] || { groupSessions: 1 };
          
          for (const [tokenType, quantity] of Object.entries(requiredTokens)) {
            await tokenService.useTokens(user.uid, tokenType, quantity, session.id);
          }
        }

        // Create booking in Firebase
        const bookingId = await createBooking(bookingData);
        
        // Send confirmation SMS
        await sendBookingConfirmation(user.phoneNumber, bookingData);
        
        // Send Slack notification
        await sendSlackNotification({
          text: `📅 New group booking: ${user.displayName} - ${selectedPackage.title} (${selectedSessions.length} sessions)`,
          channel: '#bookings'
        });

        // Reload user tokens
        await loadUserTokens();

        alert('Payment successful! Booking confirmed. Check your email and SMS for details.');
      } else {
        alert('Payment failed. Please try again.');
      }
    } catch (error) {
      console.error('Booking error:', error);
      alert('Error processing payment. Please try again.');
    }
    setPaymentProcessing(false);
  };

  const handleAddOnPayment = async (addOn) => {
    setPaymentProcessing(true);
    try {
      const paymentData = {
        userId: user.uid,
        addOnId: addOn.id,
        addOnType: 'individual',
        amount: addOn.standalonePrice,
        coach: addOn.coach,
        description: addOn.description
      };

      // Process payment through Stripe
      const paymentResult = await processStripePayment(paymentData);
      
      if (paymentResult.success) {
        // Add tokens to user account
        const addOnTokens = tokenService.calculateAddOnTokens(addOn.id);
        for (const [tokenType, quantity] of Object.entries(addOnTokens)) {
          await tokenService.addTokens(user.uid, tokenType, quantity, 'addon_purchase');
        }

        // Create add-on booking in Firebase
        const bookingId = await createAddOnBooking(paymentData);
        
        // Generate Calendly link for booking
        const calendlyLink = generateCalendlyLink(addOn);
        
        // Send confirmation with Calendly link
        await sendAddOnConfirmation(user.phoneNumber, addOn, calendlyLink);
        
        // Send Slack notification
        await sendSlackNotification({
          text: `👨‍🏫 New add-on purchase: ${user.displayName} - ${addOn.title} with ${addOn.coach}`,
          channel: '#add-ons'
        });

        // Reload user tokens
        await loadUserTokens();

        alert(`Payment successful! You can now book your sessions with ${addOn.coach}. Check your email for booking instructions.`);
        
        // Open Calendly link
        window.open(calendlyLink, '_blank');
      } else {
        alert('Payment failed. Please try again.');
      }
    } catch (error) {
      console.error('Add-on payment error:', error);
      alert('Error processing payment. Please try again.');
    }
    setPaymentProcessing(false);
  };

  // Stripe payment processing
  const processStripePayment = async (paymentData) => {
    try {
      // Create payment intent
      const clientSecret = await paymentService.createPaymentIntent({
        amount: paymentData.totalAmount || paymentData.amount,
        currency: 'usd',
        packageId: paymentData.packageId || paymentData.addOnId,
        packageType: paymentData.packageType || paymentData.addOnType,
        addOns: paymentData.addOns || []
      });

      // For demo purposes, simulate successful payment
      // In production, you would integrate with Stripe Elements
      return { success: true, clientSecret };
    } catch (error) {
      console.error('Payment processing error:', error);
      return { success: false, error: error.message };
    }
  };

  // Generate Calendly links for coaches
  const generateCalendlyLink = (addOn) => {
    const calendlyLinks = {
      'ryp-academy-starter': 'https://calendly.com/coach-phil/ryp-academy-fitness',
      'mental-starter': 'https://calendly.com/coach-yannick/mental-performance',
      'tournament-prep': 'https://calendly.com/coach-yannick/tournament-prep'
    };
    
    return calendlyLinks[addOn.id] || 'https://calendly.com/rypgolf/consultation';
  };

  // Mock functions (replace with actual Firebase calls)
  const fetchGroupSessionAvailability = async (packageId) => {
    // This would fetch from Firebase
    return [
      {
        id: 'session-1',
        date: '2024-01-22',
        time: '16:00',
        type: 'group-training',
        availableSpots: 12, // Out of 16 total spots
        location: 'RYP Golf Facility',
        coaches: ['Coach Mike', 'Coach Sarah'], // Multiple coaches
        description: 'Group training session with multiple coaches'
      },
      {
        id: 'session-2',
        date: '2024-01-24',
        time: '17:00',
        type: 'group-training',
        availableSpots: 8,
        location: 'RYP Golf Facility',
        coaches: ['Coach John', 'Coach Mike'],
        description: 'Group training session with multiple coaches'
      },
      {
        id: 'session-3',
        date: '2024-01-26',
        time: '15:00',
        type: 'video-analysis',
        availableSpots: 5, // Out of 8 total spots
        location: 'RYP Golf Facility',
        coaches: ['Coach Sarah'],
        description: 'Video analysis session'
      }
    ];
  };

  const createBooking = async (bookingData) => {
    // This would create in Firebase
    return 'booking-123';
  };

  const createAddOnBooking = async (paymentData) => {
    // This would create add-on booking in Firebase
    return 'addon-booking-123';
  };

  const sendBookingConfirmation = async (phone, bookingData) => {
    // This would send SMS via Twilio
    console.log('Sending confirmation to:', phone);
  };

  const sendAddOnConfirmation = async (phone, addOn, calendlyLink) => {
    // This would send SMS with Calendly link
    console.log('Sending add-on confirmation to:', phone, 'with link:', calendlyLink);
  };

  const sendSlackNotification = async (notification) => {
    // This would send to Slack
    console.log('Sending Slack notification:', notification);
  };

  if (tokenLoading) {
    return (
      <div style={{ padding: theme.spacing.lg, textAlign: 'center' }}>
        Loading your account information...
      </div>
    );
  }

  return (
    <div style={{ padding: theme.spacing.lg, maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ color: theme.colors.primary, marginBottom: theme.spacing.lg }}>
        Book Your Golf Training
      </h1>

      {/* Token Balance Display */}
      {userTokens && (
        <div style={{ 
          marginBottom: theme.spacing.lg,
          padding: theme.spacing.md,
          backgroundColor: theme.colors.background.secondary,
          borderRadius: theme.borderRadius.md,
          border: `1px solid ${theme.colors.border}`
        }}>
          <h3 style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
            Your Token Balance
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: theme.spacing.sm }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: theme.colors.text.primary }}>
                {userTokens.groupSessions || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: theme.colors.text.secondary }}>
                Group Sessions
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: theme.colors.text.primary }}>
                {userTokens.tournaments || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: theme.colors.text.secondary }}>
                Tournaments
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: theme.colors.text.primary }}>
                {userTokens.fitnessSessions || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: theme.colors.text.secondary }}>
                Fitness Sessions
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: theme.colors.text.primary }}>
                {userTokens.mentalSessions || 0}
              </div>
              <div style={{ fontSize: '0.8rem', color: theme.colors.text.secondary }}>
                Mental Sessions
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Package Selection */}
      <div style={{ marginBottom: theme.spacing.xl }}>
        <h2 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.md }}>
          Step 1: Choose Your Package
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: theme.spacing.md }}>
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              style={{
                border: selectedPackage?.id === pkg.id ? `2px solid ${theme.colors.primary}` : `1px solid ${theme.colors.border}`,
                borderRadius: theme.borderRadius.md,
                padding: theme.spacing.md,
                cursor: 'pointer',
                backgroundColor: selectedPackage?.id === pkg.id ? theme.colors.background.secondary : theme.colors.background.primary,
                transition: 'all 0.2s ease'
              }}
              onClick={() => handlePackageSelection(pkg)}
            >
              <h3 style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                {pkg.title}
              </h3>
              <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                {pkg.description}
              </p>
              <div style={{ 
                backgroundColor: theme.colors.secondary, 
                color: 'white', 
                padding: '4px 8px', 
                borderRadius: theme.borderRadius.sm,
                display: 'inline-block',
                marginBottom: theme.spacing.sm,
                fontSize: '0.8rem'
              }}>
                Group Sessions
              </div>
              <ul style={{ marginBottom: theme.spacing.md }}>
                <li>{pkg.sessionsPerMonth} Group Sessions per Month</li>
                <li>{pkg.tournamentsPerMonth} Tournaments per Month</li>
                <li>Multiple coaches per session</li>
                <li>Progress tracking</li>
                <li>Max {pkg.maxStudents} students per session</li>
              </ul>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: theme.colors.primary }}>
                ${pkg.price}/month
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Step 2: Group Session Selection */}
      {selectedPackage && (
        <div style={{ marginBottom: theme.spacing.xl }}>
          <h2 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.md }}>
            Step 2: Select Your Group Sessions ({selectedSessions.length}/{selectedPackage.sessionsPerMonth})
          </h2>
          <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
            Choose up to {selectedPackage.sessionsPerMonth} group sessions per month. Each session includes multiple coaches.
          </p>
          {loading ? (
            <div style={{ textAlign: 'center', padding: theme.spacing.xl }}>
              Loading available sessions...
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: theme.spacing.md }}>
              {availableSessions.map((session) => (
                <div
                  key={session.id}
                  style={{
                    border: selectedSessions.find(s => s.id === session.id) ? `2px solid ${theme.colors.primary}` : `1px solid ${theme.colors.border}`,
                    borderRadius: theme.borderRadius.md,
                    padding: theme.spacing.md,
                    cursor: 'pointer',
                    backgroundColor: selectedSessions.find(s => s.id === session.id) ? theme.colors.background.secondary : theme.colors.background.primary
                  }}
                  onClick={() => handleSessionSelection(session)}
                >
                  <h3 style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                    {session.date} at {session.time}
                  </h3>
                  <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                    {session.location}
                  </p>
                  <div style={{ marginBottom: theme.spacing.sm }}>
                    <strong>Coaches:</strong> {session.coaches.join(', ')}
                  </div>
                  <div style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                    Available spots: {session.availableSpots}
                  </div>
                  <div style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
                    {session.description}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Step 3: Add-ons (Individual Coach Sessions) */}
      <div style={{ marginBottom: theme.spacing.xl }}>
        <h2 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.md }}>
          Step 3: Add Individual Coach Programs (Optional)
        </h2>
        <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.md }}>
          These are individual sessions with specific coaches. Purchase here, then book sessions through Calendly.
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: theme.spacing.md }}>
          {addOnPrograms.map((addOn) => (
            <div
              key={addOn.id}
              style={{
                border: `1px solid ${theme.colors.border}`,
                borderRadius: theme.borderRadius.md,
                padding: theme.spacing.md,
                backgroundColor: theme.colors.background.primary
              }}
            >
              <div style={{ 
                backgroundColor: theme.colors.secondary, 
                color: 'white', 
                padding: '4px 8px', 
                borderRadius: theme.borderRadius.sm,
                display: 'inline-block',
                marginBottom: theme.spacing.sm,
                fontSize: '0.8rem'
              }}>
                Individual Coach
              </div>
              <h3 style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                {addOn.title}
              </h3>
              <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.sm }}>
                {addOn.description}
              </p>
              <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
                ${addOn.standalonePrice}/month
              </div>
              <div style={{ color: theme.colors.text.secondary, fontSize: '0.9rem', marginBottom: theme.spacing.md }}>
                Individual sessions with {addOn.coach}
              </div>
              <button
                onClick={() => handleAddOnPayment(addOn)}
                disabled={paymentProcessing}
                style={{
                  width: '100%',
                  padding: theme.spacing.sm,
                  backgroundColor: theme.colors.primary,
                  color: 'white',
                  border: 'none',
                  borderRadius: theme.borderRadius.md,
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: paymentProcessing ? 'not-allowed' : 'pointer',
                  opacity: paymentProcessing ? 0.6 : 1
                }}
              >
                {paymentProcessing ? 'Processing...' : `Purchase ${addOn.title}`}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Package Summary and Booking */}
      {selectedPackage && (
        <div style={{
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.background.secondary
        }}>
          <h2 style={{ color: theme.colors.text.primary, marginBottom: theme.spacing.md }}>
            Package Booking Summary
          </h2>
          
          <div style={{ marginBottom: theme.spacing.md }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>{selectedPackage.title} Package ({selectedSessions.length} sessions)</span>
              <span>${selectedPackage.price}</span>
            </div>
            <div style={{ color: theme.colors.text.secondary, fontSize: '0.9rem', marginTop: '4px' }}>
              Group sessions with multiple coaches
            </div>
          </div>

          {calculateDiscount() > 0 && (
            <div style={{ marginBottom: theme.spacing.sm }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.colors.success }}>
                <span>Add-on Discount</span>
                <span>-${calculateDiscount()}</span>
              </div>
            </div>
          )}

          <hr style={{ margin: theme.spacing.md 0 }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 'bold' }}>
            <span>Total</span>
            <span>${calculateTotal() - calculateDiscount()}</span>
          </div>

          <button
            onClick={handlePackageBooking}
            disabled={paymentProcessing || !selectedPackage || selectedSessions.length === 0}
            style={{
              width: '100%',
              padding: theme.spacing.md,
              backgroundColor: theme.colors.primary,
              color: 'white',
              border: 'none',
              borderRadius: theme.borderRadius.md,
              fontSize: '1.1rem',
              fontWeight: 'bold',
              cursor: paymentProcessing ? 'not-allowed' : 'pointer',
              opacity: paymentProcessing ? 0.6 : 1,
              marginTop: theme.spacing.md
            }}
          >
            {paymentProcessing ? 'Processing Payment...' : 'Pay & Confirm Package'}
          </button>

          <div style={{ 
            marginTop: theme.spacing.md, 
            padding: theme.spacing.md, 
            backgroundColor: theme.colors.background.primary,
            borderRadius: theme.borderRadius.md,
            border: `1px solid ${theme.colors.border}`
          }}>
            <h4 style={{ color: theme.colors.primary, marginBottom: theme.spacing.sm }}>
              Payment Information:
            </h4>
            <p style={{ color: theme.colors.text.secondary, fontSize: '0.9rem' }}>
              All payments are processed securely through Stripe. You'll receive a confirmation email and SMS after successful payment.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Add-on programs data - Individual coach sessions
const addOnPrograms = [
  {
    id: 'ryp-academy-starter',
    title: 'RYP Academy Starter',
    description: '4 sessions per month of golf-specific strength training with Coach Phil',
    standalonePrice: 120,
    coach: 'Coach Phil'
  },
  {
    id: 'mental-starter',
    title: 'Mental Performance Starter',
    description: '2 sessions per month of mental game training with Coach Yannick',
    standalonePrice: 100,
    coach: 'Coach Yannick'
  },
  {
    id: 'tournament-prep',
    title: 'Tournament Prep',
    description: 'Personalized mental game strategy for specific tournaments with Coach Yannick',
    standalonePrice: 400,
    coach: 'Coach Yannick'
  }
];

export default EnhancedBookingSystem;
