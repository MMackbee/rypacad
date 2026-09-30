/**
 * `change(athleteId, packageId)` - a family's own package switch before the
 * first payment (tester S4, 2026-09-30). Kept out of the grandfathered
 * hooks/index.js; live.js's changePendingPackage does the one updateDoc +
 * bump('athletes'), which re-reads the billing hub and the family cards, so
 * the pending card and the child card show the new package. Seed mode is a
 * local echo, same discipline as useAssignPackages.
 */
import { changePendingPackage, isLive } from './live';

export function useChangePackage() {
  const live = isLive();
  const change = async (athleteId, packageId) => {
    if (!live) return { athleteId, packageId, simulated: true };
    return changePendingPackage(athleteId, packageId);
  };
  return { change };
}
