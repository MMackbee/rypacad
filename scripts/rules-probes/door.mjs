/**
 * The facility door button (owner "Lets build it", 2026-11-17; spec
 * docs/portal/plans/2026-11-17-door-button/00-spec.md section 6). Five
 * collections, all new:
 *   doorConfig/{id}       owner/ops read; owner/ops write 'main' only, shape-checked, stamped with
 *                         their own uid and request.time; no delete
 *   doorPauses/{hh}       owner/ops read, create (shape-checked, stamped) and delete; no update
 *   doorRules/{uid}       the signer and owner/ops read; no client write (signDoorRules writes)
 *   doorEvents/{id}       owner/ops read all; a parent its household's, an athlete login its own;
 *                         no client write (unlockDoor writes)
 *   doorLimits/{uid}      no client access at all
 * No answer depends on the Oct 10 gate. Run by scripts/verify-rules.mjs in both passes; it seeds
 * and removes everything it touches.
 */
import { fsFields } from '../lib/firestore-rest.mjs';
import { BASE, call, commitAs, del, expect, listAs, seed, t, token, uid } from '../verify-rules.mjs';

const ownerUid = 'owner-door-probe';
// A parent login whose household was never provisioned (householdId null): rules-4.
const noHouseholdUid = 'p-nohh-probe';
// `BASE` and `uid` are verify-rules.mjs's, still loading when this module's top level runs: functions, not constants.
const nameOf = (col, id) => `${BASE.split('/v1/')[1]}/${col}/${id}`;
const stamp = (fields) => fields.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
// A whole-document set (no precondition), the shape of the client's setDoc; `serverTime` fields get REQUEST_TIME.
const setAs = (auth, col, id, fields, serverTime) => commitAs(auth, [{ update: { name: nameOf(col, id), fields: fsFields(fields) }, updateTransforms: stamp(serverTime) }]);
const createAs = (auth, col, id, fields, serverTime) => commitAs(auth, [{ update: { name: nameOf(col, id), fields: fsFields(fields) },
  currentDocument: { exists: false }, updateTransforms: stamp(serverTime) }]);
const updateAs = (auth, col, id, fields) => commitAs(auth, [{ update: { name: nameOf(col, id), fields: fsFields(fields) },
  updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { exists: true } }]);
// The staff screen's write (review 2026-11-17 rules-1): setDoc(..., { merge: true }) - the given fields only, no precondition.
const mergeAs = (auth, col, id, fields, serverTime) => commitAs(auth, [{ update: { name: nameOf(col, id), fields: fsFields(fields) },
  updateMask: { fieldPaths: Object.keys(fields) }, updateTransforms: stamp(serverTime) }]);
const deleteAs = (auth, col, id) => commitAs(auth, [{ delete: nameOf(col, id) }]);
// A list where `field` is null (the SDK's where(field, '==', null) is a unary IS_NULL filter).
async function listNullAs(auth, col, fieldPath) {
  const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], where: { unaryFilter: { op: 'IS_NULL', field: { fieldPath } } } } }) });
  const body = await res.json().catch(() => null);
  const err = Array.isArray(body) ? body.find((r) => r && r.error)?.error : body?.error;
  return err ? err.code : res.status;
}
// doorConfig/main as stored, read past the rules: 'mode|lat|radiusM'.
const storedConfig = async () => {
  const f = (await call('GET', '/doorConfig/main', null, 'owner')).body?.fields || {};
  return [f.mode?.stringValue, f.lat?.doubleValue, f.radiusM?.integerValue].join('|');
};
const getAs = async (auth, col, id) => (await call('GET', `/${col}/${id}`, null, auth)).status;

const config = (over) => ({ mode: 'staff', lat: 44.9, lng: -93.4, radiusM: 200, openSeconds: 5, updatedByUid: uid.ops, ...over });
const setConfig = (auth, fields, id = 'main', serverTime = ['updatedAt']) => setAs(auth, 'doorConfig', id, fields, serverTime);
const pause = (householdId, over) => ({ householdId, pausedByUid: uid.ops, note: 'Card declined twice', ...over });
const EVENTS = () => ({
  'p-probe_press-0001': { uid: uid.parent, role: 'parent', householdId: 'hh', outcome: 'opened', atMs: 1795000000000 },
  'elite-probe_press-0002': { uid: uid.eliteLogin, role: 'athlete', householdId: 'hh', outcome: 'denied', reason: 'too-far', atMs: 1795000001000 },
  'p-other-probe_press-0003': { uid: uid.other, role: 'parent', householdId: 'hh-other', outcome: 'opened', atMs: 1795000002000 },
  'ops-probe_press-0004': { uid: uid.ops, role: 'ops', householdId: null, outcome: 'opened', atMs: 1795000003000 },
});
const signed = (u, householdId, role) => ({ uid: u, householdId, role, termsVersion: 'door-2026-11-17', name: 'Dana Hart', adult: true, signedAtMs: 1 });

export async function taskDoor() {
  console.log('Door button: doorConfig/doorPauses staff-only and shape-checked; doorRules and doorEvents read-only to their own; doorLimits closed');
  const owner = token(ownerUid, { email: 'owner-door@example.com', email_verified: true });
  const noHousehold = token(noHouseholdUid, { email: 'nohh@example.com', email_verified: true });
  try {
    await seed('users', ownerUid, { role: 'owner' });
    await seed('users', noHouseholdUid, { role: 'parent', householdId: null, athleteId: null });
    for (const [id, body] of Object.entries(EVENTS())) await seed('doorEvents', id, body);
    await seed('doorRules', uid.parent, signed(uid.parent, 'hh', 'parent'));
    await seed('doorRules', uid.other, signed(uid.other, 'hh-other', 'parent'));
    await seed('doorLimits', uid.parent, { callsAtMs: [1795000000000], opensAtMs: [1795000000000], lastOpenedAtMs: 1795000000000, updatedAtMs: 1795000000000 });

    // A family login writes no door collection, whatever it writes.
    expect('parent cannot set doorConfig/main', await setConfig(t.parent, config({ mode: 'all', updatedByUid: uid.parent })), 403);
    expect('parent cannot create a pause', await createAs(t.parent, 'doorPauses', 'hh', pause('hh', { pausedByUid: uid.parent }), ['pausedAt']), 403);
    expect('parent cannot sign its own doorRules from the client', await createAs(t.parent, 'doorRules', 'p-new-door', signed(uid.parent, 'hh', 'parent'), []), 403);
    expect('parent cannot overwrite its own doorRules', await updateAs(t.parent, 'doorRules', uid.parent, { termsVersion: 'door-2099-01-01' }), 403);
    // rules-3: a login with no doorRules doc creating one at its OWN uid (the parent's is seeded, so above is an update).
    expect('athlete login cannot create doorRules at its own uid', await createAs(t.eliteLogin, 'doorRules', uid.eliteLogin, signed(uid.eliteLogin, 'hh', 'athlete'), []), 403);
    expect('a parent with no household cannot create doorRules at its own uid', await createAs(noHousehold, 'doorRules', noHouseholdUid, signed(noHouseholdUid, null, 'parent'), []), 403);
    expect('parent cannot write a doorEvent', await createAs(t.parent, 'doorEvents', 'p-probe_press-9999', { uid: uid.parent, householdId: 'hh', outcome: 'opened' }, []), 403);
    expect('parent cannot reset its own doorLimits', await setAs(t.parent, 'doorLimits', uid.parent, { callsAtMs: [], opensAtMs: [] }, []), 403);
    expect('athlete login cannot set doorConfig/main', await setConfig(t.eliteLogin, config({ mode: 'all', updatedByUid: uid.eliteLogin })), 403);

    // doorConfig: owner/ops, 'main' only, every field in range, stamped with their own uid and the request time.
    expect('ops sets a valid doorConfig/main', await setConfig(t.ops, config()), 200);
    expect('owner sets a valid doorConfig/main', await setConfig(owner, config({ mode: 'all', radiusM: 300, openSeconds: 8, updatedByUid: ownerUid })), 200);
    // rules-1: the screen merges only what changed, stamped; the stored location and reach stay.
    expect('ops merges the mode alone over an existing main', await mergeAs(t.ops, 'doorConfig', 'main', { mode: 'off', updatedByUid: uid.ops }, ['updatedAt']), 200);
    expect('the merge kept the academy location and the reach', await storedConfig(), 'off|44.9|300');
    expect('owner merges the reach alone', await mergeAs(owner, 'doorConfig', 'main', { radiusM: 200, updatedByUid: ownerUid }, ['updatedAt']), 200);
    expect('ops refused a merge with no stamp', await mergeAs(t.ops, 'doorConfig', 'main', { mode: 'all' }, []), 403);
    expect('ops refused a merge with the time but the last writer\'s uid', await mergeAs(t.ops, 'doorConfig', 'main', { mode: 'all' }, ['updatedAt']), 403);
    expect('ops refused a merge naming the owner as writer', await mergeAs(t.ops, 'doorConfig', 'main', { mode: 'all', updatedByUid: ownerUid }, ['updatedAt']), 403);
    expect('ops refused a merge of a radius of 5000', await mergeAs(t.ops, 'doorConfig', 'main', { radiusM: 5000, updatedByUid: uid.ops }, ['updatedAt']), 403);
    expect('ops refused a merge of an extra field', await mergeAs(t.ops, 'doorConfig', 'main', { unlockUrl: 'x', updatedByUid: uid.ops }, ['updatedAt']), 403);
    expect('nothing refused was stored', await storedConfig(), 'off|44.9|200');
    expect('a parent cannot merge doorConfig/main', await mergeAs(t.parent, 'doorConfig', 'main', { mode: 'all', updatedByUid: uid.parent }, ['updatedAt']), 403);
    expect('ops sets it with no academy location yet (null lat/lng)', await setConfig(t.ops, config({ lat: null, lng: null })), 200);
    expect('ops sets mode alone (absent fields fall back to the defaults)', await setConfig(t.ops, { mode: 'off', updatedByUid: uid.ops }), 200);
    expect('ops reads doorConfig/main', await getAs(t.ops, 'doorConfig', 'main'), 200);
    expect('owner reads doorConfig/main', await getAs(owner, 'doorConfig', 'main'), 200);
    expect('ops refused a bad mode', await setConfig(t.ops, config({ mode: 'open' })), 403);
    expect('ops refused a radius of 5000', await setConfig(t.ops, config({ radiusM: 5000 })), 403);
    expect('ops refused a radius of 49', await setConfig(t.ops, config({ radiusM: 49 })), 403);
    expect('ops refused a radius that is not whole', await setConfig(t.ops, config({ radiusM: 200.5 })), 403);
    // The open time is Alta's Entry open duration: whole seconds, 1 s to 10 min.
    expect('ops sets an open time of 600 s', await setConfig(t.ops, config({ openSeconds: 600 })), 200);
    expect('owner merges an open time of 600 s', await mergeAs(owner, 'doorConfig', 'main', { openSeconds: 600, updatedByUid: ownerUid }, ['updatedAt']), 200);
    expect('ops refused an open time of 601 s', await setConfig(t.ops, config({ openSeconds: 601 })), 403);
    expect('ops refused a merge of an open time of 601 s', await mergeAs(t.ops, 'doorConfig', 'main', { openSeconds: 601, updatedByUid: uid.ops }, ['updatedAt']), 403);
    expect('ops refused an open time of 0 s', await setConfig(t.ops, config({ openSeconds: 0 })), 403);
    expect('ops refused a foreign updatedByUid', await setConfig(t.ops, config({ updatedByUid: uid.parent })), 403);
    expect('ops refused a client clock for updatedAt', await setConfig(t.ops, config({ updatedAt: new Date('2026-11-17T12:00:00Z') }), 'main', []), 403);
    expect('ops refused no updatedAt at all', await setConfig(t.ops, config(), 'main', []), 403);
    expect('ops refused a latitude of 91', await setConfig(t.ops, config({ lat: 91 })), 403);
    expect('ops refused a longitude of -181', await setConfig(t.ops, config({ lng: -181 })), 403);
    expect('ops refused a latitude as text', await setConfig(t.ops, config({ lat: '44.9' })), 403);
    expect('ops refused an extra field', await setConfig(t.ops, config({ unlockUrl: 'x' })), 403);
    expect('ops refused any doc id but main', await setConfig(t.ops, config(), 'second'), 403);
    expect('ops cannot delete doorConfig/main', await deleteAs(t.ops, 'doorConfig', 'main'), 403);
    expect('a coach cannot read doorConfig', await getAs(t.coach, 'doorConfig', 'main'), 403);
    expect('a parent cannot read doorConfig', await getAs(t.parent, 'doorConfig', 'main'), 403);
    expect('an athlete login cannot read doorConfig', await getAs(t.eliteLogin, 'doorConfig', 'main'), 403);
    expect('a coach cannot set doorConfig/main', await setConfig(t.coach, config({ updatedByUid: uid.coach })), 403);

    // doorPauses: owner/ops create (stamped, shape-checked) and delete; nobody updates; families never read.
    expect('ops pauses a household', await createAs(t.ops, 'doorPauses', 'hh', pause('hh'), ['pausedAt']), 200);
    expect('owner pauses another, with no note', await createAs(owner, 'doorPauses', 'hh-other', pause('hh-other', { pausedByUid: ownerUid, note: null }), ['pausedAt']), 200);
    expect('ops reads a pause', await getAs(t.ops, 'doorPauses', 'hh'), 200);
    expect('owner lists the pauses', await listAs(owner, 'doorPauses', {}), 200);
    expect('the paused family cannot read its pause', await getAs(t.parent, 'doorPauses', 'hh'), 403);
    expect('a coach cannot read a pause', await getAs(t.coach, 'doorPauses', 'hh'), 403);
    expect('ops cannot update a pause', await updateAs(t.ops, 'doorPauses', 'hh', { note: 'changed' }), 403);
    expect('ops refused a householdId that is not the doc id', await createAs(t.ops, 'doorPauses', 'hh-x', pause('hh'), ['pausedAt']), 403);
    expect('ops refused a foreign pausedByUid', await createAs(t.ops, 'doorPauses', 'hh-x', pause('hh-x', { pausedByUid: ownerUid }), ['pausedAt']), 403);
    // A minute old: new Date() could land on request.time's own millisecond on a fast local emulator (seen 1 run in 3).
    expect('ops refused a client clock for pausedAt', await createAs(t.ops, 'doorPauses', 'hh-x', pause('hh-x', { pausedAt: new Date(Date.now() - 60000) }), []), 403);
    expect('ops refused a note over 200 characters', await createAs(t.ops, 'doorPauses', 'hh-x', pause('hh-x', { note: 'n'.repeat(201) }), ['pausedAt']), 403);
    expect('ops refused an extra field', await createAs(t.ops, 'doorPauses', 'hh-x', pause('hh-x', { until: '2026-12-01' }), ['pausedAt']), 403);
    expect('a coach cannot pause a household', await createAs(t.coach, 'doorPauses', 'hh-x', pause('hh-x', { pausedByUid: uid.coach }), ['pausedAt']), 403);
    expect('the family cannot lift its own pause', await deleteAs(t.parent, 'doorPauses', 'hh'), 403);
    expect('ops lifts a pause', await deleteAs(t.ops, 'doorPauses', 'hh'), 200);
    expect('owner lifts a pause', await deleteAs(owner, 'doorPauses', 'hh-other'), 200);

    // doorRules: the signer and owner/ops read; nobody else, and no client write (above).
    expect('parent reads its own doorRules', await getAs(t.parent, 'doorRules', uid.parent), 200);
    expect('parent cannot read another uid\'s doorRules', await getAs(t.parent, 'doorRules', uid.other), 403);
    expect('parent cannot list doorRules', await listAs(t.parent, 'doorRules', { householdId: 'hh' }), 403);
    expect('athlete login cannot read its parent\'s doorRules', await getAs(t.eliteLogin, 'doorRules', uid.parent), 403);
    expect('a coach cannot read doorRules', await getAs(t.coach, 'doorRules', uid.parent), 403);
    expect('ops reads a family\'s doorRules', await getAs(t.ops, 'doorRules', uid.parent), 200);
    expect('owner lists doorRules', await listAs(owner, 'doorRules', {}), 200);

    // doorEvents: owner/ops all; a parent its household's; an athlete login its own; nobody writes.
    expect('parent reads its own household\'s event', await getAs(t.parent, 'doorEvents', 'p-probe_press-0001'), 200);
    expect('parent reads its athlete\'s event (same household)', await getAs(t.parent, 'doorEvents', 'elite-probe_press-0002'), 200);
    expect('parent cannot read another household\'s event', await getAs(t.parent, 'doorEvents', 'p-other-probe_press-0003'), 403);
    expect('parent cannot read a staff event (no household)', await getAs(t.parent, 'doorEvents', 'ops-probe_press-0004'), 403);
    // rules-4: a parent with householdId null must not match the null household of every staff press.
    expect('a parent with no household cannot read a staff event', await getAs(noHousehold, 'doorEvents', 'ops-probe_press-0004'), 403);
    expect('a parent with no household cannot list the events with no household', await listNullAs(noHousehold, 'doorEvents', 'householdId'), 403);
    expect('ops lists the events with no household', await listNullAs(t.ops, 'doorEvents', 'householdId'), 200);
    expect('parent lists its household\'s events', await listAs(t.parent, 'doorEvents', { householdId: 'hh' }), 200);
    expect('parent cannot list another household\'s events', await listAs(t.parent, 'doorEvents', { householdId: 'hh-other' }), 403);
    expect('parent cannot list every event', await listAs(t.parent, 'doorEvents', {}), 403);
    expect('the other parent reads its own household\'s event', await getAs(t.other, 'doorEvents', 'p-other-probe_press-0003'), 200);
    expect('athlete login reads its own event', await getAs(t.eliteLogin, 'doorEvents', 'elite-probe_press-0002'), 200);
    expect('athlete login cannot read its parent\'s event', await getAs(t.eliteLogin, 'doorEvents', 'p-probe_press-0001'), 403);
    expect('athlete login lists its own events', await listAs(t.eliteLogin, 'doorEvents', { uid: uid.eliteLogin }), 200);
    expect('athlete login cannot list its household\'s events', await listAs(t.eliteLogin, 'doorEvents', { householdId: 'hh' }), 403);
    expect('ops lists every event', await listAs(t.ops, 'doorEvents', {}), 200);
    expect('owner reads a staff event', await getAs(owner, 'doorEvents', 'ops-probe_press-0004'), 200);
    expect('a coach cannot read an event', await getAs(t.coach, 'doorEvents', 'p-probe_press-0001'), 403);
    expect('a coach cannot list events', await listAs(t.coach, 'doorEvents', {}), 403);
    expect('ops cannot write an event', await updateAs(t.ops, 'doorEvents', 'p-probe_press-0001', { outcome: 'denied' }), 403);
    expect('owner cannot delete an event', await deleteAs(owner, 'doorEvents', 'p-probe_press-0001'), 403);

    // doorLimits: closed to every client.
    expect('parent cannot read its own doorLimits', await getAs(t.parent, 'doorLimits', uid.parent), 403);
    expect('owner cannot read doorLimits', await getAs(owner, 'doorLimits', uid.parent), 403);
    expect('ops cannot list doorLimits', await listAs(t.ops, 'doorLimits', {}), 403);
    expect('ops cannot write doorLimits', await setAs(t.ops, 'doorLimits', uid.parent, { callsAtMs: [] }, []), 403);
    expect('the limits are untouched', (await call('GET', `/doorLimits/${uid.parent}`, null, 'owner')).body?.fields?.callsAtMs?.arrayValue?.values?.length, 1);
  } finally {
    for (const id of Object.keys(EVENTS()).concat(['p-probe_press-9999'])) await del('doorEvents', id);
    for (const id of [uid.parent, uid.other, 'p-new-door', uid.eliteLogin, noHouseholdUid]) await del('doorRules', id);
    for (const id of ['hh', 'hh-other', 'hh-x']) await del('doorPauses', id);
    for (const id of ['main', 'second']) await del('doorConfig', id);
    await del('doorLimits', uid.parent);
    await del('users', ownerUid);
    await del('users', noHouseholdUid);
  }
}
