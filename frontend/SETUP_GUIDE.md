# RYP Golf Academy - Setup Guide

## 🔧 Environment Configuration

### Step 1: Create Environment File
```bash
# Copy the example to create your .env file
cp .env.example .env
```

### Step 2: Configure Stripe
1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Navigate to **Developers** → **API keys**
3. Copy your **Publishable key** (starts with `pk_test_`)
4. Update your `.env` file:
```bash
REACT_APP_STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
```

### Step 3: Firebase Configuration
The Firebase configuration is already set up in the example. Your `.env` file should contain:
```bash
# Firebase Configuration
REACT_APP_FIREBASE_API_KEY=AIzaSyBYN65VIPbVQKadhWRelcrDYan1t_Drkcc
REACT_APP_FIREBASE_AUTH_DOMAIN=rypacad.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=rypacad
REACT_APP_FIREBASE_STORAGE_BUCKET=rypacad.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=297400448648
REACT_APP_FIREBASE_APP_ID=1:297400448648:web:b1c96e2dab30108faf513d
REACT_APP_FIREBASE_MEASUREMENT_ID=G-8LQHBFFL7Q
```

## 🚀 Getting Started

### Development
```bash
# Install dependencies (if not already done)
npm install

# Start development server
npm start
```

### Production Deployment
```bash
# Build for production
npm run build

# Deploy to Firebase
npm run deploy
```

## 🔑 Key Features

### ✅ Token Management System
- Track session tokens for each user
- Prevent overbooking
- Token history and audit trail

### ✅ Parent-Child Account Linking
- Parents can manage children's accounts
- Fund children's accounts
- Purchase packages for children
- Schedule sessions for children

### ✅ Stripe Payment Integration
- Secure payment processing
- Package and add-on purchases
- Parent funding system

### ✅ Firebase Backend
- User authentication
- Real-time database
- File storage
- Analytics

## 📱 Available Routes

- `/` - Redirects to dashboard
- `/login` - User login
- `/dashboard` - Main dashboard
- `/parent` - Parent dashboard (if user has children)
- `/programs` - Available programs
- `/package-builder` - Build custom packages
- `/booking` - Book sessions
- `/admin` - Admin dashboard (admin only)
- `/coach` - Coach dashboard (coach only)

## 🔒 Security Notes

- Never commit `.env` file to git
- Stripe secret keys should only be used in backend
- Firebase config is safe to expose (public keys only)
- All sensitive operations are handled server-side

## 🧪 Testing

### Stripe Test Cards
- `4242 4242 4242 4242` - Successful payment
- `4000 0000 0000 0002` - Declined payment
- `4000 0000 0000 9995` - Insufficient funds

### Firebase Testing
- Use test mode for development
- Switch to production when ready
- Monitor Firebase console for errors

## 📞 Support

For technical issues or questions:
1. Check Firebase console for errors
2. Check Stripe dashboard for payment issues
3. Review browser console for frontend errors
4. Contact development team for assistance
