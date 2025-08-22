import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { userSetupService } from '../services/userSetupService';

const UserContext = createContext();

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [setupComplete, setSetupComplete] = useState(false);
  const [setupData, setSetupData] = useState(null);

  const loadUserData = async (firebaseUser) => {
    if (firebaseUser) {
      try {
        setError(null);
        
        // First try to get role from Firestore
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        let role = 'student'; // Default role
        
        if (userDoc.exists()) {
          const userData = userDoc.data();
          role = userData.role || 'student';
        } else {
          // Create user document if it doesn't exist
          try {
            await setDoc(doc(db, 'users', firebaseUser.uid), {
              uid: firebaseUser.uid,
              email: firebaseUser.email || '',
              displayName: firebaseUser.displayName || 'User',
              role: 'student',
              createdAt: new Date(),
              lastUpdated: new Date()
            });
          } catch (createError) {
            console.error('Error creating user document:', createError);
            // Continue with default role even if document creation fails
          }
        }

        // Create enhanced user object with role
        const enhancedUser = {
          ...firebaseUser,
          role: role
        };

        setUser(enhancedUser);
        setUserRole(role);

        // Load setup completion status
        try {
          const setupInfo = await userSetupService.getSetupData(firebaseUser.uid);
          setSetupComplete(setupInfo.accountSetupComplete);
          setSetupData(setupInfo.setupData);
        } catch (setupError) {
          console.error('Error loading setup data:', setupError);
          setSetupComplete(false);
          setSetupData(null);
        }
      } catch (error) {
        console.error('Error getting user role:', error);
        setError('Failed to load user data. Please refresh the page.');
        
        // Fallback to Firebase custom claims
        try {
          const idTokenResult = await firebaseUser.getIdTokenResult();
          const role = idTokenResult.claims?.role || 'student';
          const enhancedUser = {
            ...firebaseUser,
            role: role
          };
          setUser(enhancedUser);
          setUserRole(role);
          setError(null); // Clear error if fallback succeeds
        } catch (fallbackError) {
          console.error('Error getting user role from claims:', fallbackError);
          const enhancedUser = {
            ...firebaseUser,
            role: 'student'
          };
          setUser(enhancedUser);
          setUserRole('student');
          setError('Using default role due to data loading issues.');
        }
      }
    } else {
      setUser(null);
      setUserRole(null);
      setError(null);
    }
    setLoading(false);
  };

  const refreshUser = async () => {
    if (auth.currentUser) {
      try {
        await loadUserData(auth.currentUser);
      } catch (error) {
        console.error('Error refreshing user:', error);
        setError('Failed to refresh user data.');
      }
    }
  };

  const markSetupComplete = async (setupData) => {
    if (user) {
      try {
        await userSetupService.markSetupComplete(user.uid, setupData);
        setSetupComplete(true);
        setSetupData(setupData);
        return true;
      } catch (error) {
        console.error('Error marking setup complete:', error);
        setError('Failed to save setup completion');
        return false;
      }
    }
    return false;
  };

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(auth, loadUserData);
      return () => unsubscribe();
    } catch (error) {
      console.error('Error setting up auth listener:', error);
      setError('Authentication system error. Please refresh the page.');
      setLoading(false);
    }
  }, []);

  const isStudent = userRole === 'student';
  const isCoach = userRole === 'coach';
  const isAdmin = userRole === 'admin';
  const isParent = userRole === 'parent';
  const isAuthenticated = !!user;

  const value = {
    user,
    userRole,
    loading,
    error,
    isStudent,
    isCoach,
    isAdmin,
    isParent,
    isAuthenticated,
    refreshUser,
    clearError: () => setError(null),
    setupComplete,
    setupData,
    markSetupComplete
  };

  return (
    <UserContext.Provider value={value}>
      {children}
    </UserContext.Provider>
  );
};
