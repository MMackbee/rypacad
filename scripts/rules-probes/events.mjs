/**
 * The workshop card (hq card 5, 2026-11-19; shapes in docs/portal/TEAM.md, "Academy events"). Three new
 * collections:
 *   events/{id}              any account with a users doc reads an ENABLED one; staff read any; no client write
 *   eventLinks/{id}          get only: staff, or the caller whose own sign-up (id + '_' + uid) names this event and them
 *   eventSignups/{id}_{uid}  the caller creates (five exact keys, token email, users-doc name, request time, enabled
 *                            and not ended), deletes and reads its own; staff read all; never an update
 * Staff here is mental, ops, owner; a coach is not. No answer depends on the Oct 10 gate. Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes everything it touches. Only example.com addresses.
 */
import { fsFields, fsValue } from '../lib/firestore-rest.mjs';
import { BASE, call, commitAs, del, expect, listAs, seed, token } from '../verify-rules.mjs';

const U = { parent: 'p-ev-probe', athlete: 'a-ev-probe', other: 'p-ev-other', mental: 'mental-ev-probe', owner: 'owner-ev-probe',
  ops: 'ops-ev-probe', coach: 'coach-ev-probe', noEmail: 'p-ev-noemail', noUser: 'nouser-ev-probe', c: 'c', bc: 'b_c' };
const em = (u) => `${u}@example.com`;
// `BASE` is verify-rules.mjs's, still loading when this module's top level runs: a function, not a constant.
const nameOf = (col, id) => `${BASE.split('/v1/')[1]}/${col}/${id}`;
const stamp = (fields) => fields.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' }));
const getAs = async (auth, col, id) => (await call('GET', `/${col}/${id}`, null, auth)).status;
const setAs = (auth, col, id, fields) => commitAs(auth, [{ update: { name: nameOf(col, id), fields: fsFields(fields) } }]);
const updateAs = (auth, col, id, fields) => commitAs(auth, [{ update: { name: nameOf(col, id), fields: fsFields(fields) },
  updateMask: { fieldPaths: Object.keys(fields) }, currentDocument: { exists: true } }]);
const deleteAs = (auth, col, id) => commitAs(auth, [{ delete: nameOf(col, id) }]);
const createRaw = (auth, id, fields, serverTime = ['createdAt']) => commitAs(auth, [{ update: { name: nameOf('eventSignups', id), fields: fsFields(fields) },
  currentDocument: { exists: false }, updateTransforms: stamp(serverTime) }]);
// A well-formed sign-up as the client sends it; `over` replaces fields, a key set to undefined is dropped.
const signupFields = (uid, eventId, over = {}) => {
  const f = { eventId, uid, email: em(uid), name: `Probe ${uid}`, ...over };
  for (const k of Object.keys(f)) if (f[k] === undefined) delete f[k];
  return f;
};
const signUp = (auth, uid, eventId, over = {}, id = `${eventId}_${uid}`, serverTime = ['createdAt']) => createRaw(auth, id, signupFields(uid, eventId, over), serverTime);
// A list as a real user that also returns the ids it found.
async function listIds(auth, col, filters) {
  const where = { compositeFilter: { op: 'AND', filters: Object.entries(filters).map(([fieldPath, v]) => ({ fieldFilter: { field: { fieldPath }, op: 'EQUAL', value: fsValue(v) } })) } };
  const res = await fetch(`${BASE}:runQuery`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${auth}` },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: col }], ...(Object.keys(filters).length ? { where } : {}) } }) });
  const body = await res.json().catch(() => null);
  const err = Array.isArray(body) ? body.find((r) => r && r.error)?.error : body?.error;
  if (err) return { status: err.code, ids: [] };
  return { status: res.status, ids: (body || []).filter((r) => r.document).map((r) => r.document.name.split('/').pop()) };
}

export async function taskEvents() {
  console.log('Workshop card: events, eventLinks and eventSignups');
  const at = (ms) => new Date(Date.now() + ms);
  const H = 3600000;
  const ev = (over = {}) => ({ enabled: true, title: 'Probe workshop', startsAt: at(24 * H), endsAt: at(24.75 * H), ...over });
  const EV = 'ev-probe', OFF = 'ev-off-probe', ENDED = 'ev-ended-probe', LATE = 'ev-late-probe', OTHER = 'ev-other-probe', AB = 'a_b', A = 'a';
  const events = { [EV]: ev(), [OFF]: ev({ enabled: false }), [ENDED]: ev({ startsAt: at(-2 * H), endsAt: at(-1 * H) }),
    [LATE]: ev({ startsAt: at(-10 * 60000), endsAt: at(35 * 60000) }), [OTHER]: ev(), [AB]: ev(), [A]: ev() };
  const tk = {};
  for (const u of Object.values(U)) tk[u] = token(u, u === U.noEmail ? { email_verified: false } : { email: em(u), email_verified: true });
  const staff = { owner: tk[U.owner], ops: tk[U.ops], mental: tk[U.mental] };
  const link = (auth, id = EV) => getAs(auth, 'eventLinks', id);
  // The three collections are this module's alone, so everything in them goes, before the cases and again at the end:
  // a refused case that slips through a looser rule leaves a document no fixed id list would name.
  const wipe = async () => {
    for (const col of ['events', 'eventLinks', 'eventSignups']) for (const id of (await listIds('owner', col, {})).ids) await del(col, id);
  };
  try {
    await wipe();
    const roles = { [U.parent]: 'parent', [U.athlete]: 'athlete', [U.other]: 'parent', [U.mental]: 'mental', [U.owner]: 'owner', [U.ops]: 'ops',
      [U.coach]: 'coach', [U.c]: 'parent', [U.bc]: 'parent', [U.noEmail]: 'parent' };
    for (const [u, role] of Object.entries(roles)) {
      // The no-email login has no displayName either: its sign-up's name is null.
      await seed('users', u, { role, ...(u === U.noEmail ? {} : { displayName: `Probe ${u}` }), ...(role === 'parent' ? { householdId: `hh-${u}` } : {}) });
    }
    for (const [id, d] of Object.entries(events)) { await seed('events', id, d); await seed('eventLinks', id, { meetUrl: `https://example.com/probe-link-${id}` }); }

    // 1-7 the event document
    expect('parent: get of an enabled event', await getAs(tk[U.parent], 'events', EV), 200);
    expect('parent: get of a disabled event refused', await getAs(tk[U.parent], 'events', OFF), 403);
    const enabledList = await listIds(tk[U.parent], 'events', { enabled: true });
    expect('parent: a list filtered on enabled == true succeeds', enabledList.status, 200);
    expect('parent: that list does not include the disabled event', enabledList.ids.includes(OFF), false);
    expect('parent: that list includes the enabled event', enabledList.ids.includes(EV), true);
    expect('parent: a list with no filter refused', await listAs(tk[U.parent], 'events', {}), 403);
    const anon = await fetch(`${BASE}/events/${EV}`);
    await anon.text().catch(() => null);
    expect('signed out: get of an enabled event refused', anon.status, 403);
    expect('signed in with no users doc: get of an enabled event refused', await getAs(tk[U.noUser], 'events', EV), 403);
    expect('parent: create of an event refused', await setAs(tk[U.parent], 'events', 'ev-new-probe', ev()), 403);
    expect('parent: change of an event refused', await updateAs(tk[U.parent], 'events', EV, { title: 'x' }), 403);
    expect('parent: delete of an event refused', await deleteAs(tk[U.parent], 'events', EV), 403);
    expect('owner: change of an event refused (console only)', await updateAs(staff.owner, 'events', EV, { title: 'x' }), 403);
    for (const [who, auth] of Object.entries(staff)) expect(`${who}: get of a disabled event`, await getAs(auth, 'events', OFF), 200);
    expect('coach: get of a disabled event refused', await getAs(tk[U.coach], 'events', OFF), 403);
    expect('coach: get of an enabled event', await getAs(tk[U.coach], 'events', EV), 200);
    expect('owner: list with no filter', await listAs(staff.owner, 'events', {}), 200);

    // 8-10 sign-ups: create
    expect('parent: signs up for an enabled, not-ended event', await signUp(tk[U.parent], U.parent, EV), 200);
    const mine = await call('GET', `/eventSignups/${EV}_${U.parent}`, null, 'owner');
    expect('the stored sign-up holds the token email', mine.body?.fields?.email?.stringValue, em(U.parent));
    expect('the stored sign-up holds the users-doc name', mine.body?.fields?.name?.stringValue, `Probe ${U.parent}`);
    expect('the stored sign-up has exactly five keys', Object.keys(mine.body?.fields || {}).length, 5);
    const other = tk[U.other];
    expect("refused: another person's uid in the id", await createRaw(other, `${EV}_${U.parent}`, signupFields(U.other, EV)), 403);
    expect("refused: another person's uid in the field", await signUp(other, U.other, EV, { uid: U.parent }), 403);
    expect('refused: an id that does not match eventId_uid', await signUp(other, U.other, EV, {}, 'whatever'), 403);
    expect('refused: an extra field', await signUp(other, U.other, EV, { extra: 1 }), 403);
    for (const k of ['eventId', 'uid', 'email', 'name']) expect(`refused: missing ${k}`, await signUp(other, U.other, EV, { [k]: undefined }), 403);
    expect('refused: missing createdAt', await signUp(other, U.other, EV, {}, `${EV}_${U.other}`, []), 403);
    expect("refused: an email that is not the token's", await signUp(other, U.other, EV, { email: 'someone@example.com' }), 403);
    expect('refused: a null email when the token has one', await signUp(other, U.other, EV, { email: null }), 403);
    expect("refused: a name that is not the users doc's", await signUp(other, U.other, EV, { name: 'Somebody Else' }), 403);
    expect('refused: a null name when the users doc has one', await signUp(other, U.other, EV, { name: null }), 403);
    expect('refused: a createdAt that is not the request time', await signUp(other, U.other, EV, { createdAt: at(-60000) }, `${EV}_${U.other}`, []), 403);
    expect('refused: an event that does not exist', await signUp(other, U.other, 'ev-nope-probe'), 403);
    expect('refused: an event that is not enabled', await signUp(other, U.other, OFF), 403);
    expect('refused: an event that has ended', await signUp(other, U.other, ENDED), 403);
    expect('refused: no users doc (the name cannot be read)', await signUp(tk[U.noUser], U.noUser, EV), 403);
    expect('a login with no email claim and no displayName: nulls accepted', await signUp(tk[U.noEmail], U.noEmail, EV, { email: null, name: null }), 200);
    expect('athlete login signs up', await signUp(tk[U.athlete], U.athlete, EV), 200);

    // 11 a second create, an update
    // A create precondition on an existing doc answers 409 (already exists) before the rules run; the whole-set case below is the rules' answer.
    expect('a second create over an existing sign-up refused (409, already exists)', await signUp(tk[U.parent], U.parent, EV), 409);
    expect('a whole set over an existing sign-up refused', await setAs(tk[U.parent], 'eventSignups', `${EV}_${U.parent}`, signupFields(U.parent, EV, { createdAt: at(0) })), 403);
    expect("an update of one's own sign-up refused", await updateAs(tk[U.parent], 'eventSignups', `${EV}_${U.parent}`, { name: 'Changed' }), 403);
    expect('the owner cannot update one either', await updateAs(staff.owner, 'eventSignups', `${EV}_${U.parent}`, { name: 'Changed' }), 403);

    // 12 reads
    const own = await listIds(tk[U.parent], 'eventSignups', { uid: U.parent });
    expect('parent: list filtered on its own uid', own.status, 200);
    expect('parent: that list holds its sign-up', own.ids.includes(`${EV}_${U.parent}`), true);
    expect('parent: get of its own sign-up', await getAs(tk[U.parent], 'eventSignups', `${EV}_${U.parent}`), 200);
    expect('a parent in another household: get refused', await getAs(other, 'eventSignups', `${EV}_${U.parent}`), 403);
    expect('a parent in another household: list by that uid refused', await listAs(other, 'eventSignups', { uid: U.parent }), 403);
    expect('parent: list with no filter refused', await listAs(tk[U.parent], 'eventSignups', {}), 403);
    expect('parent: list by event id alone refused', await listAs(tk[U.parent], 'eventSignups', { eventId: EV }), 403);

    // 13 staff list
    for (const [who, auth] of Object.entries(staff)) {
      const l = await listIds(auth, 'eventSignups', { eventId: EV });
      expect(`${who}: lists every sign-up for an event`, l.status, 200);
      expect(`${who}: and sees all three`, [U.parent, U.athlete, U.noEmail].every((u) => l.ids.includes(`${EV}_${u}`)), true);
    }
    expect('coach: list of sign-ups refused', await listAs(tk[U.coach], 'eventSignups', { eventId: EV }), 403);
    expect('coach: get of a sign-up refused', await getAs(tk[U.coach], 'eventSignups', `${EV}_${U.parent}`), 403);

    // 15 the link
    expect('link: a parent with no sign-up refused', await link(other), 403);
    expect('link: after signing up', await link(tk[U.parent]), 200);
    expect('link: a sign-up for a different event does not open this one', await link(tk[U.parent], OTHER), 403);
    expect('link: a parent can never list eventLinks', await listAs(tk[U.parent], 'eventLinks', {}), 403);
    expect('link: a parent cannot create one', await setAs(tk[U.parent], 'eventLinks', 'ev-new-probe', { meetUrl: 'https://example.com/x' }), 403);
    expect('link: a parent cannot change one', await updateAs(tk[U.parent], 'eventLinks', EV, { meetUrl: 'https://example.com/x' }), 403);
    expect('link: a parent cannot delete one', await deleteAs(tk[U.parent], 'eventLinks', EV), 403);
    expect('link: the owner cannot write one either (console only)', await updateAs(staff.owner, 'eventLinks', EV, { meetUrl: 'https://example.com/x' }), 403);
    const anonLink = await fetch(`${BASE}/eventLinks/${EV}`);
    await anonLink.text().catch(() => null);
    expect('link: signed out refused', anonLink.status, 403);
    expect('link: a coach with no sign-up refused', await link(tk[U.coach]), 403);
    for (const [who, auth] of Object.entries(staff)) expect(`link: ${who} with no sign-up`, await link(auth), 200);
    expect('link: staff may list', await listAs(staff.ops, 'eventLinks', {}), 200);
    expect('link: no users doc and no sign-up refused', await link(tk[U.noUser]), 403);

    // 14 taking it back
    expect('another parent cannot delete a sign-up', await deleteAs(other, 'eventSignups', `${EV}_${U.parent}`), 403);
    expect('the coach cannot delete one', await deleteAs(tk[U.coach], 'eventSignups', `${EV}_${U.parent}`), 403);
    expect('parent: deletes its own sign-up', await deleteAs(tk[U.parent], 'eventSignups', `${EV}_${U.parent}`), 200);
    expect('link: after taking the sign-up back', await link(tk[U.parent]), 403);
    expect('the sign-up is gone', await getAs('owner', 'eventSignups', `${EV}_${U.parent}`), 404);
    expect('and the parent can sign up again', await signUp(tk[U.parent], U.parent, EV), 200);

    // 16 late arrival: started, not ended
    expect('late arrival: the link is closed before signing up', await link(other, LATE), 403);
    expect('late arrival: signs up after the start', await signUp(other, U.other, LATE), 200);
    expect('late arrival: the link reads at once', await link(other, LATE), 200);

    // Id collision (lead's amendment): event a_b + uid c and event a + uid b_c both join to a_b_c.
    expect('collision: c signs up for event a_b (doc a_b_c)', await signUp(tk[U.c], U.c, AB), 200);
    expect('collision: c reads the link of a_b', await link(tk[U.c], AB), 200);
    expect('collision: b_c is refused the link of event a', await link(tk[U.bc], A), 403);
    expect('collision: c is refused the link of event a too', await link(tk[U.c], A), 403);
    expect('collision: b_c cannot sign up for event a (the doc id is taken; 409)', await signUp(tk[U.bc], U.bc, A), 409);
  } finally {
    await wipe();
    for (const u of Object.values(U)) await del('users', u);
  }
}
