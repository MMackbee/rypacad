import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { familyService } from '../services/familyService';
import { theme } from '../styles/theme';

function Navbar() {
  const { user, loading } = useUser();
  const navigate = useNavigate();
  const [hasChildren, setHasChildren] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [children, setChildren] = useState([]);
  const [showChildSelect, setShowChildSelect] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [selectedChildId, setSelectedChildId] = useState('');
  
  const handleParentGuardedNav = (e, targetPath) => {
    if (isParent) {
      e.preventDefault();
      if (!hasChildren) {
        alert('No child linked. Go to Parent Dashboard to add your child.');
        navigate('/parent');
        return;
      }
      setPendingTarget(targetPath);
      setShowChildSelect(true);
      return;
    }
    navigate(targetPath);
  };

  useEffect(() => {
    if (user) {
      checkParentStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const checkParentStatus = async () => {
    try {
      const kids = await familyService.getChildrenForParent(user.uid);
      setChildren(kids);
      setHasChildren(kids.length > 0);
      setIsParent(true);
    } catch (error) {
      console.error('Error checking parent status:', error);
      // User is not a parent or has no children
      setChildren([]);
      setHasChildren(false);
      setIsParent(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
      // Force navigation even if signOut fails
      navigate('/login');
    }
  };

  const confirmChildSelection = () => {
    if (!selectedChildId) {
      alert('Please select a child to continue.');
      return;
    }
    setShowChildSelect(false);
    // Optionally store selected child in sessionStorage for use on target pages
    sessionStorage.setItem('selectedChildId', selectedChildId);
    if (pendingTarget) navigate(pendingTarget);
  };

  if (loading) {
    return (
      <nav style={{
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.md,
        color: 'white'
      }}>
        Loading...
      </nav>
    );
  }

  return (
    <nav style={{
      backgroundColor: theme.colors.primary,
      padding: theme.spacing.md,
      color: 'white',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <Link to="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 'bold' }}>
          RYP Golf Academy
        </Link>
        
        {user && (
          <>
            {/* Coach-specific navigation */}
            {user.role === 'coach' ? (
              <>
                <Link to="/coach" style={{ color: 'white', textDecoration: 'none' }}>
                  Coach Dashboard
                </Link>
                {/* Driving Test removed from parent/student nav */}
              </>
            ) : (
              /* Student/Parent navigation */
              <>
                <Link to="/programs" style={{ color: 'white', textDecoration: 'none' }}>
                  Programs
                </Link>
                
                <Link to="/videos" style={{ color: 'white', textDecoration: 'none' }}>
                  Training Videos
                </Link>
                
                {/* Driving Test removed */}

                <a href="/booking" onClick={(e) => handleParentGuardedNav(e, '/booking')} style={{ color: 'white', textDecoration: 'none' }}>
                  Book Sessions
                </a>
                
                <a href="/my-bookings" onClick={(e) => handleParentGuardedNav(e, '/my-bookings')} style={{ color: 'white', textDecoration: 'none' }}>
                  My Bookings
                </a>
                
                {/* Build Package removed; Programs is the hub */}
                
                {user.role === 'admin' && (
                  <Link to="/admin" style={{ color: 'white', textDecoration: 'none' }}>
                    Admin
                  </Link>
                )}
                
                {isParent && hasChildren && (
                  <Link to="/parent" style={{ color: 'white', textDecoration: 'none' }}>
                    Parent Dashboard
                  </Link>
                )}
              </>
            )}
          </>
        )}
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        {user ? (
          <>
            <Link to="/profile" style={{ color: 'white', textDecoration: 'none' }}>
              Profile
            </Link>
            <span style={{ fontSize: '0.9rem' }}>
              Welcome, {user.displayName || user.email}
            </span>
            <button
              onClick={handleSignOut}
              style={{
                backgroundColor: 'transparent',
                color: 'white',
                border: '1px solid white',
                padding: theme.spacing.sm,
                borderRadius: theme.borderRadius.sm,
                cursor: 'pointer'
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={{ color: 'white', textDecoration: 'none' }}>
              Login
            </Link>
            <Link to="/signup" style={{ color: 'white', textDecoration: 'none' }}>
              Sign Up
            </Link>
          </>
        )}
      </div>

      {/* Child Selection Modal for Parents */}
      {showChildSelect && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.colors.background.primary,
            color: theme.colors.text.primary,
            padding: theme.spacing.xl,
            borderRadius: theme.borderRadius.lg,
            width: '90%', maxWidth: 420,
            border: `1px solid ${theme.colors.border}`
          }}>
            <h3 style={{ marginTop: 0, marginBottom: theme.spacing.md }}>Select a Child</h3>
            <p style={{ color: theme.colors.text.secondary, marginTop: 0 }}>Choose which child you are booking for.</p>
            <select
              value={selectedChildId}
              onChange={(e) => setSelectedChildId(e.target.value)}
              style={{ width: '100%', padding: theme.spacing.md, border: `1px solid ${theme.colors.border}`, borderRadius: theme.borderRadius.md, marginBottom: theme.spacing.md }}
            >
              <option value="">-- Select --</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>{c.displayName || c.email || c.id}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: theme.spacing.sm, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowChildSelect(false)} style={{
                background: 'transparent', color: theme.colors.text.primary, border: `1px solid ${theme.colors.border}`,
                padding: theme.spacing.sm, borderRadius: theme.borderRadius.sm, cursor: 'pointer'
              }}>Cancel</button>
              <button onClick={confirmChildSelection} style={{
                background: theme.colors.primary, color: theme.colors.text.dark, border: 'none',
                padding: theme.spacing.sm, borderRadius: theme.borderRadius.sm, cursor: 'pointer'
              }}>Continue</button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

export default Navbar; 