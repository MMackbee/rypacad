import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { signOut } from 'firebase/auth';
import { auth } from '../firebase';
import { theme } from '../styles/theme';

/**
 * Desktop chrome for the surface the portal does not cover yet.
 *
 * Scheduling, booking, enrollment and the role dashboards moved to the portal,
 * so this bar links into it rather than to the 2025 pages that used to serve
 * them. It is suppressed entirely under /portal — see ChromeNavbar in App.js.
 *
 * The parent child-select modal that used to gate /booking went with those
 * routes: nothing could trigger it once the guarded links were gone, and
 * choosing which child a booking is for is the portal's job now.
 */

/**
 * Where a role lands in the portal. There is no single portal home — each role's
 * first tab is a different screen — so the entry point is chosen here rather
 * than sending everyone to one route that is wrong for two of the three.
 */
function portalHome(user) {
  if (user?.role === 'coach') return '/portal/coach';
  if (user?.role === 'parent') return '/portal/family';
  return '/portal/schedule';
}

const linkStyle = { color: 'white', textDecoration: 'none' };

function Navbar() {
  const { user, loading } = useUser();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      // Navigate either way — leaving someone on an authed view after a failed
      // sign-out is worse than an extra redirect.
      navigate('/login');
    }
  };

  if (loading) {
    return (
      <nav
        style={{
          backgroundColor: theme.colors.primary,
          padding: theme.spacing.md,
          color: 'white',
        }}
      >
        Loading...
      </nav>
    );
  }

  return (
    <nav
      style={{
        backgroundColor: theme.colors.primary,
        padding: theme.spacing.md,
        color: 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        <Link to="/" style={{ ...linkStyle, fontWeight: 'bold' }}>
          RYP Golf Academy
        </Link>

        {user && (
          <>
            <Link to={portalHome(user)} style={linkStyle}>
              Portal
            </Link>

            {user.role !== 'coach' && (
              <Link to="/videos" style={linkStyle}>
                Training Videos
              </Link>
            )}

            {user.role === 'admin' && (
              <Link to="/admin" style={linkStyle}>
                Admin
              </Link>
            )}
          </>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: theme.spacing.md }}>
        {user ? (
          <>
            <Link to="/profile" style={linkStyle}>
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
                cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" style={linkStyle}>
              Login
            </Link>
            {/* Enrollment is the portal's registration flow; /signup never existed. */}
            <Link to="/portal/register" style={linkStyle}>
              Sign Up
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

export default Navbar;
