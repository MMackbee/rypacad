rules_version = '2';

/**
 * Security rules for the 26/27 portal. Replaces the 2025 rules, which were
 * written for a data model that no longer exists (userTokens, families) and
 * which let any authenticated user write any session document.
 *
 * The governing idea: reads are scoped, writes are almost entirely denied.
 * Booking touches three documents atomically and enforces entitlements, so it
 * runs in a Cloud Function under the admin SDK, which bypasses these rules.
 * Denying the client path here is what makes that transaction the only path.
 *
 * Roles come from custom claims set server-side, never from a user document a
 * client could edit.
 *
 * NOT YET LIVE — review before replacing firestore.rules. Rules are the security
 * boundary; they should be read by a person, not swapped in silently.
 */
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }
    function role() {
      return request.auth.token.role;
    }
    function isStaff() {
      return signedIn() && role() in ['coach', 'mentalCoach', 'opsAdmin', 'owner'];
    }
    function isOwner() {
      return signedIn() && role() == 'owner';
    }
    /** Guardian linked to this athlete, or the athlete themselves. */
    function ownsAthlete(athleteId) {
      let a = get(/databases/$(database)/documents/athletes/$(athleteId)).data;
      return signedIn() && (a.userId == request.auth.uid || request.auth.uid in a.guardianIds);
    }

    // --- Athletes ----------------------------------------------------------
    // Coaches see only their assigned athletes. A parent must never be able to
    // read another family's record by guessing an ID.
    match /athletes/{athleteId} {
      allow read: if ownsAthlete(athleteId)
                  || isOwner()
                  || (signedIn() && role() == 'opsAdmin')
                  || (signedIn() && role() == 'coach'
                      && request.auth.uid in resource.data.coachIds);
      allow write: if false;   // enrollment and edits go through functions
    }

    // --- Sessions ----------------------------------------------------------
    // Readable by anyone signed in — the schedule is not secret. Writable by
    // nobody: bookedCount is derived, and a client that can edit it can
    // manufacture capacity.
    match /sessions/{sessionId} {
      allow read: if signedIn();
      allow write: if false;
    }

    // --- Bookings ----------------------------------------------------------
    match /bookings/{bookingId} {
      allow read: if ownsAthlete(resource.data.athleteId)
                  || isStaff();
      allow write: if false;   // bookSession / cancelBooking only
    }

    // --- Allowances --------------------------------------------------------
    // The entitlement ledger. Read-only to the family it belongs to; a client
    // that can write this can grant itself sessions.
    match /allowances/{allowanceId} {
      allow read: if signedIn()
                  && (ownsAthlete(resource.data.athleteId) || isStaff());
      allow write: if false;
    }

    // --- Diagnostics, practice, contracts ----------------------------------
    match /diagnostics/{docId} {
      allow read: if ownsAthlete(resource.data.athleteId) || isStaff();
      allow write: if false;   // staff-entered via function, audit-logged
    }
    match /commitmentContracts/{docId} {
      allow read: if ownsAthlete(resource.data.athleteId) || isStaff();
      allow write: if false;
    }
    match /fitnessLogs/{docId} {
      allow read: if ownsAthlete(resource.data.athleteId) || isStaff();
      // The one athlete-writable collection: logging your own minutes. Bounded
      // so it cannot be used as free storage, and it cannot name another athlete.
      allow create: if ownsAthlete(request.resource.data.athleteId)
                    && request.resource.data.minutes is int
                    && request.resource.data.minutes > 0
                    && request.resource.data.minutes <= 240;
      allow update, delete: if false;
    }

    // --- Billing -----------------------------------------------------------
    // Stripe IDs and invoice history. Never raw card data — that stays with
    // Stripe and is why this collection is safe to expose read-only at all.
    match /billing/{athleteId} {
      allow read: if ownsAthlete(athleteId) || isOwner()
                  || (signedIn() && role() == 'opsAdmin');
      allow write: if false;   // Stripe webhooks only
    }

    // --- Mental game -------------------------------------------------------
    // Yannick's notes and, later, chatbot transcripts. The broadest-access role
    // in the system and the most sensitive data in it, so: no parent read at
    // all. Parents get summaries through a function, never the raw documents.
    match /mentalGame/{docId} {
      allow read: if signedIn() && role() in ['mentalCoach', 'owner'];
      allow write: if false;
    }

    // --- Staff and audit ---------------------------------------------------
    match /staff/{staffId} {
      allow read: if isStaff();
      allow write: if false;   // role changes are a function + audit entry
    }
    match /auditLogs/{logId} {
      allow read: if isOwner();
      allow write: if false;   // append-only, server-side
    }

    // --- Newsletter --------------------------------------------------------
    match /newsletterIssues/{issueId} {
      allow read: if signedIn();
      allow write: if false;
    }

    // Anything not named above is denied. New collections must be added here
    // deliberately rather than inheriting a permissive default.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
