# RYP Golf Academy - Complete Integration Setup Guide

## 🚀 **Overview**

This guide covers all the integrations needed to make your RYP Golf Academy system fully operational. We'll set up each service step-by-step.

## 📋 **Integration Checklist**

### **✅ Frontend (Complete)**
- [x] React app with token management
- [x] Parent-child account linking
- [x] Stripe payment UI components
- [x] Firebase authentication
- [x] Environment configuration

### **🔄 Backend (In Progress)**
- [x] Firebase Functions setup
- [x] Stripe payment processing
- [x] Twilio SMS integration
- [x] Token management API
- [x] Family account management

### **⏳ Remaining Integrations**
- [ ] Twilio account setup
- [ ] Stripe account setup
- [ ] Firebase Functions deployment
- [ ] Webhook configuration
- [ ] Testing and validation

---

## 🔥 **Firebase Functions Setup**

### **Step 1: Environment Configuration**
```bash
# In the functions directory
cd functions
cp env.template .env
```

### **Step 2: Set Environment Variables**
```bash
# Set Firebase Functions environment variables
firebase functions:config:set stripe.secret_key="sk_test_your_key"
firebase functions:config:set twilio.account_sid="your_sid"
firebase functions:config:set twilio.auth_token="your_token"
firebase functions:config:set twilio.phone_number="+1234567890"
```

### **Step 3: Deploy Functions**
```bash
# Deploy all functions
firebase deploy --only functions

# Or deploy specific functions
firebase deploy --only functions:createPaymentIntent
firebase deploy --only functions:sendSMS
```

---

## 💳 **Stripe Integration**

### **Step 1: Create Stripe Account**
1. Go to [stripe.com](https://stripe.com)
2. Sign up for a business account
3. Complete business verification
4. Add bank account for payouts

### **Step 2: Get API Keys**
1. Go to **Dashboard** → **Developers** → **API keys**
2. Copy your keys:
   - **Publishable key** (frontend): `pk_test_...`
   - **Secret key** (backend): `sk_test_...`

### **Step 3: Set Up Webhooks**
1. Go to **Developers** → **Webhooks**
2. Add endpoint: `https://your-region-your-project.cloudfunctions.net/stripeWebhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `invoice.payment_succeeded`
4. Copy webhook secret: `whsec_...`

### **Step 4: Configure Products**
1. Go to **Products** → **Add Product**
2. Create products for each package:
   - Youth Starter Package ($200)
   - Youth Developer Package ($380)
   - Youth Elite Package ($540)
   - Youth Champion Package ($680)
   - Adult packages (20% premium)

### **Step 5: Test Payments**
Use these test card numbers:
- `4242 4242 4242 4242` - Successful payment
- `4000 0000 0000 0002` - Declined payment
- `4000 0000 0000 9995` - Insufficient funds

---

## 📱 **Twilio SMS Integration**

### **Step 1: Create Twilio Account**
1. Go to [twilio.com](https://twilio.com)
2. Sign up for a free account
3. Verify your email and phone number

### **Step 2: Get Credentials**
1. Go to **Console** → **Account Info**
2. Copy your credentials:
   - **Account SID**: `AC...`
   - **Auth Token**: `...`

### **Step 3: Get Phone Number**
1. Go to **Phone Numbers** → **Manage** → **Buy a number**
2. Choose a number with SMS capabilities
3. Copy the phone number: `+1...`

### **Step 4: Configure Webhook**
1. Go to **Phone Numbers** → **Manage** → **Active numbers**
2. Click on your number
3. Set webhook URL: `https://your-region-your-project.cloudfunctions.net/handleSMSResponse`
4. Set HTTP method to POST

### **Step 5: Test SMS**
```bash
# Test sending SMS
curl -X POST https://your-region-your-project.cloudfunctions.net/sendSMS \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+1234567890",
    "message": "Test message from RYP Golf Academy",
    "type": "test"
  }'
```

---

## 🔧 **Firebase Configuration**

### **Step 1: Enable Services**
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `rypacad`
3. Enable these services:

#### **Authentication**
- Go to **Authentication** → **Sign-in method**
- Enable **Email/Password**
- Enable **Google** (for coaches)

#### **Firestore Database**
- Go to **Firestore Database**
- Create database in **production mode**
- Set up security rules

#### **Storage**
- Go to **Storage**
- Create bucket
- Set up security rules

#### **Functions**
- Go to **Functions**
- Enable billing (required for external API calls)

### **Step 2: Security Rules**

#### **Firestore Rules**
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can read/write their own data
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Token management
    match /userTokens/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Family relationships
    match /families/{familyId} {
      allow read, write: if request.auth != null && 
        (resource.data.parentId == request.auth.uid || 
         resource.data.childId == request.auth.uid);
    }
    
    // Bookings
    match /bookings/{bookingId} {
      allow read, write: if request.auth != null && 
        resource.data.userId == request.auth.uid;
    }
    
    // Admin access
    match /{document=**} {
      allow read, write: if request.auth != null && 
        request.auth.token.role == 'admin';
    }
  }
}
```

#### **Storage Rules**
```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        (request.auth.token.role == 'admin' || 
         request.auth.token.role == 'coach');
    }
  }
}
```

---

## 🧪 **Testing & Validation**

### **Step 1: Test Stripe Payments**
1. Use test card numbers
2. Verify payment intents are created
3. Check token balances are updated
4. Confirm SMS notifications are sent

### **Step 2: Test SMS Functionality**
1. Send test messages
2. Verify webhook responses
3. Test session confirmations/cancellations
4. Check SMS logs in database

### **Step 3: Test Token System**
1. Purchase packages
2. Verify tokens are added
3. Book sessions
4. Verify tokens are deducted
5. Check token history

### **Step 4: Test Parent-Child Linking**
1. Link parent to child
2. Fund child account
3. Purchase packages for child
4. Schedule sessions for child

---

## 📊 **Monitoring & Analytics**

### **Firebase Analytics**
1. Enable **Google Analytics**
2. Track user engagement
3. Monitor conversion rates
4. Analyze user behavior

### **Stripe Dashboard**
1. Monitor payment success rates
2. Track revenue
3. Handle disputes
4. Process refunds

### **Twilio Console**
1. Monitor SMS delivery
2. Track message costs
3. View webhook logs
4. Manage phone numbers

---

## 🔒 **Security Best Practices**

### **Environment Variables**
- Never commit `.env` files to git
- Use Firebase Functions config for secrets
- Rotate API keys regularly
- Use least privilege access

### **API Security**
- Validate all inputs
- Implement rate limiting
- Use HTTPS for all communications
- Monitor for suspicious activity

### **Data Protection**
- Encrypt sensitive data
- Implement proper access controls
- Regular security audits
- GDPR compliance (if applicable)

---

## 🚀 **Deployment Checklist**

### **Pre-Deployment**
- [ ] All API keys configured
- [ ] Webhooks set up
- [ ] Security rules implemented
- [ ] Test environment validated

### **Deployment**
- [ ] Deploy Firebase Functions
- [ ] Update frontend environment
- [ ] Configure production webhooks
- [ ] Switch to live API keys

### **Post-Deployment**
- [ ] Monitor error logs
- [ ] Test all functionality
- [ ] Verify payments work
- [ ] Check SMS delivery

---

## 📞 **Support & Troubleshooting**

### **Common Issues**
1. **Stripe payments failing**
   - Check API key configuration
   - Verify webhook endpoints
   - Test with valid card numbers

2. **SMS not sending**
   - Verify Twilio credentials
   - Check phone number format
   - Monitor webhook responses

3. **Functions not deploying**
   - Check billing is enabled
   - Verify environment variables
   - Review function logs

### **Getting Help**
- Firebase Console logs
- Stripe Dashboard
- Twilio Console
- Browser developer tools
- Function logs: `firebase functions:log`

---

## 🎯 **Next Steps**

1. **Set up Stripe account** and get API keys
2. **Create Twilio account** and get phone number
3. **Deploy Firebase Functions** with environment variables
4. **Test all integrations** thoroughly
5. **Go live** with production keys

Your system is now ready for full integration! 🎉
