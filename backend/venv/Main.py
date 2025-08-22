import os
from flask import Flask, jsonify, request
import firebase_admin
from firebase_admin import credentials, firestore, auth
import stripe

# --- INITIALIZATION ---

# Load environment variables (Stripe key)
from dotenv import load_dotenv
load_dotenv()

# Initialize Flask App
app = Flask(__name__)

# Initialize Firebase
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
db = firestore.client()

# Initialize Stripe
stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
stripe_webhook_secret = os.getenv("STRIPE_WEBHOOK_SECRET")


# --- API ENDPOINTS ---

@app.route("/api/users/auth", methods=['POST'])
def handle_user_auth():
    """Verifies a user's Google Sign-In token and creates a profile if it doesn't exist."""
    try:
        id_token = request.json['token']
        decoded_token = auth.verify_id_token(id_token)
        uid = decoded_token['uid']
        
        user_ref = db.collection('users').document(uid)
        if not user_ref.get().exists:
            # New user, create a profile
            user_data = {
                'email': decoded_token.get('email'),
                'displayName': decoded_token.get('name'),
                'role': 'student' # Default role
            }
            user_ref.set(user_data)
        
        user_profile = user_ref.get().to_dict()
        return jsonify(user_profile), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/programs", methods=['GET'])
def get_programs():
    """Returns a list of all active programs."""
    # In a real app, you'd add filtering for `isActive == true`
    programs_ref = db.collection('programs').stream()
    programs = [doc.to_dict() for doc in programs_ref]
    return jsonify(programs), 200


@app.route("/api/enrollments/create-payment-intent", methods=['POST'])
def create_payment_intent():
    """Creates a secure Stripe Payment Intent."""
    try:
        data = request.get_json()
        program_ref = db.collection('programs').document(data['programId']).get()
        if not program_ref.exists:
            return jsonify({"error": "Program not found"}), 404
        
        program_price = program_ref.to_dict()['price'] # Price in cents

        intent = stripe.PaymentIntent.create(
            amount=program_price,
            currency='usd',
            automatic_payment_methods={'enabled': True},
        )
        return jsonify({'client_secret': intent.client_secret}), 200
    except Exception as e:
        return jsonify(error=str(e)), 403


@app.route("/api/stripe-webhook", methods=['POST'])
def stripe_webhook():
    """Listens for successful payment events from Stripe to create enrollments."""
    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, stripe_webhook_secret
        )
    except ValueError as e: # Invalid payload
        return 'Invalid payload', 400
    except stripe.error.SignatureVerificationError as e: # Invalid signature
        return 'Invalid signature', 400

    # Handle the event
    if event['type'] == 'payment_intent.succeeded':
        payment_intent = event['data']['object']
        # --- ADD LOGIC HERE to find the user and program from metadata ---
        # --- and create the final `enrollment` document in Firestore. ---
        print(f"Payment for {payment_intent['amount']} succeeded!")

    return 'Success', 200

# Add other endpoints for Arena, Plans, etc. following this structure.