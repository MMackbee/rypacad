/**
 * Manage billing in Stripe: which buttons the payer gets (review 2026-11-17
 * F2/F3). The server (functions/portal/billing-portal-customer.js) opens the
 * household's one Stripe customer, or - when it holds several - the one an
 * athleteId names, and refuses 'several-customers' without one. This counts
 * the same customers from what the Billing hub already reads: the
 * household's stripeCustomerId and stripeCustomerIds, and each member's own
 * (customerIdsOf, on every hub member).
 *
 *   none     []                                no button: nothing paid yet
 *   one      [{ athleteId: null, names: [] }]  one button for the family
 *   several  one target per customer an athlete holds, naming its athletes
 *            and carrying the first one's id (a customer only on the
 *            household gets no button; with none on an athlete, the one
 *            family button, which the server answers in contact-the-academy
 *            words)
 */
const idOf = (value) => (typeof value === 'string' ? value.trim() : '');
/** 'Jordan' from 'Jordan Whitfield' (as data/staffCancel.js firstOf, without its imports). */
const firstOf = (name) => String(name ?? '').trim().split(/\s+/)[0] || null;

/** An athlete's own Stripe customers: its membership's, then its facility add-on's - the order the server picks in. */
export function customerIdsOf(athlete) {
  const out = [];
  for (const value of [athlete?.billing?.customerId, athlete?.facilityBilling?.customerId]) {
    const id = idOf(value);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** The Manage billing buttons for this household (the header's table). */
export function portalTargets(household, members) {
  const all = new Set();
  const add = (value) => {
    const id = idOf(value);
    if (id) all.add(id);
  };
  add(household?.stripeCustomerId);
  (Array.isArray(household?.stripeCustomerIds) ? household.stripeCustomerIds : []).forEach(add);
  const groups = new Map();
  for (const m of members ?? []) {
    const ids = (Array.isArray(m?.customerIds) ? m.customerIds : []).map(idOf).filter(Boolean);
    ids.forEach((id) => all.add(id));
    if (!ids.length) continue;
    const group = groups.get(ids[0]) ?? { athleteId: m.athleteId, names: [] };
    group.names.push(m.name);
    groups.set(ids[0], group);
  }
  if (all.size === 0) return [];
  if (all.size === 1 || groups.size === 0) return [{ athleteId: null, names: [] }];
  return [...groups.values()];
}

/** "Manage billing in Stripe", or "Manage billing in Stripe for Ava and Ben" on a per-customer button. */
export function targetLabel(label, target) {
  const names = (target?.names ?? []).map(firstOf).filter(Boolean);
  if (!target?.athleteId || !names.length) return label;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${label} for ${list}`;
}
