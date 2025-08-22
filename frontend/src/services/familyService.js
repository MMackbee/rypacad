import { 
  doc, 
  getDoc, 
  updateDoc, 
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db } from '../firebase';
import { tokenService } from './tokenService';

// Family/Parent-Child Account Management Service
export const familyService = {
  // Create parent-child relationship
  async linkParentToChild(parentId, childId, relationship = 'parent') {
    try {
      const familyRef = doc(db, 'families', `${parentId}_${childId}`);
      
      await setDoc(familyRef, {
        parentId: parentId,
        childId: childId,
        relationship: relationship,
        status: 'active',
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });

      // Update user profiles
      await this.updateUserFamilyStatus(parentId, 'parent', childId);
      await this.updateUserFamilyStatus(childId, 'child', parentId);

      return true;
    } catch (error) {
      console.error('Error linking parent to child:', error);
      throw error;
    }
  },

  // Get all children for a parent
  async getChildrenForParent(parentId) {
    try {
      const familiesRef = collection(db, 'families');
      const q = query(familiesRef, where('parentId', '==', parentId), where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      
      const children = [];
      for (const doc of snapshot.docs) {
        const familyData = doc.data();
        const childProfile = await this.getUserProfile(familyData.childId);
        if (childProfile) {
          children.push({
            ...childProfile,
            relationship: familyData.relationship,
            linkedAt: familyData.createdAt
          });
        }
      }
      
      return children;
    } catch (error) {
      console.error('Error fetching children:', error);
      throw error;
    }
  },

  // Get parent for a child
  async getParentForChild(childId) {
    try {
      const familiesRef = collection(db, 'families');
      const q = query(familiesRef, where('childId', '==', childId), where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      
      if (snapshot.docs.length > 0) {
        const familyData = snapshot.docs[0].data();
        const parentProfile = await this.getUserProfile(familyData.parentId);
        return parentProfile ? {
          ...parentProfile,
          relationship: familyData.relationship,
          linkedAt: familyData.createdAt
        } : null;
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching parent:', error);
      throw error;
    }
  },

  // Parent funds child's account
  async fundChildAccount(parentId, childId, amount, paymentMethod = 'stripe') {
    try {
      // Verify parent-child relationship
      const isParent = await this.verifyParentChildRelationship(parentId, childId);
      if (!isParent) {
        throw new Error('Unauthorized: You can only fund accounts of your linked children');
      }

      // Process payment (this would integrate with Stripe)
      const paymentResult = await this.processParentPayment(parentId, amount, paymentMethod);
      
      if (paymentResult.success) {
        // Add funds to child's account
        await this.addFundsToChildAccount(childId, amount, parentId);
        
        // Create funding record
        await this.createFundingRecord(parentId, childId, amount, paymentResult.transactionId);
        
        return {
          success: true,
          message: `Successfully funded $${amount} to child's account`,
          transactionId: paymentResult.transactionId
        };
      } else {
        throw new Error('Payment failed');
      }
    } catch (error) {
      console.error('Error funding child account:', error);
      throw error;
    }
  },

  // Parent purchases package for child
  async purchasePackageForChild(parentId, childId, packageId, addOns = []) {
    try {
      // Verify parent-child relationship
      const isParent = await this.verifyParentChildRelationship(parentId, childId);
      if (!isParent) {
        throw new Error('Unauthorized: You can only purchase packages for your linked children');
      }

      // Calculate total cost
      const totalCost = this.calculatePackageCost(packageId, addOns);
      
      // Process payment
      const paymentResult = await this.processParentPayment(parentId, totalCost, 'stripe');
      
      if (paymentResult.success) {
        // Add tokens to child's account
        const packageTokens = tokenService.calculatePackageTokens(packageId);
        for (const [tokenType, quantity] of Object.entries(packageTokens)) {
          await tokenService.addTokens(childId, tokenType, quantity, 'parent_purchase');
        }

        // Add add-on tokens
        let allAddOnTokens = {};
        for (const addOn of addOns) {
          const addOnTokens = tokenService.calculateAddOnTokens(addOn.id);
          for (const [tokenType, quantity] of Object.entries(addOnTokens)) {
            await tokenService.addTokens(childId, tokenType, quantity, 'parent_purchase');
          }
          allAddOnTokens = { ...allAddOnTokens, ...addOnTokens };
        }

        // Create purchase record
        await this.createPurchaseRecord(parentId, childId, packageId, addOns, totalCost, paymentResult.transactionId);
        
        return {
          success: true,
          message: 'Package purchased successfully for child',
          tokensAdded: { ...packageTokens, ...allAddOnTokens },
          transactionId: paymentResult.transactionId
        };
      } else {
        throw new Error('Payment failed');
      }
    } catch (error) {
      console.error('Error purchasing package for child:', error);
      throw error;
    }
  },

  // Parent schedules session for child
  async scheduleSessionForChild(parentId, childId, sessionData) {
    try {
      // Verify parent-child relationship
      const isParent = await this.verifyParentChildRelationship(parentId, childId);
      if (!isParent) {
        throw new Error('Unauthorized: You can only schedule sessions for your linked children');
      }

      // Check if child has sufficient tokens
      const tokenRequirements = tokenService.getTokenRequirements();
      const requiredTokens = tokenRequirements[sessionData.type];
      
      if (requiredTokens) {
        for (const [tokenType, quantity] of Object.entries(requiredTokens)) {
          const hasTokens = await tokenService.hasSufficientTokens(childId, tokenType, quantity);
          if (!hasTokens) {
            throw new Error(`Insufficient ${tokenType} tokens for this session`);
          }
        }
      }

      // Use tokens and create booking
      if (requiredTokens) {
        for (const [tokenType, quantity] of Object.entries(requiredTokens)) {
          await tokenService.useTokens(childId, tokenType, quantity, sessionData.sessionId);
        }
      }

      // Create booking record
      const bookingId = await this.createChildBooking(childId, sessionData, parentId);
      
      return {
        success: true,
        message: 'Session scheduled successfully',
        bookingId: bookingId
      };
    } catch (error) {
      console.error('Error scheduling session for child:', error);
      throw error;
    }
  },

  // Get child's account summary for parent
  async getChildAccountSummary(parentId, childId) {
    try {
      // Verify parent-child relationship
      const isParent = await this.verifyParentChildRelationship(parentId, childId);
      if (!isParent) {
        throw new Error('Unauthorized: You can only view accounts of your linked children');
      }

      // Get child's token balance
      const tokens = await tokenService.getUserTokens(childId);
      
      // Get child's recent activity
      const recentActivity = await this.getChildRecentActivity(childId);
      
      // Get child's upcoming sessions
      const upcomingSessions = await this.getChildUpcomingSessions(childId);
      
      // Get child's spending history
      const spendingHistory = await this.getChildSpendingHistory(childId);

      return {
        childProfile: await this.getUserProfile(childId),
        tokenBalance: tokens,
        recentActivity: recentActivity,
        upcomingSessions: upcomingSessions,
        spendingHistory: spendingHistory
      };
    } catch (error) {
      console.error('Error fetching child account summary:', error);
      throw error;
    }
  },

  // Helper methods
  async verifyParentChildRelationship(parentId, childId) {
    try {
      const familiesRef = collection(db, 'families');
      const q = query(
        familiesRef, 
        where('parentId', '==', parentId), 
        where('childId', '==', childId), 
        where('status', '==', 'active')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.length > 0;
    } catch (error) {
      console.error('Error verifying parent-child relationship:', error);
      return false;
    }
  },

  async updateUserFamilyStatus(userId, role, linkedUserId) {
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        familyRole: role,
        linkedUserId: linkedUserId,
        lastUpdated: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating user family status:', error);
      throw error;
    }
  },

  async getUserProfile(userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);
      return userSnap.exists() ? { id: userSnap.id, ...userSnap.data() } : null;
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  },

  async processParentPayment(parentId, amount, paymentMethod) {
    // This would integrate with Stripe
    // For now, return mock success
    return {
      success: true,
      transactionId: `txn_${Date.now()}_${parentId}`
    };
  },

  async addFundsToChildAccount(childId, amount, parentId) {
    try {
      const childAccountRef = doc(db, 'childAccounts', childId);
      const childAccountSnap = await getDoc(childAccountRef);
      
      if (childAccountSnap.exists()) {
        await updateDoc(childAccountRef, {
          balance: increment(amount),
          lastUpdated: serverTimestamp()
        });
      } else {
        await setDoc(childAccountRef, {
          childId: childId,
          balance: amount,
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp()
        });
      }
    } catch (error) {
      console.error('Error adding funds to child account:', error);
      throw error;
    }
  },

  async createFundingRecord(parentId, childId, amount, transactionId) {
    try {
      const fundingRef = doc(db, 'fundingRecords', `${transactionId}`);
      await setDoc(fundingRef, {
        parentId: parentId,
        childId: childId,
        amount: amount,
        transactionId: transactionId,
        type: 'funding',
        status: 'completed',
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error creating funding record:', error);
      throw error;
    }
  },

  async createPurchaseRecord(parentId, childId, packageId, addOns, totalCost, transactionId) {
    try {
      const purchaseRef = doc(db, 'purchaseRecords', `${transactionId}`);
      await setDoc(purchaseRef, {
        parentId: parentId,
        childId: childId,
        packageId: packageId,
        addOns: addOns,
        totalCost: totalCost,
        transactionId: transactionId,
        type: 'package_purchase',
        status: 'completed',
        createdAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error creating purchase record:', error);
      throw error;
    }
  },

  async createChildBooking(childId, sessionData, parentId) {
    try {
      const bookingRef = doc(db, 'bookings', `${childId}_${sessionData.sessionId}`);
      await setDoc(bookingRef, {
        userId: childId,
        sessionId: sessionData.sessionId,
        sessionType: sessionData.type,
        scheduledBy: parentId,
        status: 'confirmed',
        createdAt: serverTimestamp()
      });
      return bookingRef.id;
    } catch (error) {
      console.error('Error creating child booking:', error);
      throw error;
    }
  },

  calculatePackageCost(packageId, addOns) {
    // This would calculate based on your pricing structure
    const packagePrices = {
      'youth-starter': 200,
      'youth-developer': 380,
      'youth-elite': 540,
      'youth-champion': 680
    };

    const addOnPrices = {
      'ryp-academy-starter': 120,
      'mental-starter': 100,
      'tournament-prep': 400
    };

    let total = packagePrices[packageId] || 0;
    addOns.forEach(addOn => {
      total += addOnPrices[addOn.id] || 0;
    });

    return total;
  },

  async getChildRecentActivity(childId) {
    // This would fetch recent activity from various collections
    return [];
  },

  async getChildUpcomingSessions(childId) {
    // This would fetch upcoming sessions
    return [];
  },

  async getChildSpendingHistory(childId) {
    // This would fetch spending history
    return [];
  }
};
