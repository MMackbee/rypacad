// SMS Service for Twilio Integration
export const smsService = {
  // Send SMS notification
  async sendSMS(to, message, type = 'notification') {
    try {
      const response = await fetch('/api/send-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: to,
          message: message,
          type: type
        }),
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error sending SMS:', error);
      throw error;
    }
  },

  // Send waitlist notification
  async sendWaitlistNotification(userPhone, sessionDetails, responseDeadline) {
    const message = `🎯 RYP Golf: A spot opened up for your waitlisted session!
    
📅 ${sessionDetails.date} at ${sessionDetails.time}
📍 ${sessionDetails.location}
👨‍🏫 ${sessionDetails.instructor}

Reply "YES" to confirm your spot within 24 hours.
Reply "NO" to decline.

Deadline: ${responseDeadline}`;

    return await this.sendSMS(userPhone, message, 'waitlist');
  },

  // Send session reminder
  async sendSessionReminder(userPhone, sessionDetails) {
    const message = `⏰ RYP Golf Session Reminder
    
📅 Tomorrow: ${sessionDetails.date} at ${sessionDetails.time}
📍 ${sessionDetails.location}
👨‍🏫 ${sessionDetails.instructor}

Please arrive 10 minutes early.
Bring your golf clubs and water bottle.

See you there! 🏌️‍♂️`;

    return await this.sendSMS(userPhone, message, 'reminder');
  },

  // Send booking confirmation
  async sendBookingConfirmation(userPhone, bookingDetails) {
    const message = `✅ RYP Golf Booking Confirmed!
    
📅 ${bookingDetails.date} at ${bookingDetails.time}
📍 ${bookingDetails.location}
👨‍🏫 ${bookingDetails.instructor}
💰 $${bookingDetails.price}

Your session is confirmed. We'll send a reminder 24 hours before.

Questions? Call us at (555) 123-4567`;

    return await this.sendSMS(userPhone, message, 'confirmation');
  },

  // Send cancellation notification
  async sendCancellationNotification(userPhone, sessionDetails) {
    const message = `❌ RYP Golf Session Cancelled
    
📅 ${sessionDetails.date} at ${sessionDetails.time}
📍 ${sessionDetails.location}

Your session has been cancelled. You can book a new session anytime.

We're sorry for any inconvenience.`;

    return await this.sendSMS(userPhone, message, 'cancellation');
  },

  // Send welcome message
  async sendWelcomeMessage(userPhone, userName) {
    const message = `🎉 Welcome to RYP Golf, ${userName}!

Thank you for joining our golf training program. We're excited to help you improve your game!

📱 Download our app: rypgolf.com/app
📧 Email: info@rypgolf.com
📞 Phone: (555) 123-4567

Your first session will be scheduled soon.`;

    return await this.sendSMS(userPhone, message, 'welcome');
  },

  // Send progress update
  async sendProgressUpdate(userPhone, progressData) {
    const message = `📊 RYP Golf Progress Update
    
Great news! Your progress has been updated:
🎯 Current Level: ${progressData.level}
📈 Improvement: ${progressData.improvement}%
🏆 Next Goal: ${progressData.nextGoal}

Keep up the great work! Your next session is ${progressData.nextSession}.`;

    return await this.sendSMS(userPhone, message, 'progress');
  },

  // Send tournament reminder
  async sendTournamentReminder(userPhone, tournamentDetails) {
    const message = `🏆 RYP Golf Tournament Reminder
    
📅 Tournament: ${tournamentDetails.name}
📅 Date: ${tournamentDetails.date}
📍 Location: ${tournamentDetails.location}
⏰ Tee Time: ${tournamentDetails.teeTime}

Good luck! Remember your mental game strategies.
We're rooting for you! 🏌️‍♂️`;

    return await this.sendSMS(userPhone, message, 'tournament');
  },

  // Send payment reminder
  async sendPaymentReminder(userPhone, paymentDetails) {
    const message = `💳 RYP Golf Payment Reminder
    
Your payment of $${paymentDetails.amount} for ${paymentDetails.package} is due in 3 days.

📅 Due Date: ${paymentDetails.dueDate}
💳 Payment Link: rypgolf.com/pay

Questions? Call us at (555) 123-4567`;

    return await this.sendSMS(userPhone, message, 'payment');
  },

  // Send weather update
  async sendWeatherUpdate(userPhone, sessionDetails, weatherInfo) {
    const message = `🌤️ RYP Golf Weather Update
    
📅 Session: ${sessionDetails.date} at ${sessionDetails.time}
🌡️ Temperature: ${weatherInfo.temperature}°F
🌧️ Conditions: ${weatherInfo.conditions}
💨 Wind: ${weatherInfo.wind}

Please dress appropriately for the weather.
Session is still on unless you hear otherwise!`;

    return await this.sendSMS(userPhone, message, 'weather');
  }
};

// SMS Template Manager
export const smsTemplates = {
  // Get template by type
  getTemplate(type, data = {}) {
    const templates = {
      waitlist: {
        message: `🎯 RYP Golf: A spot opened up for your waitlisted session!
        
📅 {date} at {time}
📍 {location}
👨‍🏫 {instructor}

Reply "YES" to confirm your spot within 24 hours.
Reply "NO" to decline.

Deadline: {deadline}`,
        variables: ['date', 'time', 'location', 'instructor', 'deadline']
      },
      
      reminder: {
        message: `⏰ RYP Golf Session Reminder
        
📅 Tomorrow: {date} at {time}
📍 {location}
👨‍🏫 {instructor}

Please arrive 10 minutes early.
Bring your golf clubs and water bottle.

See you there! 🏌️‍♂️`,
        variables: ['date', 'time', 'location', 'instructor']
      },
      
      confirmation: {
        message: `✅ RYP Golf Booking Confirmed!
        
📅 {date} at {time}
📍 {location}
👨‍🏫 {instructor}
💰 ${data.price}

Your session is confirmed. We'll send a reminder 24 hours before.

Questions? Call us at (555) 123-4567`,
        variables: ['date', 'time', 'location', 'instructor', 'price']
      },
      
      welcome: {
        message: `🎉 Welcome to RYP Golf, {name}!

Thank you for joining our golf training program. We're excited to help you improve your game!

📱 Download our app: rypgolf.com/app
📧 Email: info@rypgolf.com
📞 Phone: (555) 123-4567

Your first session will be scheduled soon.`,
        variables: ['name']
      }
    };

    return templates[type] || null;
  },

  // Fill template with data
  fillTemplate(template, data) {
    let message = template.message;
    
    template.variables.forEach(variable => {
      const placeholder = `{${variable}}`;
      const value = data[variable] || '';
      message = message.replace(new RegExp(placeholder, 'g'), value);
    });

    return message;
  }
};

// SMS Response Handler
export const smsResponseHandler = {
  // Handle incoming SMS responses
  async handleIncomingSMS(from, message) {
    const cleanMessage = message.trim().toUpperCase();
    
    switch (cleanMessage) {
      case 'YES':
        return await this.handleYesResponse(from);
      case 'NO':
        return await this.handleNoResponse(from);
      case 'CANCEL':
        return await this.handleCancelResponse(from);
      case 'RESCHEDULE':
        return await this.handleRescheduleResponse(from);
      case 'INFO':
        return await this.handleInfoResponse(from);
      default:
        return await this.handleUnknownResponse(from, message);
    }
  },

  // Handle "YES" response (confirm waitlist spot)
  async handleYesResponse(phone) {
    try {
      const response = await fetch('/api/handle-sms-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone,
          response: 'YES',
          action: 'confirm_waitlist'
        }),
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error handling YES response:', error);
      throw error;
    }
  },

  // Handle "NO" response (decline waitlist spot)
  async handleNoResponse(phone) {
    try {
      const response = await fetch('/api/handle-sms-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone,
          response: 'NO',
          action: 'decline_waitlist'
        }),
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error handling NO response:', error);
      throw error;
    }
  },

  // Handle "CANCEL" response
  async handleCancelResponse(phone) {
    try {
      const response = await fetch('/api/handle-sms-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone,
          response: 'CANCEL',
          action: 'cancel_session'
        }),
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error handling CANCEL response:', error);
      throw error;
    }
  },

  // Handle "RESCHEDULE" response
  async handleRescheduleResponse(phone) {
    try {
      const response = await fetch('/api/handle-sms-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone,
          response: 'RESCHEDULE',
          action: 'reschedule_session'
        }),
      });

      const data = await response.json();
      return data.success;
    } catch (error) {
      console.error('Error handling RESCHEDULE response:', error);
      throw error;
    }
  },

  // Handle "INFO" response
  async handleInfoResponse(phone) {
    const infoMessage = `📞 RYP Golf Contact Info

📧 Email: info@rypgolf.com
📞 Phone: (555) 123-4567
🌐 Website: rypgolf.com
📍 Address: 123 Golf Course Dr, City, State

Hours: Mon-Fri 8AM-8PM, Sat-Sun 9AM-6PM

Need to book or reschedule? Call us!`;

    return await smsService.sendSMS(phone, infoMessage, 'info');
  },

  // Handle unknown response
  async handleUnknownResponse(phone, message) {
    const helpMessage = `🤔 RYP Golf SMS Commands

Reply with:
• YES - Confirm waitlist spot
• NO - Decline waitlist spot
• CANCEL - Cancel session
• RESCHEDULE - Reschedule session
• INFO - Get contact information

For immediate assistance, call (555) 123-4567`;

    return await smsService.sendSMS(phone, helpMessage, 'help');
  }
};
