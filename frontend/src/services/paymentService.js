import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe
const stripePromise = loadStripe(process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY);

// Payment Service
export const paymentService = {
  // Initialize Stripe
  async getStripe() {
    return await stripePromise;
  },

  // Create payment intent
  async createPaymentIntent(paymentData) {
    try {
      // This would call your Firebase Function
      const response = await fetch('/api/enrollments/create-payment-intent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result.clientSecret;
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw error;
    }
  },

  // Process payment
  async processPayment(paymentData) {
    try {
      const stripe = await this.getStripe();
      
      // Create payment intent
      const clientSecret = await this.createPaymentIntent(paymentData);
      
      // Confirm payment
      const result = await stripe.confirmCardPayment(clientSecret, {
        payment_method: {
          card: paymentData.card,
          billing_details: {
            name: paymentData.customerName,
            email: paymentData.customerEmail,
          },
        },
      });

      if (result.error) {
        throw new Error(result.error.message);
      }

      return {
        success: true,
        paymentIntent: result.paymentIntent,
        transactionId: result.paymentIntent.id,
      };
    } catch (error) {
      console.error('Payment processing error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  // Create subscription
  async createSubscription(customerId, priceId) {
    try {
      const response = await fetch('/api/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId,
          priceId,
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result.subscription;
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  },

  // Get payment history
  async getPaymentHistory(customerId) {
    try {
      const response = await fetch(`/api/payment-history/${customerId}`);
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result.payments;
    } catch (error) {
      console.error('Error fetching payment history:', error);
      throw error;
    }
  },

  // Process refund
  async processRefund(paymentIntentId, amount) {
    try {
      const response = await fetch('/api/process-refund', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paymentIntentId,
          amount,
        }),
      });

      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error);
      }

      return result.refund;
    } catch (error) {
      console.error('Error processing refund:', error);
      throw error;
    }
  },
};

// Payment Utilities
export const paymentUtils = {
  // Validate card number
  validateCardNumber(cardNumber) {
    const cleanNumber = cardNumber.replace(/\s/g, '');
    return cleanNumber.length >= 13 && cleanNumber.length <= 19;
  },

  // Format card number
  formatCardNumber(cardNumber) {
    const cleanNumber = cardNumber.replace(/\s/g, '');
    const groups = cleanNumber.match(/.{1,4}/g);
    return groups ? groups.join(' ') : cleanNumber;
  },

  // Validate expiry date
  validateExpiryDate(month, year) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    const expMonth = parseInt(month);
    const expYear = parseInt(year);
    
    if (expYear < currentYear) return false;
    if (expYear === currentYear && expMonth < currentMonth) return false;
    if (expMonth < 1 || expMonth > 12) return false;
    
    return true;
  },

  // Validate CVC
  validateCVC(cvc) {
    const cleanCVC = cvc.replace(/\s/g, '');
    return cleanCVC.length >= 3 && cleanCVC.length <= 4;
  },
};

// Pricing Utilities
export const pricingUtils = {
  // Calculate package total
  calculatePackageTotal(pkg, addOns = []) {
    let total = pkg.price || 0;
    
    addOns.forEach(addOn => {
      total += addOn.standalonePrice || 0;
    });
    
    return total;
  },

  // Calculate discount
  calculateDiscount(pkg, addOns = []) {
    if (addOns.length === 0) return 0;
    
    let discountPercentage = 20; // 20% for 1 add-on
    
    const hasFitness = addOns.some(addOn => 
      addOn.id.startsWith('ryp-academy-')
    );
    const hasMental = addOns.some(addOn => 
      addOn.id.startsWith('mental-') || addOn.id.startsWith('tournament-prep')
    );
    
    if (hasFitness && hasMental) {
      discountPercentage = 30; // 30% for both
    }

    const addOnsTotal = addOns.reduce((sum, addOn) => sum + (addOn.standalonePrice || 0), 0);
    return (addOnsTotal * discountPercentage) / 100;
  },

  // Calculate final total
  calculateFinalTotal(pkg, addOns = []) {
    const subtotal = this.calculatePackageTotal(pkg, addOns);
    const discount = this.calculateDiscount(pkg, addOns);
    return subtotal - discount;
  },

  // Format currency
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  },
};
