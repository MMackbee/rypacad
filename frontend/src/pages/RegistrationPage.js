import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { theme } from '../styles/theme';
import { useUser } from '../contexts/UserContext';

function RegistrationPage() {
  const navigate = useNavigate();
  const { user, loading } = useUser();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState({
    // Basic Information
    email: '',
    phone: '',
    participantName: '',
    participantAge: '',
    
    // Terms and Permissions
    acceptTerms: false,
    mediaPermissions: false,
    hasViewedTerms: false,
    
    // Program Selection
    golfProgram: '',
    fitnessProgram: '',
    mentalProgram: '',
    
    // Session Preferences
    preferredSessions: [],
    knowsPreferredTimes: false,
    interestedInLaterSessions: false,
    
    // Referral
    referredBy: '',
    
    // Additional Info
    role: 'student', // Default for academy registration
    emergencyContact: {
      name: '',
      phone: '',
      relationship: ''
    }
  });
  const [authLoading, setAuthLoading] = useState(false);
  const [error, setError] = useState('');
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [termsViewed, setTermsViewed] = useState(false);

  // Check if user is already authenticated
  useEffect(() => {
    if (user && !loading) {
      checkUserProfile();
    }
  }, [user, loading]);

  const checkUserProfile = async () => {
    if (!user) return;
    
    try {
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.accountSetupComplete) {
          navigate('/dashboard');
          return;
        }
      }
      setCurrentStep(2);
    } catch (error) {
      console.error('Error checking user profile:', error);
      setCurrentStep(2);
    }
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    setError('');

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      const userDoc = await getDoc(doc(db, 'users', result.user.uid));
      
      if (!userDoc.exists()) {
        // Generate a unique studentId
        const { userService } = await import('../services/firebaseService');
        const studentId = await userService.generateUniqueStudentId();
        await setDoc(doc(db, 'users', result.user.uid), {
          uid: result.user.uid,
          email: result.user.email,
          displayName: result.user.displayName || 'User',
          photoURL: result.user.photoURL,
          studentId,
          createdAt: new Date(),
          lastUpdated: new Date()
        });
        setCurrentStep(2);
      } else {
        const userData = userDoc.data();
        if (userData.accountSetupComplete) {
          navigate('/dashboard');
        } else {
          setCurrentStep(2);
        }
      }
    } catch (error) {
      console.error('Google sign-in error:', error);
      setError(error.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const containerStyle = {
    maxWidth: '800px',
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

  const formStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`
  };

  const sectionStyle = {
    marginBottom: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`
  };

  const sectionTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg,
    borderBottom: `2px solid ${theme.colors.primary}`,
    paddingBottom: theme.spacing.sm
  };

  const inputGroupStyle = {
    marginBottom: theme.spacing.lg
  };

  const labelStyle = {
    display: 'block',
    marginBottom: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    color: theme.colors.text.primary
  };

  const inputStyle = {
    width: '100%',
    padding: theme.spacing.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.base,
    backgroundColor: theme.colors.background.primary,
    color: theme.colors.text.primary
  };

  const checkboxStyle = {
    marginRight: theme.spacing.sm
  };

  const checkboxLabelStyle = {
    display: 'flex',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    cursor: 'pointer'
  };

  const radioGroupStyle = {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing.sm
  };

  const radioLabelStyle = {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer'
  };

  const buttonStyle = {
    width: '100%',
    padding: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    cursor: 'pointer',
    marginTop: theme.spacing.lg
  };

  const googleButtonStyle = {
    width: '100%',
    padding: theme.spacing.md,
    backgroundColor: '#4285f4',
    color: 'white',
    border: 'none',
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm
  };

  const secondaryButtonStyle = {
    ...buttonStyle,
    backgroundColor: 'transparent',
    color: theme.colors.primary,
    border: `1px solid ${theme.colors.primary}`,
    marginTop: theme.spacing.md
  };

  const errorStyle = {
    color: theme.colors.error,
    fontSize: theme.typography.fontSizes.sm,
    marginTop: theme.spacing.sm
  };

  const progressStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xl,
    padding: `0 ${theme.spacing.lg}`
  };

  const progressStepStyle = {
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold
  };

  const activeStepStyle = {
    ...progressStepStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark
  };

  const inactiveStepStyle = {
    ...progressStepStyle,
    backgroundColor: theme.colors.background.secondary,
    color: theme.colors.text.secondary,
    border: `1px solid ${theme.colors.border}`
  };

  const modalOverlayStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: theme.spacing.lg
  };

  const modalContentStyle = {
    backgroundColor: theme.colors.background.primary,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    maxWidth: '800px',
    maxHeight: '80vh',
    overflow: 'auto',
    border: `1px solid ${theme.colors.border}`,
    boxShadow: theme.shadows.xl
  };

  const modalHeaderStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottom: `1px solid ${theme.colors.border}`
  };

  const modalTitleStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    margin: 0
  };

  const closeButtonStyle = {
    background: 'none',
    border: 'none',
    fontSize: theme.typography.fontSizes.xl,
    cursor: 'pointer',
    color: theme.colors.text.secondary,
    padding: theme.spacing.sm
  };

  const termsContentStyle = {
    fontSize: theme.typography.fontSizes.base,
    lineHeight: theme.typography.lineHeights.relaxed,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.lg
  };

  const termsSectionStyle = {
    marginBottom: theme.spacing.lg
  };

  const termsSectionTitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.md
  };

  const termsTextStyle = {
    marginBottom: theme.spacing.md,
    textAlign: 'justify'
  };

  const viewTermsButtonStyle = {
    padding: `${theme.spacing.sm} ${theme.spacing.md}`,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    border: 'none',
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semibold,
    cursor: 'pointer',
    marginLeft: theme.spacing.sm
  };

  const golfPrograms = [
    { value: '4x', label: '4x Golf sessions per month - $200/month (Includes 2 tournaments)' },
    { value: '8x', label: '8x Golf sessions per month - $380/month (Includes 3 tournaments)' },
    { value: '12x', label: '12x Golf sessions per month - $540/month (Includes 4 tournaments)' },
    { value: '16x', label: '16x Golf sessions per month - $680/month (Includes 4 tournaments)' }
  ];

  const fitnessPrograms = [
    { value: '4x', label: '4x Fitness sessions per month - $120/month' },
    { value: '8x', label: '8x Fitness sessions per month - $200/month' },
    { value: '12x', label: '12x Fitness sessions per month - $240/month' }
  ];

  const mentalPrograms = [
    { value: '2x', label: '2x Mental Performance sessions per month' },
    { value: '4x', label: '4x Mental Performance sessions per month' }
  ];

  const sessionOptions = [
    'Monday 4pm Golf',
    'Monday 4pm Fitness',
    'Monday 5pm Golf',
    'Monday 5pm Fitness',
    'Tuesday 4pm Golf (waitlist)',
    'Tuesday 4pm Fitness',
    'Tuesday 5pm Golf',
    'Tuesday 5pm Fitness',
    'Wednesday 4pm Golf',
    'Wednesday 4pm Fitness',
    'Wednesday 5pm Golf',
    'Wednesday 5pm Fitness',
    'Thursday 4pm Golf (waitlist)',
    'Thursday 4pm Fitness',
    'Thursday 5pm Golf',
    'Thursday 5pm Fitness',
    'Saturday 10am Golf (waitlist)',
    'Saturday 10am Fitness',
    'Saturday 1pm Golf'
  ];

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Restrict age input to numeric characters only (typeable, no spinner arrows)
  const handleAgeInputChange = (value) => {
    const digitsOnly = String(value || '').replace(/\D/g, '');
    setFormData(prev => ({
      ...prev,
      participantAge: digitsOnly
    }));
  };

  const handleCheckboxChange = (field, value) => {
    // Generic handler for simple checkboxes
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAcceptTermsChange = (checked) => {
    // Accepting terms and conditions conflicts with the "no media permissions & accept terms" option
    setFormData(prev => ({
      ...prev,
      acceptTerms: checked,
      mediaPermissions: checked ? false : prev.mediaPermissions
    }));
  };

  const handleMediaPermissionsChange = (checked) => {
    // Choosing "DO NOT grant media permissions & ACCEPT terms" conflicts with the general acceptTerms checkbox
    setFormData(prev => ({
      ...prev,
      mediaPermissions: checked,
      acceptTerms: checked ? false : prev.acceptTerms
    }));
  };

  const handleSessionToggle = (session) => {
    setFormData(prev => ({
      ...prev,
      preferredSessions: prev.preferredSessions.includes(session)
        ? prev.preferredSessions.filter(s => s !== session)
        : [...prev.preferredSessions, session]
    }));
  };

  const handleEmergencyContactChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      emergencyContact: {
        ...prev.emergencyContact,
        [field]: value
      }
    }));
  };

  const validateStep2 = () => {
    if (!formData.participantName || !formData.participantAge || !formData.phone) {
      setError('Please fill in all required fields');
      return false;
    }
    // Must view terms in the modal and then indicate acceptance
    if (!formData.hasViewedTerms) {
      setError('You must view the Liability & Media Release Form and confirm you have read it.');
      return false;
    }
    // Exactly one of acceptTerms OR mediaPermissions (no-media & accept terms) can be selected
    if ((formData.acceptTerms && formData.mediaPermissions) || (!formData.acceptTerms && !formData.mediaPermissions)) {
      setError('Please select exactly one: either agree to the terms as-is, OR do not grant media permissions (while accepting terms).');
      return false;
    }
    // At least one program across Golf, Fitness, or Mental must be selected
    if (!formData.golfProgram && !formData.fitnessProgram && !formData.mentalProgram) {
      setError('Please select at least one program (Golf, Fitness, or Mental Performance).');
      return false;
    }
    setError('');
    return true;
  };

  const handleCompleteProfile = async () => {
    if (!validateStep2()) return;

    try {
      await setDoc(doc(db, 'users', user.uid), {
        ...formData,
        accountSetupComplete: true,
        setupCompletedAt: new Date(),
        lastUpdated: new Date()
      }, { merge: true });

      navigate('/dashboard');
    } catch (error) {
      console.error('Error completing profile:', error);
      setError('Failed to save profile. Please try again.');
    }
  };

  const renderStep1 = () => (
    <div style={{ textAlign: 'center' }}>
      <h2 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg }}>
        Sign in with Google to continue
      </h2>
      <button 
        style={googleButtonStyle} 
        onClick={handleGoogleSignIn}
        disabled={authLoading}
      >
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
          <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        {authLoading ? 'Signing in...' : 'Continue with Google'}
      </button>
      
      <div style={{ marginTop: theme.spacing.lg }}>
        <p style={{ color: theme.colors.text.secondary }}>
          Already have an account?{' '}
          <a 
            href="/login" 
            style={{ color: theme.colors.primary, textDecoration: 'none' }}
          >
            Sign in here
          </a>
        </p>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <>
      {/* Basic Information */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Basic Information</h3>
        
        <div style={inputGroupStyle}>
          <label style={labelStyle}>Email Address *</label>
          <input
            type="email"
            style={inputStyle}
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            placeholder="Enter your email address"
          />
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Phone Number *</label>
          <input
            type="tel"
            style={inputStyle}
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            placeholder="Enter your phone number"
          />
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Name of Participant *</label>
          <input
            type="text"
            style={inputStyle}
            value={formData.participantName}
            onChange={(e) => handleInputChange('participantName', e.target.value)}
            placeholder="Enter participant's full name"
          />
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Age of Participant *</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            style={inputStyle}
            value={formData.participantAge}
            onChange={(e) => handleAgeInputChange(e.target.value)}
            placeholder="Enter participant's age"
            maxLength={2}
          />
        </div>
      </div>

      {/* Terms and Permissions */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Terms and Permissions</h3>
        
        <div style={inputGroupStyle}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: theme.spacing.md }}>
            <label style={checkboxLabelStyle}>
              <input
                type="checkbox"
                style={{ ...checkboxStyle, cursor: termsViewed ? 'pointer' : 'not-allowed' }}
                checked={formData.hasViewedTerms}
                disabled={!termsViewed}
                onChange={(e) => termsViewed && handleCheckboxChange('hasViewedTerms', e.target.checked)}
              />
              I have viewed and read the Liability & Media Release Form *
            </label>
            <button 
              style={viewTermsButtonStyle}
              onClick={() => {
                setTermsViewed(true);
                setShowTermsModal(true);
              }}
            >
              View Terms
            </button>
          </div>
        </div>

        <div style={inputGroupStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              style={checkboxStyle}
              checked={formData.acceptTerms}
              onChange={(e) => handleAcceptTermsChange(e.target.checked)}
            />
            I have read, understand, and agree to the terms and conditions of the Liability & Media Release Form *
          </label>
        </div>

        <div style={inputGroupStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              style={checkboxStyle}
              checked={formData.mediaPermissions}
              onChange={(e) => handleMediaPermissionsChange(e.target.checked)}
            />
            I DO NOT grant media permissions & ACCEPT terms
          </label>
        </div>
      </div>

      {/* Program Selection */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Program Selection</h3>
        
        <div style={inputGroupStyle}>
          <label style={labelStyle}>Golf Coaching Program</label>
          <div style={radioGroupStyle}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="golfProgram"
                value=""
                checked={formData.golfProgram === ''}
                onChange={(e) => handleInputChange('golfProgram', e.target.value)}
                style={checkboxStyle}
              />
              None
            </label>
            {golfPrograms.map((program) => (
              <label key={program.value} style={radioLabelStyle}>
                <input
                  type="radio"
                  name="golfProgram"
                  value={program.value}
                  checked={formData.golfProgram === program.value}
                  onChange={(e) => handleInputChange('golfProgram', e.target.value)}
                  style={checkboxStyle}
                />
                {program.label}
              </label>
            ))}
          </div>
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Fitness Program</label>
          <div style={radioGroupStyle}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="fitnessProgram"
                value=""
                checked={formData.fitnessProgram === ''}
                onChange={(e) => handleInputChange('fitnessProgram', e.target.value)}
                style={checkboxStyle}
              />
              None
            </label>
            {fitnessPrograms.map((program) => (
              <label key={program.value} style={radioLabelStyle}>
                <input
                  type="radio"
                  name="fitnessProgram"
                  value={program.value}
                  checked={formData.fitnessProgram === program.value}
                  onChange={(e) => handleInputChange('fitnessProgram', e.target.value)}
                  style={checkboxStyle}
                />
                {program.label}
              </label>
            ))}
          </div>
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Mental Performance Program</label>
          <div style={radioGroupStyle}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="mentalProgram"
                value=""
                checked={formData.mentalProgram === ''}
                onChange={(e) => handleInputChange('mentalProgram', e.target.value)}
                style={checkboxStyle}
              />
              None
            </label>
            {mentalPrograms.map((program) => (
              <label key={program.value} style={radioLabelStyle}>
                <input
                  type="radio"
                  name="mentalProgram"
                  value={program.value}
                  checked={formData.mentalProgram === program.value}
                  onChange={(e) => handleInputChange('mentalProgram', e.target.value)}
                  style={checkboxStyle}
                />
                {program.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Session Preferences */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Session Preferences</h3>
        
        <div style={inputGroupStyle}>
          <label style={labelStyle}>Preferred Sessions (Check all that apply)</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: theme.spacing.sm }}>
            {sessionOptions.map((session) => (
              <label key={session} style={checkboxLabelStyle}>
                <input
                  type="checkbox"
                  checked={formData.preferredSessions.includes(session)}
                  onChange={() => handleSessionToggle(session)}
                  style={checkboxStyle}
                />
                {session}
              </label>
            ))}
          </div>
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Do you know what days and times you'd prefer?</label>
          <div style={radioGroupStyle}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="knowsPreferredTimes"
                value="true"
                checked={formData.knowsPreferredTimes === true}
                onChange={(e) => handleInputChange('knowsPreferredTimes', e.target.value === 'true')}
                style={checkboxStyle}
              />
              Yes
            </label>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="knowsPreferredTimes"
                value="false"
                checked={formData.knowsPreferredTimes === false}
                onChange={(e) => handleInputChange('knowsPreferredTimes', e.target.value === 'true')}
                style={checkboxStyle}
              />
              No
            </label>
          </div>
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Would a later session on Mon-Thu interest you? (6-7pm)</label>
          <div style={radioGroupStyle}>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="interestedInLaterSessions"
                value="true"
                checked={formData.interestedInLaterSessions === true}
                onChange={(e) => handleInputChange('interestedInLaterSessions', e.target.value === 'true')}
                style={checkboxStyle}
              />
              Yes
            </label>
            <label style={radioLabelStyle}>
              <input
                type="radio"
                name="interestedInLaterSessions"
                value="false"
                checked={formData.interestedInLaterSessions === false}
                onChange={(e) => handleInputChange('interestedInLaterSessions', e.target.value === 'true')}
                style={checkboxStyle}
              />
              No
            </label>
          </div>
        </div>
      </div>

      {/* Referral */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Referral Information</h3>
        
        <div style={inputGroupStyle}>
          <label style={labelStyle}>Who referred you?</label>
          <input
            type="text"
            style={inputStyle}
            value={formData.referredBy}
            onChange={(e) => handleInputChange('referredBy', e.target.value)}
            placeholder="Enter the name of who referred you (optional)"
          />
        </div>
      </div>

      {/* Emergency Contact */}
      <div style={sectionStyle}>
        <h3 style={sectionTitleStyle}>Emergency Contact</h3>
        
        <div style={inputGroupStyle}>
          <label style={labelStyle}>Emergency Contact Name</label>
          <input
            type="text"
            style={inputStyle}
            value={formData.emergencyContact.name}
            onChange={(e) => handleEmergencyContactChange('name', e.target.value)}
            placeholder="Emergency contact name"
          />
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Emergency Contact Phone</label>
          <input
            type="tel"
            style={inputStyle}
            value={formData.emergencyContact.phone}
            onChange={(e) => handleEmergencyContactChange('phone', e.target.value)}
            placeholder="Emergency contact phone"
          />
        </div>

        <div style={inputGroupStyle}>
          <label style={labelStyle}>Relationship to Participant</label>
          <input
            type="text"
            style={inputStyle}
            value={formData.emergencyContact.relationship}
            onChange={(e) => handleEmergencyContactChange('relationship', e.target.value)}
            placeholder="Relationship to participant"
          />
        </div>
      </div>
    </>
  );

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

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h1 style={titleStyle}>2024 RYP Academy Registration</h1>
        <p style={subtitleStyle}>
          Join the premier facility for winter game improvement in the Minneapolis area
        </p>
      </div>

      <div style={progressStyle}>
        <div style={currentStep >= 1 ? activeStepStyle : inactiveStepStyle}>1</div>
        <div style={currentStep >= 2 ? activeStepStyle : inactiveStepStyle}>2</div>
      </div>

      <div style={formStyle}>
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}

        {error && <div style={errorStyle}>{error}</div>}

        {currentStep === 2 && (
          <div style={{ display: 'flex', gap: theme.spacing.md }}>
            <button style={secondaryButtonStyle} onClick={() => setCurrentStep(1)}>
              Back
            </button>
            <button 
              style={buttonStyle} 
              onClick={handleCompleteProfile}
            >
              Complete Registration
            </button>
          </div>
        )}
      </div>

      {/* Terms and Conditions Modal */}
      {showTermsModal && (
        <div style={modalOverlayStyle} onClick={() => setShowTermsModal(false)}>
          <div style={modalContentStyle} onClick={(e) => e.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={modalTitleStyle}>RYP Golf Academy Liability & Media Release Form</h2>
              <button 
                style={closeButtonStyle}
                onClick={() => setShowTermsModal(false)}
              >
                ×
              </button>
            </div>
            
            <div style={termsContentStyle}>
              <div style={termsSectionStyle}>
                <h3 style={termsSectionTitleStyle}>Liability Release</h3>
                <p style={termsTextStyle}>
                  I hereby acknowledge that participation in golf and fitness activities at RYP Golf Academy involves inherent risks, including potential for injury. As the parent or legal guardian of the above-named participant, I agree to hold harmless, indemnify, and release RYP Golf Academy, its coaches, staff members, facility owners, and affiliates from any liability, claim, or demand arising from any injury or loss sustained during participation in academy activities.
                </p>
                <p style={termsTextStyle}>
                  I affirm that my child is physically able to participate in these activities and will inform RYP Golf Academy staff of any pre-existing medical conditions or restrictions prior to participation.
                </p>
              </div>

              <div style={termsSectionStyle}>
                <h3 style={termsSectionTitleStyle}>Media and Photography Release</h3>
                <p style={termsTextStyle}>
                  I grant RYP Golf Academy permission to photograph, videotape, and otherwise document my child's participation in academy activities. These images and videos may be used for promotional purposes on RYP Golf Academy's website, social media channels, marketing materials, and in other promotional contexts.
                </p>
              </div>

              <div style={termsSectionStyle}>
                <h3 style={termsSectionTitleStyle}>Acknowledgment</h3>
                <p style={termsTextStyle}>
                  By checking, I confirm that I have read, understand, and agree to the terms and conditions of this Liability & Media Release Form.
                </p>
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <button 
                style={buttonStyle}
                onClick={() => {
                  setShowTermsModal(false);
                  handleCheckboxChange('hasViewedTerms', true);
                }}
              >
                I Have Read and Understood the Terms
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RegistrationPage;
