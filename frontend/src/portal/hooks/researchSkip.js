/**
 * "Skip for now" on the one-time research confirm (assessments spec 7,
 * Review Focus 5): the question returns at the next sign-in. Signing out
 * does not reload the page (PortalRoutes navigates to /portal/signin), so a
 * skip kept until the page reloads outlived the session it was made in
 * (review 2026-10-28): useAuthSession clears every skip on each signed-out
 * emission. A module of its own, like assessorTab.js, so the screen tests
 * that mock useAuthSession keep a working store.
 */
const skipped = new Set();

/** The signed-in user chose "Skip for now". */
export function skipResearchConfirm(uid) {
  if (uid) skipped.add(uid);
}

/** Whether this user skipped the confirm in the current session. */
export function researchConfirmSkipped(uid) {
  return Boolean(uid) && skipped.has(uid);
}

/** The session ended: ask again at the next sign-in. */
export function clearResearchSkips() {
  skipped.clear();
}
