import { getAnalytics, logEvent, setUserId, setUserProperties } from 'firebase/analytics';
import { app } from '../firebase';

// Initialize Firebase Analytics
const analytics = getAnalytics(app);

// Analytics Service
export const analyticsService = {
  // Initialize user tracking
  initializeUser(userId, userProperties = {}) {
    try {
      setUserId(analytics, userId);
      setUserProperties(analytics, {
        user_type: userProperties.role || 'student',
        account_status: userProperties.status || 'active',
        ...userProperties
      });
    } catch (error) {
      console.error('Error initializing analytics user:', error);
    }
  },

  // Track page views
  trackPageView(pageName, pageProperties = {}) {
    try {
      logEvent(analytics, 'page_view', {
        page_name: pageName,
        page_title: document.title,
        page_location: window.location.href,
        ...pageProperties
      });
    } catch (error) {
      console.error('Error tracking page view:', error);
    }
  },

  // Track package views
  trackPackageView(packageId, packageType, packagePrice) {
    try {
      logEvent(analytics, 'view_item', {
        item_id: packageId,
        item_name: packageType,
        price: packagePrice,
        currency: 'USD',
        item_category: 'golf_package'
      });
    } catch (error) {
      console.error('Error tracking package view:', error);
    }
  },

  // Track package selection
  trackPackageSelection(packageId, packageType, packagePrice) {
    try {
      logEvent(analytics, 'add_to_cart', {
        item_id: packageId,
        item_name: packageType,
        price: packagePrice,
        currency: 'USD',
        item_category: 'golf_package'
      });
    } catch (error) {
      console.error('Error tracking package selection:', error);
    }
  },

  // Track payment initiation
  trackPaymentInitiated(packageId, amount, addOns = []) {
    try {
      logEvent(analytics, 'begin_checkout', {
        transaction_id: `txn_${Date.now()}`,
        value: amount,
        currency: 'USD',
        items: [
          {
            item_id: packageId,
            item_name: 'Golf Package',
            price: amount,
            quantity: 1
          },
          ...addOns.map(addOn => ({
            item_id: addOn.id,
            item_name: addOn.title,
            price: addOn.standalonePrice,
            quantity: 1
          }))
        ]
      });
    } catch (error) {
      console.error('Error tracking payment initiation:', error);
    }
  },

  // Track successful payment
  trackPaymentSuccess(transactionId, amount, packageId, addOns = []) {
    try {
      logEvent(analytics, 'purchase', {
        transaction_id: transactionId,
        value: amount,
        currency: 'USD',
        tax: 0,
        shipping: 0,
        items: [
          {
            item_id: packageId,
            item_name: 'Golf Package',
            price: amount,
            quantity: 1
          },
          ...addOns.map(addOn => ({
            item_id: addOn.id,
            item_name: addOn.title,
            price: addOn.standalonePrice,
            quantity: 1
          }))
        ]
      });
    } catch (error) {
      console.error('Error tracking payment success:', error);
    }
  },

  // Track session booking
  trackSessionBooking(sessionId, sessionType, coachId) {
    try {
      logEvent(analytics, 'booking_created', {
        session_id: sessionId,
        session_type: sessionType,
        coach_id: coachId,
        booking_date: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error tracking session booking:', error);
    }
  },

  // Track add-on purchase
  trackAddOnPurchase(addOnId, addOnTitle, amount) {
    try {
      logEvent(analytics, 'purchase', {
        transaction_id: `addon_${Date.now()}`,
        value: amount,
        currency: 'USD',
        items: [{
          item_id: addOnId,
          item_name: addOnTitle,
          price: amount,
          quantity: 1,
          item_category: 'add_on'
        }]
      });
    } catch (error) {
      console.error('Error tracking add-on purchase:', error);
    }
  },

  // Track user engagement
  trackUserEngagement(action, details = {}) {
    try {
      logEvent(analytics, 'user_engagement', {
        engagement_time_msec: 1000,
        action: action,
        ...details
      });
    } catch (error) {
      console.error('Error tracking user engagement:', error);
    }
  },

  // Track error events
  trackError(errorType, errorMessage, errorContext = {}) {
    try {
      logEvent(analytics, 'exception', {
        description: errorMessage,
        fatal: false,
        error_type: errorType,
        ...errorContext
      });
    } catch (error) {
      console.error('Error tracking error event:', error);
    }
  },

  // Track conversion funnel
  trackConversionFunnel(step, stepNumber, totalSteps, stepData = {}) {
    try {
      logEvent(analytics, 'conversion_funnel', {
        funnel_name: 'package_purchase',
        step_name: step,
        step_number: stepNumber,
        total_steps: totalSteps,
        ...stepData
      });
    } catch (error) {
      console.error('Error tracking conversion funnel:', error);
    }
  },

  // Track coach interactions
  trackCoachInteraction(coachId, interactionType, sessionId = null) {
    try {
      logEvent(analytics, 'coach_interaction', {
        coach_id: coachId,
        interaction_type: interactionType,
        session_id: sessionId,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error tracking coach interaction:', error);
    }
  },

  // Track parent-child interactions
  trackParentChildInteraction(parentId, childId, action, details = {}) {
    try {
      logEvent(analytics, 'parent_child_interaction', {
        parent_id: parentId,
        child_id: childId,
        action: action,
        ...details
      });
    } catch (error) {
      console.error('Error tracking parent-child interaction:', error);
    }
  },

  // Track SMS interactions
  trackSMSInteraction(phoneNumber, messageType, response = null) {
    try {
      logEvent(analytics, 'sms_interaction', {
        phone_number: phoneNumber ? phoneNumber.slice(-4) : 'unknown', // Only last 4 digits for privacy
        message_type: messageType,
        response: response,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error tracking SMS interaction:', error);
    }
  },

  // Track token usage
  trackTokenUsage(tokenType, quantity, action, context = {}) {
    try {
      logEvent(analytics, 'token_usage', {
        token_type: tokenType,
        quantity: quantity,
        action: action,
        ...context
      });
    } catch (error) {
      console.error('Error tracking token usage:', error);
    }
  },

  // Track search events
  trackSearch(searchTerm, resultsCount, searchType = 'general') {
    try {
      logEvent(analytics, 'search', {
        search_term: searchTerm,
        results_count: resultsCount,
        search_type: searchType
      });
    } catch (error) {
      console.error('Error tracking search:', error);
    }
  },

  // Track file uploads
  trackFileUpload(fileType, fileSize, uploadType, context = {}) {
    try {
      logEvent(analytics, 'file_upload', {
        file_type: fileType,
        file_size: fileSize,
        upload_type: uploadType,
        ...context
      });
    } catch (error) {
      console.error('Error tracking file upload:', error);
    }
  },

  // Track performance metrics
  trackPerformance(metricName, value, unit = 'ms') {
    try {
      logEvent(analytics, 'performance', {
        metric_name: metricName,
        value: value,
        unit: unit
      });
    } catch (error) {
      console.error('Error tracking performance:', error);
    }
  }
};

// Custom event tracking for specific business logic
export const customAnalytics = {
  // Track package builder usage
  trackPackageBuilderStep(step, packageType, addOns = []) {
    analyticsService.trackConversionFunnel(step, 1, 3, {
      package_type: packageType,
      add_ons_count: addOns.length,
      add_ons: addOns.map(addOn => addOn.id)
    });
  },

  // Track successful package completion
  trackPackageCompletion(packageId, totalValue, addOns = []) {
    analyticsService.trackUserEngagement('package_completed', {
      package_id: packageId,
      total_value: totalValue,
      add_ons_count: addOns.length
    });
  },

  // Track session attendance
  trackSessionAttendance(sessionId, sessionType, attendanceStatus) {
    analyticsService.trackUserEngagement('session_attended', {
      session_id: sessionId,
      session_type: sessionType,
      attendance_status: attendanceStatus
    });
  },

  // Track coach performance
  trackCoachPerformance(coachId, metric, value) {
    analyticsService.trackUserEngagement('coach_performance', {
      coach_id: coachId,
      metric: metric,
      value: value
    });
  },

  // Track system health
  trackSystemHealth(component, status, details = {}) {
    analyticsService.trackError('system_health', `${component}: ${status}`, details);
  }
};

// Performance monitoring
export const performanceMonitoring = {
  // Track page load time
  trackPageLoadTime() {
    const navigation = performance.getEntriesByType('navigation')[0];
    if (navigation) {
      analyticsService.trackPerformance('page_load_time', navigation.loadEventEnd - navigation.loadEventStart);
    }
  },

  // Track API response time
  trackAPIResponseTime(endpoint, responseTime) {
    analyticsService.trackPerformance('api_response_time', responseTime, 'ms', {
      endpoint: endpoint
    });
  },

  // Track user interaction time
  trackInteractionTime(action, startTime) {
    const interactionTime = Date.now() - startTime;
    analyticsService.trackPerformance('interaction_time', interactionTime, 'ms', {
      action: action
    });
  }
};
