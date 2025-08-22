// Automated Notification Service for RYP Golf Waitlist Management

import smsResponseHandler from './SMSResponseHandler';

class AutomatedNotificationService {
  constructor() {
    this.notificationQueue = [];
    this.processingQueue = false;
  }

  // Add user to waitlist and trigger notifications if needed
  async addToWaitlist(sessionId, userId, userData) {
    try {
      // In real implementation, this would save to Firebase
      console.log(`Adding user ${userId} to waitlist for session ${sessionId}`);
      
      // Get current waitlist for this session
      const waitlistData = await this.getWaitlistData(sessionId);
      const newPosition = waitlistData.length + 1;
      
      // Add user to waitlist
      const waitlistEntry = {
        userId,
        userData,
        position: newPosition,
        joinedAt: new Date().toISOString(),
        notificationSent: false,
        notificationSentAt: null,
        responseDeadline: null,
        status: 'waiting'
      };
      
      waitlistData.push(waitlistEntry);
      await this.saveWaitlistData(sessionId, waitlistData);
      
      // Check if we need to send notifications
      await this.checkAndSendNotifications(sessionId);
      
      return {
        success: true,
        position: newPosition,
        message: `Added to waitlist position #${newPosition}`
      };
    } catch (error) {
      console.error('Error adding to waitlist:', error);
      return {
        success: false,
        message: 'Failed to add to waitlist'
      };
    }
  }

  // Check if spots are available and send notifications
  async checkAndSendNotifications(sessionId) {
    try {
      const sessionData = await this.getSessionData(sessionId);
      const waitlistData = await this.getWaitlistData(sessionId);
      
      const availableSpots = sessionData.maxCapacity - sessionData.currentBookings;
      const pendingNotifications = waitlistData.filter(user => 
        user.status === 'waiting' && !user.notificationSent
      );
      
      // Send notifications to users in order
      for (let i = 0; i < Math.min(availableSpots, pendingNotifications.length); i++) {
        const user = pendingNotifications[i];
        await this.sendNotification(sessionId, user);
      }
    } catch (error) {
      console.error('Error checking notifications:', error);
    }
  }

  // Send SMS notification to user
  async sendNotification(sessionId, user) {
    try {
      const sessionData = await this.getSessionData(sessionId);
      const deadline = new Date();
      deadline.setHours(deadline.getHours() + 24); // 24 hour response window
      
      // Update user notification status
      user.notificationSent = true;
      user.notificationSentAt = new Date().toISOString();
      user.responseDeadline = deadline.toISOString();
      user.status = 'notified';
      
      // Send SMS with clear response instructions
      const message = this.createNotificationMessage(sessionData, user);
      await this.sendSMS(user.userData.phone, message);
      
      // Send email backup
      await this.sendEmail(user.userData.email, message);
      
      // Update waitlist data
      await this.updateWaitlistUser(sessionId, user);
      
      console.log(`Notification sent to ${user.userData.name} for session ${sessionId}`);
      
      return {
        success: true,
        message: `Notification sent to ${user.userData.name}`
      };
    } catch (error) {
      console.error('Error sending notification:', error);
      return {
        success: false,
        message: 'Failed to send notification'
      };
    }
  }

  // Handle user response to notification
  async handleUserResponse(sessionId, userId, response) {
    try {
      const waitlistData = await this.getWaitlistData(sessionId);
      const user = waitlistData.find(u => u.userId === userId);
      
      if (!user) {
        throw new Error('User not found in waitlist');
      }
      
      if (response === 'accept') {
        // Move user to confirmed session
        await this.moveToConfirmed(sessionId, userId);
        user.status = 'confirmed';
        
        // Send confirmation SMS
        const confirmMessage = `Thank you for accepting! Your spot has been confirmed for the RYP Golf training session. We'll see you there!`;
        await this.sendSMS(user.userData.phone, confirmMessage);
        
        // Check for next person in waitlist
        await this.checkAndSendNotifications(sessionId);
        
      } else if (response === 'decline') {
        // Remove user from waitlist
        user.status = 'declined';
        await this.removeFromWaitlist(sessionId, userId);
        
        // Send decline confirmation
        const declineMessage = `Thank you for letting us know. You have been removed from the waitlist. Feel free to book another session anytime!`;
        await this.sendSMS(user.userData.phone, declineMessage);
        
        // Check for next person in waitlist
        await this.checkAndSendNotifications(sessionId);
      }
      
      await this.updateWaitlistUser(sessionId, user);
      
      return {
        success: true,
        message: `Response processed: ${response}`
      };
    } catch (error) {
      console.error('Error handling user response:', error);
      return {
        success: false,
        message: 'Failed to process response'
      };
    }
  }

  // Move user from waitlist to confirmed session
  async moveToConfirmed(sessionId, userId) {
    try {
      const sessionData = await this.getSessionData(sessionId);
      sessionData.currentBookings += 1;
      await this.saveSessionData(sessionId, sessionData);
      
      console.log(`User ${userId} moved to confirmed session ${sessionId}`);
    } catch (error) {
      console.error('Error moving to confirmed:', error);
    }
  }

  // Remove user from waitlist
  async removeFromWaitlist(sessionId, userId) {
    try {
      const waitlistData = await this.getWaitlistData(sessionId);
      const filteredWaitlist = waitlistData.filter(u => u.userId !== userId);
      
      // Reorder remaining users
      filteredWaitlist.forEach((user, index) => {
        user.position = index + 1;
      });
      
      await this.saveWaitlistData(sessionId, filteredWaitlist);
      
      console.log(`User ${userId} removed from waitlist ${sessionId}`);
    } catch (error) {
      console.error('Error removing from waitlist:', error);
    }
  }

  // Create notification message with clear response instructions
  createNotificationMessage(sessionData, user) {
    const sessionDate = new Date(sessionData.date + 'T' + sessionData.time);
    const formattedDate = sessionDate.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    
    return `RYP Golf: A spot has opened up for your waitlisted session on ${formattedDate}. Reply YES to accept or NO to decline. You have 24 hours to respond.`;
  }

  // Send SMS via Twilio (mock implementation)
  async sendSMS(phoneNumber, message) {
    try {
      // In real implementation, this would use Twilio API
      console.log(`📱 SMS to ${phoneNumber}: ${message}`);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return {
        success: true,
        messageId: `msg_${Date.now()}`
      };
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  }

  // Send email backup (mock implementation)
  async sendEmail(email, message) {
    try {
      // In real implementation, this would use email service
      console.log(`📧 Email to ${email}: ${message}`);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return {
        success: true,
        messageId: `email_${Date.now()}`
      };
    } catch (error) {
      console.error('Error sending email:', error);
      throw error;
    }
  }

  // Process expired notifications
  async processExpiredNotifications() {
    try {
      const allSessions = await this.getAllSessions();
      
      for (const session of allSessions) {
        const waitlistData = await this.getWaitlistData(session.id);
        const now = new Date();
        
        // Find users with expired notifications
        const expiredUsers = waitlistData.filter(user => 
          user.notificationSent && 
          user.responseDeadline && 
          new Date(user.responseDeadline) < now &&
          user.status === 'notified'
        );
        
        // Remove expired users from waitlist
        for (const user of expiredUsers) {
          user.status = 'expired';
          await this.removeFromWaitlist(session.id, user.userId);
          
          // Send expiration notification
          const expireMessage = `Your waitlist spot has expired. You have been removed from the waitlist.`;
          await this.sendSMS(user.userData.phone, expireMessage);
        }
        
        // Check for new notifications
        await this.checkAndSendNotifications(session.id);
      }
    } catch (error) {
      console.error('Error processing expired notifications:', error);
    }
  }

  // Handle incoming SMS response via webhook
  async handleIncomingSMS(phoneNumber, message) {
    try {
      // Use the SMS response handler to process the response
      const result = await smsResponseHandler.handleSMSResponse(phoneNumber, message);
      
      console.log(`📨 Processed incoming SMS from ${phoneNumber}: ${result}`);
      
      return result;
    } catch (error) {
      console.error('Error handling incoming SMS:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Mock data methods (in real implementation, these would use Firebase)
  async getWaitlistData(sessionId) {
    // Mock implementation
    return [];
  }

  async saveWaitlistData(sessionId, data) {
    // Mock implementation
    console.log(`💾 Saving waitlist data for session ${sessionId}:`, data);
  }

  async getSessionData(sessionId) {
    // Mock implementation
    return {
      id: sessionId,
      date: '2024-01-15',
      time: '16:00',
      maxCapacity: 16,
      currentBookings: 14
    };
  }

  async saveSessionData(sessionId, data) {
    // Mock implementation
    console.log(`💾 Saving session data for session ${sessionId}:`, data);
  }

  async updateWaitlistUser(sessionId, user) {
    // Mock implementation
    console.log(`🔄 Updating waitlist user for session ${sessionId}:`, user);
  }

  async getAllSessions() {
    // Mock implementation
    return [
      { id: 'session-1' },
      { id: 'session-2' }
    ];
  }

  // Start automated processing
  startAutomatedProcessing() {
    // Process expired notifications every hour
    setInterval(() => {
      this.processExpiredNotifications();
    }, 60 * 60 * 1000); // 1 hour
    
    // Check for new notifications every 5 minutes
    setInterval(() => {
      this.checkAllSessionsForNotifications();
    }, 5 * 60 * 1000); // 5 minutes
    
    console.log('🤖 Automated notification service started');
  }

  // Check all sessions for notifications
  async checkAllSessionsForNotifications() {
    try {
      const allSessions = await this.getAllSessions();
      
      for (const session of allSessions) {
        await this.checkAndSendNotifications(session.id);
      }
    } catch (error) {
      console.error('Error checking all sessions:', error);
    }
  }
}

// Create singleton instance
const automatedNotificationService = new AutomatedNotificationService();

// Start the service
automatedNotificationService.startAutomatedProcessing();

export default automatedNotificationService; 