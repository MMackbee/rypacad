# Firebase Setup Guide

## To fix the Google Sign-in issue, you need to configure Firebase properly:

### 1. Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select existing one
3. Enable Authentication → Google Sign-in

### 2. Get Your Firebase Config
1. Go to Project Settings (gear icon)
2. Scroll down to "Your apps"
3. Click "Add app" → Web app
4. Copy the config object

### 3. Create Environment File
Create a file called `.env.local` in the frontend directory with:

```
REACT_APP_FIREBASE_API_KEY=your_actual_api_key
REACT_APP_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=your_project_id
REACT_APP_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
REACT_APP_FIREBASE_APP_ID=your_app_id
```

### 4. Enable Google Authentication
1. In Firebase Console → Authentication
2. Click "Sign-in method"
3. Enable Google provider
4. Add your domain to authorized domains

### 5. Restart the App
After creating `.env.local`, restart the development server:
```bash
npm start
```

## Current Status
The app is running in "demo mode" with placeholder Firebase config, which is why sign-in doesn't work properly. 