import { ELITE, TOKEN_PACKAGES } from './packages';

/**
 * Changing the package before the first payment (tester S4, 2026-09-30: a
 * family that picked Elite by mistake had no way back but to pay for it).
 *
 * The packages a family may switch to: the monthly ones only. The single
 * token is a one-time purchase and never a switch target, even once it is on
 * sale. firestore.rules' pendingPackageUpdateOk() holds the same list.
 */
export const CHANGEABLE_PACKAGES = [...TOKEN_PACKAGES, ELITE];
export const CHANGEABLE_PACKAGE_IDS = CHANGEABLE_PACKAGES.map((p) => p.id);

/**
 * Only a never-paid athlete: 'pending'. Active and past_due have a Stripe
 * subscription (the customer portal changes those), and a lapsed athlete
 * re-subscribes at the package it had.
 */
export function canChangePackage(billingStatus) {
  return billingStatus === 'pending';
}

/** The sheet's copy for a refused save; the adapter's own message is for logs. */
export function changePackageError(err) {
  if (err && err.code === 'permission-denied') {
    return "This package can't be changed any more. If you've just paid, it's already set - refresh the page to see it.";
  }
  return "The package wasn't changed. Check your connection and try again.";
}
