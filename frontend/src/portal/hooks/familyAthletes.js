import { useEffect, useState } from 'react';
import { fetchHouseholdAthletes, isLive } from './live';

/**
 * A family's athlete docs, read once, for Registration's link mode: a linked
 * athlete joins a family that may already hold a membership (the sibling
 * discount, checkout.js siblingEligible) or facility access (the family
 * add-on, data/facility.js). null until the read lands, in seed mode, and
 * for good when it fails - callers then decide from the form alone, so what
 * they show may be missing, never wrong.
 */
export default function useFamilyAthletes(householdId, enabled) {
  const [athletes, setAthletes] = useState(null);
  useEffect(() => {
    if (!enabled || !householdId || !isLive()) return undefined;
    let alive = true;
    fetchHouseholdAthletes(householdId).then((list) => { if (alive) setAthletes(list); }, () => {});
    return () => { alive = false; };
  }, [householdId, enabled]);
  return athletes;
}
