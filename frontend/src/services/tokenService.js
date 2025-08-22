import { 
  doc, 
  getDoc, 
  updateDoc, 
  increment, 
  setDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../firebase';

// Token/Session Management Service
export const tokenService = {
  // Get user's token balance
  async getUserTokens(userId) {
    try {
      const tokenRef = doc(db, 'userTokens', userId);
      const tokenSnap = await getDoc(tokenRef);
      
      if (tokenSnap.exists()) {
        return tokenSnap.data();
      } else {
        // Initialize token balance for new user
        const defaultTokens = {
          userId: userId,
          groupSessions: 0,
          individualSessions: 0,
          tournaments: 0,
          fitnessSessions: 0,
          mentalSessions: 0,
          tournamentPrep: 0,
          lastUpdated: serverTimestamp(),
          history: []
        };
        
        await setDoc(tokenRef, defaultTokens);
        return defaultTokens;
      }
    } catch (error) {
      console.error('Error fetching user tokens:', error);
      throw error;
    }
  },

  // Add tokens to user account (after payment)
  async addTokens(userId, tokenType, quantity, source = 'purchase') {
    try {
      const tokenRef = doc(db, 'userTokens', userId);
      
      // Update token balance
      await updateDoc(tokenRef, {
        [tokenType]: increment(quantity),
        lastUpdated: serverTimestamp()
      });

      // Add to history
      await this.addTokenHistory(userId, {
        type: 'add',
        tokenType: tokenType,
        quantity: quantity,
        source: source,
        timestamp: serverTimestamp()
      });

      return true;
    } catch (error) {
      console.error('Error adding tokens:', error);
      throw error;
    }
  },

  // Use tokens (when booking sessions)
  async useTokens(userId, tokenType, quantity, sessionId) {
    try {
      const tokenRef = doc(db, 'userTokens', userId);
      const tokenSnap = await getDoc(tokenRef);
      
      if (!tokenSnap.exists()) {
        throw new Error('User token account not found');
      }

      const currentTokens = tokenSnap.data();
      
      if (currentTokens[tokenType] < quantity) {
        throw new Error(`Insufficient ${tokenType} tokens. Available: ${currentTokens[tokenType]}, Required: ${quantity}`);
      }

      // Deduct tokens by setting the new value
      const newValue = currentTokens[tokenType] - quantity;
      await updateDoc(tokenRef, {
        [tokenType]: newValue,
        lastUpdated: serverTimestamp()
      });

      // Add to history
      await this.addTokenHistory(userId, {
        type: 'use',
        tokenType: tokenType,
        quantity: quantity,
        sessionId: sessionId,
        timestamp: serverTimestamp()
      });

      return true;
    } catch (error) {
      console.error('Error using tokens:', error);
      throw error;
    }
  },

  // Add token history entry
  async addTokenHistory(userId, historyEntry) {
    try {
      const tokenRef = doc(db, 'userTokens', userId);
      const tokenSnap = await getDoc(tokenRef);
      
      if (tokenSnap.exists()) {
        const currentData = tokenSnap.data();
        const history = currentData.history || [];
        
        // Add new entry to beginning of history
        history.unshift(historyEntry);
        
        // Keep only last 50 entries
        const trimmedHistory = history.slice(0, 50);
        
        await updateDoc(tokenRef, {
          history: trimmedHistory
        });
      }
    } catch (error) {
      console.error('Error adding token history:', error);
      throw error;
    }
  },

  // Get token history
  async getTokenHistory(userId, limit = 20) {
    try {
      const tokenRef = doc(db, 'userTokens', userId);
      const tokenSnap = await getDoc(tokenRef);
      
      if (tokenSnap.exists()) {
        const data = tokenSnap.data();
        return (data.history || []).slice(0, limit);
      }
      
      return [];
    } catch (error) {
      console.error('Error fetching token history:', error);
      throw error;
    }
  },

  // Check if user has sufficient tokens
  async hasSufficientTokens(userId, tokenType, quantity) {
    try {
      const tokens = await this.getUserTokens(userId);
      return tokens[tokenType] >= quantity;
    } catch (error) {
      console.error('Error checking token balance:', error);
      return false;
    }
  },

  // Get token requirements for different session types
  getTokenRequirements() {
    return {
      groupTraining: {
        groupSessions: 1
      },
      videoAnalysis: {
        groupSessions: 1
      },
      performanceAnalytics: {
        groupSessions: 1
      },
      individualFitness: {
        fitnessSessions: 1
      },
      individualMental: {
        mentalSessions: 1
      },
      tournamentPrep: {
        tournamentPrep: 1
      },
      tournament: {
        tournaments: 1
      }
    };
  },

  // Calculate tokens needed for a package
  calculatePackageTokens(packageId) {
    const packageTokens = {
      'youth-starter': {
        groupSessions: 4,
        tournaments: 2
      },
      'youth-developer': {
        groupSessions: 8,
        tournaments: 3
      },
      'youth-elite': {
        groupSessions: 12,
        tournaments: 4
      },
      'youth-champion': {
        groupSessions: 16,
        tournaments: 4
      },
      'adult-starter': {
        groupSessions: 4,
        tournaments: 2
      },
      'adult-developer': {
        groupSessions: 8,
        tournaments: 3
      },
      'adult-elite': {
        groupSessions: 12,
        tournaments: 4
      },
      'adult-champion': {
        groupSessions: 16,
        tournaments: 4
      }
    };

    return packageTokens[packageId] || {};
  },

  // Calculate tokens needed for add-ons
  calculateAddOnTokens(addOnId) {
    const addOnTokens = {
      'ryp-academy-starter': {
        fitnessSessions: 4
      },
      'ryp-academy-developer': {
        fitnessSessions: 8
      },
      'mental-starter': {
        mentalSessions: 2
      },
      'mental-developer': {
        mentalSessions: 4
      },
      'tournament-prep': {
        tournamentPrep: 1
      }
    };

    return addOnTokens[addOnId] || {};
  }
};
