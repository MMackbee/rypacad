import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { auth } from '../firebase';
import { updateProfile, updateEmail } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { theme } from '../styles/theme';

function ProfilePage() {
  const navigate = useNavigate();
  const { user, userRole, refreshUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    handicap: '',
    goals: '',
    experience: 'beginner'
  });
  const [message, setMessage] = useState('');
  const [showFirstVisitGuide, setShowFirstVisitGuide] = useState(false);
  const [roleSwitchCount, setRoleSwitchCount] = useState(0);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);

  useEffect(() => {
    if (user) {
      setFormData({
        displayName: user.displayName || '',
        email: user.email || '',
        handicap: user.handicap || '',
        goals: user.goals || '',
        experience: user.experience || 'beginner'
      });
      setLoading(false);
      // Show first-visit guide only once per browser
      const seen = localStorage.getItem('profile_first_visit_seen');
      if (!seen) {
        setShowFirstVisitGuide(true);
        localStorage.setItem('profile_first_visit_seen', '1');
      }
    } else {
      navigate('/login');
    }
  }, [user, navigate]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleEditClick = () => {
    setRoleSwitchCount(prev => prev + 1);
    
    // After 3 clicks, show role selector
    if (roleSwitchCount >= 2) {
      setSelectedRole(userRole);
      setShowRoleSelector(true);
      setRoleSwitchCount(0);
    } else {
      setEditing(true);
    }
  };

  const handleRoleSelect = (newRole) => {
    setSelectedRole(newRole);
  };

  const handleRoleSwitch = async () => {
    if (!selectedRole) {
      setMessage('Please select a role first.');
      return;
    }

    try {
      setMessage('Switching role...');
      
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }

      if (!user || !user.uid) {
        throw new Error('User data not available');
      }

      console.log('Updating role for user:', user.uid, 'to role:', selectedRole);

      // Update user role in Firestore
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        role: selectedRole,
        lastUpdated: new Date()
      }, { merge: true });

      console.log('Firestore update successful');

      // Refresh user context to get updated role
      await refreshUser();

      console.log('User context refreshed');

      setMessage(`Role switched to ${selectedRole} successfully!`);
      
      // Close the modal and reset state
      setShowRoleSelector(false);
      setSelectedRole(null);
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error switching role:', error);
      console.error('Error details:', {
        errorCode: error.code,
        errorMessage: error.message,
        user: user ? { uid: user.uid, role: user.role } : 'No user',
        selectedRole: selectedRole,
        authCurrentUser: auth.currentUser ? 'Present' : 'Not present'
      });
      setMessage(`Error switching role: ${error.message}`);
      // Clear message after 5 seconds for errors
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const handleSave = async () => {
    try {
      setMessage('Updating profile...');
      
      if (!auth.currentUser) {
        throw new Error('No authenticated user');
      }

      // Update Firebase Auth profile
      await updateProfile(auth.currentUser, {
        displayName: formData.displayName
      });

      // Update email if changed
      if (formData.email !== user.email) {
        await updateEmail(auth.currentUser, formData.email);
      }

      // Update additional data in Firestore
      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        handicap: formData.handicap,
        goals: formData.goals,
        experience: formData.experience,
        lastUpdated: new Date()
      }, { merge: true });

      setMessage('Profile updated successfully!');
      setEditing(false);
      
      // Clear message after 3 seconds
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage('Error updating profile. Please try again.');
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
    marginBottom: theme.spacing.xl
  };

  const titleStyle = {
    fontSize: theme.typography.fontSizes['3xl'],
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline,
    letterSpacing: '0.05em'
  };

  const subtitleStyle = {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const cardStyle = {
    backgroundColor: theme.colors.background.secondary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    marginBottom: theme.spacing.lg
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
    outline: 'none'
  };

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer'
  };

  const textareaStyle = {
    ...inputStyle,
    minHeight: '100px',
    resize: 'vertical'
  };

  const buttonGroupStyle = {
    display: 'flex',
    gap: theme.spacing.md,
    marginTop: theme.spacing.lg
  };

  const primaryButtonStyle = {
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    borderRadius: theme.borderRadius.md,
    border: 'none',
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const secondaryButtonStyle = {
    backgroundColor: 'transparent',
    color: theme.colors.text.primary,
    padding: `${theme.spacing.md} ${theme.spacing.xl}`,
    borderRadius: theme.borderRadius.md,
    border: `1px solid ${theme.colors.border}`,
    fontSize: theme.typography.fontSizes.base,
    fontWeight: theme.typography.fontWeights.semibold,
    fontFamily: theme.typography.fontFamily.body,
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  };

  const messageStyle = {
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.lg,
    fontFamily: theme.typography.fontFamily.body,
    textAlign: 'center'
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

  const statsGridStyle = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: theme.spacing.lg,
    marginBottom: theme.spacing.xl
  };

  const statCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.lg,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    textAlign: 'center'
  };

  const statValueStyle = {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    marginBottom: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily.headline
  };

  const statLabelStyle = {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text.secondary,
    fontFamily: theme.typography.fontFamily.body
  };

  const roleSelectorStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  };

  const roleSelectorCardStyle = {
    backgroundColor: theme.colors.background.primary,
    padding: theme.spacing.xl,
    borderRadius: theme.borderRadius.lg,
    border: `1px solid ${theme.colors.border}`,
    maxWidth: '400px',
    width: '90%'
  };

  const roleButtonStyle = {
    width: '100%',
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.background.secondary,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.borderRadius.md,
    cursor: 'pointer',
    fontSize: theme.typography.fontSizes.base,
    fontFamily: theme.typography.fontFamily.body,
    transition: 'all 0.2s ease'
  };

  const currentRoleStyle = {
    ...roleButtonStyle,
    backgroundColor: theme.colors.primary,
    color: theme.colors.text.dark,
    borderColor: theme.colors.primary
  };

  if (loading) {
    return (
      <div style={containerStyle}>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={containerStyle}>
        <p>Please log in to view your profile.</p>
      </div>
    );
  }

  return (
    <div style={containerStyle}>
      {showFirstVisitGuide && (
        <div style={{
          backgroundColor: 'rgba(0, 175, 81, 0.1)',
          border: `1px solid ${theme.colors.primary}`,
          borderRadius: theme.borderRadius.md,
          padding: theme.spacing.md,
          marginBottom: theme.spacing.lg
        }}>
          <h3 style={{ marginTop: 0 }}>Welcome! Let’s complete your profile</h3>
          <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
            <li>Verify your display name and email</li>
            <li>Set your experience level and training goals</li>
            <li>Return to Programs to select coaching and add-ons</li>
          </ul>
          <div style={{ marginTop: theme.spacing.sm }}>
            <button onClick={() => setShowFirstVisitGuide(false)} style={primaryButtonStyle}>Got it</button>
          </div>
        </div>
      )}
      <div style={headerStyle}>
        <h1 style={titleStyle}>Profile Settings</h1>
        <p style={subtitleStyle}>Manage your account and training preferences</p>
        <p style={{ fontSize: theme.typography.fontSizes.sm, color: theme.colors.text.secondary }}>
          Current Role: <strong>{userRole || 'student'}</strong>
        </p>
      </div>

      {message && (
        <div style={message.includes('Error') ? errorMessageStyle : successMessageStyle}>
          {message}
        </div>
      )}

      <div style={statsGridStyle}>
        <div style={statCardStyle}>
          <div style={statValueStyle}>12</div>
          <div style={statLabelStyle}>Training Sessions</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>8.5</div>
          <div style={statLabelStyle}>Handicap Index</div>
        </div>
        <div style={statCardStyle}>
          <div style={statValueStyle}>24</div>
          <div style={statLabelStyle}>Days Streak</div>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
          Personal Information
        </h3>
        
        <div style={formGroupStyle}>
          <label style={labelStyle}>Display Name</label>
          <input
            type="text"
            name="displayName"
            value={formData.displayName}
            onChange={handleInputChange}
            disabled={!editing}
            style={{
              ...inputStyle,
              backgroundColor: !editing ? theme.colors.background.secondary : theme.colors.background.primary,
              color: !editing ? theme.colors.text.secondary : theme.colors.text.primary,
              cursor: !editing ? 'not-allowed' : 'text',
              opacity: !editing ? 0.6 : 1
            }}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            name="email"
            value={formData.email}
            onChange={handleInputChange}
            disabled={!editing}
            style={{
              ...inputStyle,
              backgroundColor: !editing ? theme.colors.background.secondary : theme.colors.background.primary,
              color: !editing ? theme.colors.text.secondary : theme.colors.text.primary,
              cursor: !editing ? 'not-allowed' : 'text',
              opacity: !editing ? 0.6 : 1
            }}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Current Handicap</label>
          <input
            type="text"
            name="handicap"
            value={formData.handicap}
            onChange={handleInputChange}
            disabled={!editing}
            placeholder="e.g., 12.5"
            style={{
              ...inputStyle,
              backgroundColor: !editing ? theme.colors.background.secondary : theme.colors.background.primary,
              color: !editing ? theme.colors.text.secondary : theme.colors.text.primary,
              cursor: !editing ? 'not-allowed' : 'text',
              opacity: !editing ? 0.6 : 1
            }}
          />
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Experience Level</label>
          <select
            name="experience"
            value={formData.experience}
            onChange={handleInputChange}
            disabled={!editing}
            style={{
              ...selectStyle,
              backgroundColor: !editing ? theme.colors.background.secondary : theme.colors.background.primary,
              color: !editing ? theme.colors.text.secondary : theme.colors.text.primary,
              cursor: !editing ? 'not-allowed' : 'pointer',
              opacity: !editing ? 0.6 : 1
            }}
          >
            <option value="beginner">Beginner (0-2 years)</option>
            <option value="intermediate">Intermediate (2-5 years)</option>
            <option value="advanced">Advanced (5+ years)</option>
            <option value="competitive">Competitive Player</option>
          </select>
        </div>

        <div style={formGroupStyle}>
          <label style={labelStyle}>Training Goals</label>
          <textarea
            name="goals"
            value={formData.goals}
            onChange={handleInputChange}
            disabled={!editing}
            placeholder="Describe your golf training goals..."
            style={{
              ...textareaStyle,
              backgroundColor: !editing ? theme.colors.background.secondary : theme.colors.background.primary,
              color: !editing ? theme.colors.text.secondary : theme.colors.text.primary,
              cursor: !editing ? 'not-allowed' : 'text',
              opacity: !editing ? 0.6 : 1
            }}
          />
        </div>

        <div style={buttonGroupStyle}>
          {editing ? (
            <>
              <button onClick={handleSave} style={primaryButtonStyle}>
                Save Changes
              </button>
              <button onClick={() => setEditing(false)} style={secondaryButtonStyle}>
                Cancel
              </button>
            </>
          ) : (
            <button onClick={handleEditClick} style={primaryButtonStyle}>
              Edit Profile
            </button>
          )}
        </div>
      </div>

      {/* Role Selector Modal */}
      {showRoleSelector && (
        <div style={roleSelectorStyle}>
          <div style={roleSelectorCardStyle}>
            <h3 style={{ fontSize: theme.typography.fontSizes.xl, marginBottom: theme.spacing.lg, fontFamily: theme.typography.fontFamily.headline }}>
              Switch User Role
            </h3>
            <p style={{ color: theme.colors.text.secondary, marginBottom: theme.spacing.lg }}>
              Select a new role for testing purposes:
            </p>
            
            <button
              onClick={() => handleRoleSelect('student')}
              style={selectedRole === 'student' ? currentRoleStyle : roleButtonStyle}
            >
              Student
            </button>
            
            <button
              onClick={() => handleRoleSelect('coach')}
              style={selectedRole === 'coach' ? currentRoleStyle : roleButtonStyle}
            >
              Coach
            </button>
            
            <button
              onClick={() => handleRoleSelect('admin')}
              style={selectedRole === 'admin' ? currentRoleStyle : roleButtonStyle}
            >
              Admin
            </button>
            
            <button
              onClick={() => handleRoleSelect('parent')}
              style={selectedRole === 'parent' ? currentRoleStyle : roleButtonStyle}
            >
              Parent
            </button>
            
            <div style={{ display: 'flex', gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
              <button
                onClick={handleRoleSwitch}
                disabled={!selectedRole || selectedRole === userRole}
                style={{
                  ...primaryButtonStyle,
                  flex: 1,
                  opacity: (!selectedRole || selectedRole === userRole) ? 0.6 : 1,
                  cursor: (!selectedRole || selectedRole === userRole) ? 'not-allowed' : 'pointer'
                }}
              >
                {selectedRole === userRole ? 'Current Role' : 'Save Changes'}
              </button>
              <button
                onClick={() => {
                  setShowRoleSelector(false);
                  setSelectedRole(null);
                }}
                style={{
                  ...secondaryButtonStyle,
                  flex: 1
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

export default ProfilePage; 