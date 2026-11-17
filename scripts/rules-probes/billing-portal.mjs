/**
 * "Manage billing in Stripe" (2026-11-17; docs/portal/plans/2026-11-17-billing-portal/00-note.md).
 * billingPortalLimits/{uid} is openBillingPortal's rate limit (functions/portal/billing-portal.js),
 * Admin SDK only. No client reads, lists, creates, updates or deletes it - not the caller on its OWN doc
 * (it could reset its limit), not ops, not the owner, not a signed-out caller. No answer depends on the
 * Oct 10 gate. Run by scripts/verify-rules.mjs in both passes; it seeds and removes everything it touches.
 */
import { fsFields } from '../lib/firestore-rest.mjs';
import { BASE, call, commitAs, del, expect, listAs, seed, t, token, uid } from '../verify-rules.mjs';

const COL = 'billingPortalLimits';
const ownerUid = 'owner-bp-probe';
// `BASE` and `uid` are verify-rules.mjs's, still loading when this module's top level runs: functions, not constants.
const nameOf = (id) => `${BASE.split('/v1/')[1]}/${COL}/${id}`;
const getAs = async (auth, id) => (await call('GET', `/${COL}/${id}`, null, auth)).status;
const setAs = (auth, id, fields) => commitAs(auth, [{ update: { name: nameOf(id), fields: fsFields(fields) } }]);
const createAs = (auth, id, fields) => commitAs(auth, [{ update: { name: nameOf(id), fields: fsFields(fields) }, currentDocument: { exists: false } }]);
const deleteAs = (auth, id) => commitAs(auth, [{ delete: nameOf(id) }]);

export async function taskBillingPortal() {
  console.log('Billing portal: billingPortalLimits closed to every client, the caller on its own doc included');
  const owner = token(ownerUid, { email: 'owner-bp@example.com', email_verified: true });
  const opened = [1795000000000, 1795000060000];
  try {
    await seed('users', ownerUid, { role: 'owner' });
    await seed(COL, uid.parent, { openedAtMs: opened, updatedAtMs: opened[1] });
    expect('parent: read of its own doc refused', await getAs(t.parent, uid.parent), 403);
    expect('parent: list refused', await listAs(t.parent, COL, {}), 403);
    expect('parent: reset of its own limit refused', await setAs(t.parent, uid.parent, { openedAtMs: [], updatedAtMs: 0 }), 403);
    expect('parent: delete of its own doc refused', await deleteAs(t.parent, uid.parent), 403);
    expect('athlete login: create of its own doc refused', await createAs(t.athlete, uid.athlete, { openedAtMs: [], updatedAtMs: 0 }), 403);
    expect("a parent in another household: read refused", await getAs(t.other, uid.parent), 403);
    expect('ops: read refused', await getAs(t.ops, uid.parent), 403);
    expect('ops: write refused', await setAs(t.ops, uid.parent, { openedAtMs: [] }), 403);
    expect('owner: read refused', await getAs(owner, uid.parent), 403);
    expect('owner: list refused', await listAs(owner, COL, {}), 403);
    expect('owner: delete refused', await deleteAs(owner, uid.parent), 403);
    const anon = await fetch(`${BASE}/${COL}/${uid.parent}`);
    await anon.text().catch(() => null);
    expect('signed out: read refused', anon.status, 403);
    expect('the doc is untouched', (await call('GET', `/${COL}/${uid.parent}`, null, 'owner')).body?.fields?.openedAtMs?.arrayValue?.values?.length, 2);
    expect('and no doc was created for the athlete login', (await call('GET', `/${COL}/${uid.athlete}`, null, 'owner')).status, 404);
  } finally {
    for (const id of [uid.parent, uid.athlete]) await del(COL, id);
    await del('users', ownerUid);
  }
}
