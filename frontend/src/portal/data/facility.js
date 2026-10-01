/**
 * Family facility access (owner ruling 2026-09-30) - PURE. The $300/month
 * add-on is ONE per household and covers every athlete in it; a live Elite
 * membership covers the household too. Billing stays on one athlete, the
 * holder (`facilityBilling`, server-written), so every surface asks here
 * whether the FAMILY has access instead of reading one athlete's flags.
 * Kept in step by hand with functions/portal/facility.js householdFacility.
 */
import { packageById } from './packages';

const live = (status) => status === 'active' || status === 'past_due';

/** One athlete's facts, from an athlete doc (`id`, `packageId`, `facilityBilling`) or a billing-hub member (`athleteId`, `package`, `billing.facility`). Absent `billing` == active. */
function facts(a) {
  return {
    id: a.athleteId ?? a.id ?? null,
    kind: a.package?.kind ?? packageById(a.package?.id ?? a.packageId)?.kind ?? null,
    tier: a.billing?.status ?? 'active',
    facility: a.facilityBilling?.status ?? a.billing?.facility ?? null,
    granted: a.facilityAccess === true,
  };
}

/**
 * Whether a household has facility access, and why.
 *   elite   - an athlete on Elite whose membership is live (active or past_due)
 *   add-on  - an athlete whose add-on subscription is live, or whose
 *             `facilityAccess` the academy switched on itself (the staff
 *             membership editor; no subscription behind it)
 * @param {Array} athletes  The household's athlete docs or hub members.
 * @return {{ access: boolean, source: 'elite'|'add-on'|null, holderId: ?string, eliteId: ?string, eliteDueId: ?string }}
 *   Elite wins as the source when both are true; `holderId` is the athlete
 *   the add-on sits on either way. `eliteDueId` is an Elite athlete still to
 *   pay: no access yet, but the add-on is not sold to a family about to
 *   have it (review 2026-09-30) - no offer, no Pay row.
 */
export function householdFacility(athletes) {
  const list = (athletes || []).filter(Boolean).map(facts);
  const holder = list.find((a) => live(a.facility)) ?? list.find((a) => a.granted) ?? null;
  const elite = list.find((a) => a.kind === 'elite' && live(a.tier)) ?? null;
  const due = list.find((a) => a.kind === 'elite' && a.tier === 'pending') ?? null;
  return {
    access: Boolean(holder || elite),
    source: elite ? 'elite' : holder ? 'add-on' : null,
    holderId: holder ? holder.id : null,
    eliteId: elite ? elite.id : null,
    eliteDueId: due ? due.id : null,
  };
}

/** How a per-athlete line names where the access comes from: 'Elite' or 'family add-on' ('add-on' for the adult who is their own household); null without access. */
export function facilitySourceLabel(family, self = false) {
  if (!family || !family.access) return null;
  if (family.source === 'elite') return 'Elite';
  return self ? 'add-on' : 'family add-on';
}
