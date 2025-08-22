import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const userSetupService = {
  // Check if user has completed setup
  async hasCompletedSetup(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return userData.accountSetupComplete || false;
      }
      return false;
    } catch (error) {
      console.error('Error checking setup completion:', error);
      return false;
    }
  },

  // Mark user setup as complete
  async markSetupComplete(userId, setupData) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        accountSetupComplete: true,
        setupCompletedAt: new Date(),
        setupData: setupData,
        lastUpdated: new Date()
      });
      return true;
    } catch (error) {
      console.error('Error marking setup complete:', error);
      throw new Error('Failed to save setup completion');
    }
  },

  // Get user setup data
  async getSetupData(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        return {
          accountSetupComplete: userData.accountSetupComplete || false,
          setupCompletedAt: userData.setupCompletedAt,
          setupData: userData.setupData || null
        };
      }
      return {
        accountSetupComplete: false,
        setupCompletedAt: null,
        setupData: null
      };
    } catch (error) {
      console.error('Error getting setup data:', error);
      return {
        accountSetupComplete: false,
        setupCompletedAt: null,
        setupData: null
      };
    }
  }
};

