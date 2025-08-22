// SMS Response Handler for RYP Golf Waitlist System

import automatedNotificationService from './AutomatedNotificationService';

class SMSResponseHandler {
  constructor() {
    this.responsePatterns = {
      accept: /^(yes|y|accept|ok|sure|confirm)$/i,
      decline: /^(no|n|decline|reject|cancel|pass)$/i
    };
  }

  // Process incoming SMS response
  async handleSMSResponse(phoneNumber, message, sessionId = null) {
    try {
      console.log(`Processing SMS response from ${phoneNumber}: "${message}"`);
      
      // Clean the message
      const cleanMessage = message.trim().toLowerCase();
      
      // Determine response type
      const responseType = this.parseResponse(cleanMessage);
      
      if (!responseType) {
        return this.sendInvalidResponseMessage(phoneNumber);
      }
      
      // Find the user and session based on phone number
      const userSession = await this.findUserSession(phoneNumber);
      
      if (!userSession) {
        return this.sendNotFoundMessage(phoneNumber);
      }
      
      // Process the response
      await this.processUserResponse(
        userSession.sessionId,
        userSession.userId,
        responseType
      );
      
      // Send confirmation message
      await this.sendConfirmationMessage(phoneNumber, responseType, userSession);
      
      return {
        success: true,
        responseType,
        sessionId: userSession.sessionId,
        userId: userSession.userId
      };
      
    } catch (error) {
      console.error('Error handling SMS response:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Parse the SMS response
  parseResponse(message) {
    if (this.responsePatterns.accept.test(message)) {
      return 'accept';
    } else if (this.responsePatterns.decline.test(message)) {
      return 'decline';
    }
    return null;
  }

  // Find user session based on phone number
  async findUserSession(phoneNumber) {
    try {
      // In real implementation, this would query Firebase
      // For now, we'll use mock data
      const mockUserSessions = [
        {
          phoneNumber: '+1 (555) 123-4567',
          userId: 'user-1',
          sessionId: '2024-01-15-16:00',
          userName: 'John Smith'
        },
        {
          phoneNumber: '+1 (555) 234-5678',
          userId: 'user-2',
          sessionId: '2024-01-15-16:00',
          userName: 'Sarah Johnson'
        },
        {
          phoneNumber: '+1 (555) 456-7890',
          userId: 'user-4',
          sessionId: '2024-01-18-17:00',
          userName: 'Lisa Chen'
        }
      ];
      
      const userSession = mockUserSessions.find(
        session => session.phoneNumber === phoneNumber
      );
      
      return userSession;
    } catch (error) {
      console.error('Error finding user session:', error);
      return null;
    }
  }

  // Process user response through automated service
  async processUserResponse(sessionId, userId, responseType) {
    try {
      const result = await automatedNotificationService.handleUserResponse(
        sessionId,
        userId,
        responseType
      );
      
      console.log(`Processed ${responseType} response for user ${userId} in session ${sessionId}`);
      
      return result;
    } catch (error) {
      console.error('Error processing user response:', error);
      throw error;
    }
  }

  // Send confirmation message based on response
  async sendConfirmationMessage(phoneNumber, responseType, userSession) {
    try {
      let message;
      
      if (responseType === 'accept') {
        message = `Thank you for accepting! Your spot has been confirmed for the RYP Golf training session. We'll see you there!`;
      } else if (responseType === 'decline') {
        message = `Thank you for letting us know. You have been removed from the waitlist. Feel free to book another session anytime!`;
      }
      
      // Send confirmation SMS
      await this.sendSMS(phoneNumber, message);
      
      console.log(`Confirmation message sent to ${phoneNumber}`);
      
    } catch (error) {
      console.error('Error sending confirmation message:', error);
    }
  }

  // Send invalid response message
  async sendInvalidResponseMessage(phoneNumber) {
    try {
      const message = `Invalid response. Please reply with YES to accept the spot or NO to decline. You have 24 hours to respond.`;
      
      await this.sendSMS(phoneNumber, message);
      
      console.log(`Invalid response message sent to ${phoneNumber}`);
      
    } catch (error) {
      console.error('Error sending invalid response message:', error);
    }
  }

  // Send not found message
  async sendNotFoundMessage(phoneNumber) {
    try {
      const message = `We couldn't find an active waitlist notification for this phone number. Please contact RYP Golf support if you believe this is an error.`;
      
      await this.sendSMS(phoneNumber, message);
      
      console.log(`Not found message sent to ${phoneNumber}`);
      
    } catch (error) {
      console.error('Error sending not found message:', error);
    }
  }

  // Send SMS (mock implementation - would use Twilio in production)
  async sendSMS(phoneNumber, message) {
    try {
      // In real implementation, this would use Twilio API
      console.log(`SMS to ${phoneNumber}: ${message}`);
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return {
        success: true,
        messageId: `msg_${Date.now()}`
      };
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  }

  // Webhook handler for Twilio SMS responses
  async handleWebhook(request) {
    try {
      const { From, Body } = request.body;
      
      console.log(`Webhook received from ${From}: "${Body}"`);
      
      // Extract phone number and message
      const phoneNumber = From;
      const message = Body;
      
      // Process the response
      const result = await this.handleSMSResponse(phoneNumber, message);
      
      return {
        success: true,
        result
      };
      
    } catch (error) {
      console.error('Error handling webhook:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Test function to simulate SMS response
  async testSMSResponse(phoneNumber, message) {
    console.log(`\n🧪 Testing SMS Response:`);
    console.log(`From: ${phoneNumber}`);
    console.log(`Message: "${message}"`);
    console.log(`---`);
    
    const result = await this.handleSMSResponse(phoneNumber, message);
    
    console.log(`Result:`, result);
    console.log(`---\n`);
    
    return result;
  }
}

// Create singleton instance
const smsResponseHandler = new SMSResponseHandler();

export default smsResponseHandler; 