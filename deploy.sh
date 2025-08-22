#!/bin/bash

# RYP Golf Academy - Deployment Script
# This script automates the deployment of the entire system

set -e  # Exit on any error

echo "🚀 Starting RYP Golf Academy deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Firebase CLI is installed
check_firebase_cli() {
    if ! command -v firebase &> /dev/null; then
        print_error "Firebase CLI is not installed. Please install it first:"
        echo "npm install -g firebase-tools"
        exit 1
    fi
    print_success "Firebase CLI is installed"
}

# Check if user is logged in to Firebase
check_firebase_auth() {
    if ! firebase projects:list &> /dev/null; then
        print_error "Not logged in to Firebase. Please run:"
        echo "firebase login"
        exit 1
    fi
    print_success "Firebase authentication verified"
}

# Deploy Firebase Functions
deploy_functions() {
    print_status "Deploying Firebase Functions..."
    
    cd functions
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing function dependencies..."
        npm install
    fi
    
    # Deploy functions
    firebase deploy --only functions
    
    cd ..
    print_success "Firebase Functions deployed successfully"
}

# Deploy Firestore rules
deploy_firestore_rules() {
    print_status "Deploying Firestore security rules..."
    firebase deploy --only firestore:rules
    print_success "Firestore rules deployed successfully"
}

# Deploy Storage rules
deploy_storage_rules() {
    print_status "Deploying Storage security rules..."
    firebase deploy --only storage
    print_success "Storage rules deployed successfully"
}

# Build and deploy frontend
deploy_frontend() {
    print_status "Building and deploying frontend..."
    
    cd frontend
    
    # Install dependencies if needed
    if [ ! -d "node_modules" ]; then
        print_status "Installing frontend dependencies..."
        npm install
    fi
    
    # Build the application
    print_status "Building React application..."
    npm run build
    
    # Deploy to Firebase Hosting
    firebase deploy --only hosting
    
    cd ..
    print_success "Frontend deployed successfully"
}

# Set up environment variables
setup_environment() {
    print_status "Setting up environment variables..."
    
    # Check if .env file exists in frontend
    if [ ! -f "frontend/.env" ]; then
        print_warning "No .env file found in frontend directory"
        print_status "Please create frontend/.env with your configuration:"
        echo "cp frontend/.env.example frontend/.env"
        echo "Then edit the file with your actual API keys"
    else
        print_success "Frontend environment file found"
    fi
    
    # Check if .env file exists in functions
    if [ ! -f "functions/.env" ]; then
        print_warning "No .env file found in functions directory"
        print_status "Please create functions/.env with your configuration:"
        echo "cp functions/env.template functions/.env"
        echo "Then edit the file with your actual API keys"
    else
        print_success "Functions environment file found"
    fi
}

# Validate configuration
validate_config() {
    print_status "Validating configuration..."
    
    # Check if firebase.json exists
    if [ ! -f "firebase.json" ]; then
        print_error "firebase.json not found. Please run firebase init first."
        exit 1
    fi
    
    # Check if .firebaserc exists
    if [ ! -f ".firebaserc" ]; then
        print_error ".firebaserc not found. Please run firebase init first."
        exit 1
    fi
    
    print_success "Configuration validated"
}

# Run tests (if available)
run_tests() {
    print_status "Running tests..."
    
    cd frontend
    
    if npm run test -- --watchAll=false --passWithNoTests &> /dev/null; then
        print_success "Frontend tests passed"
    else
        print_warning "Frontend tests failed or not configured"
    fi
    
    cd ..
}

# Show deployment summary
show_summary() {
    echo ""
    echo "🎉 Deployment Summary:"
    echo "======================"
    echo "✅ Firebase Functions: Deployed"
    echo "✅ Firestore Rules: Deployed"
    echo "✅ Storage Rules: Deployed"
    echo "✅ Frontend: Deployed"
    echo ""
    echo "🌐 Your application should be available at:"
    echo "   https://rypacad.web.app"
    echo ""
    echo "📊 Firebase Console:"
    echo "   https://console.firebase.google.com/project/rypacad"
    echo ""
    echo "🔧 Next Steps:"
    echo "   1. Set up Stripe account and add API keys"
    echo "   2. Set up Twilio account and add credentials"
    echo "   3. Configure webhooks for Stripe and Twilio"
    echo "   4. Test all integrations"
    echo "   5. Monitor logs and analytics"
    echo ""
}

# Main deployment function
main() {
    echo "🏌️  RYP Golf Academy Deployment"
    echo "================================"
    echo ""
    
    # Pre-deployment checks
    check_firebase_cli
    check_firebase_auth
    validate_config
    setup_environment
    
    # Run tests
    run_tests
    
    # Deploy components
    deploy_functions
    deploy_firestore_rules
    deploy_storage_rules
    deploy_frontend
    
    # Show summary
    show_summary
}

# Handle command line arguments
case "${1:-}" in
    "functions")
        check_firebase_cli
        check_firebase_auth
        deploy_functions
        ;;
    "frontend")
        check_firebase_cli
        check_firebase_auth
        deploy_frontend
        ;;
    "rules")
        check_firebase_cli
        check_firebase_auth
        deploy_firestore_rules
        deploy_storage_rules
        ;;
    "test")
        run_tests
        ;;
    "validate")
        validate_config
        setup_environment
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  (no args)  Deploy everything"
        echo "  functions  Deploy only Firebase Functions"
        echo "  frontend   Deploy only frontend"
        echo "  rules      Deploy only security rules"
        echo "  test       Run tests"
        echo "  validate   Validate configuration"
        echo "  help       Show this help"
        ;;
    *)
        main
        ;;
esac
