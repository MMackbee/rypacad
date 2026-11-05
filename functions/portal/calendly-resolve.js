/**
 * Who a Calendly booking is for (calendlyWebhook, spec 6.2 step 1; widened
 * 2026-11-04): the family by a family `users` doc (invitee email, "Parent
 * email" answer), else by a household's guardian email; the athlete by
 * ownership of `utm_content` or by the household's only kid / the "Athlete
 * name" answer; and whether the booking is the RYP 1:1 at all
 * (isRypOneOnOne, owner ruling 2026-11-04). Transaction reads only; nothing
 * here writes. Kept apart from calendly.js so each stays readable, and free
 * of requires: scripts/calendly-unmatched.mjs loads isRypOneOnOne from here.
 */
'use strict';

/**
 * One document from a snapshot.
 * @param {!Object} snap A DocumentSnapshot.
 * @return {?{id: string, data: !Object, ref: !Object}} Or null.
 */
function docOf(snap) {
  return snap.exists ? {id: snap.id, data: snap.data() || {}, ref: snap.ref} :
      null;
}

/** The "Parent email" question, however Yannick words it. */
const PARENT_EMAIL = /parent.*e-?mail|e-?mail.*parent/i;

/**
 * The docs of `col` whose `field` holds this email: exactly as typed
 * first, then lower-cased. users.email and households.guardian.email are
 * stored as the family typed them, some in mixed case (review 2026-11-04).
 * @param {!Object} tx The transaction.
 * @param {!Object} col A collection reference.
 * @param {string} field The email field.
 * @param {string} email The email, trimmed, in the case it was typed.
 * @return {!Promise<!Object>} The QuerySnapshot (at most 2 docs).
 */
async function byEmail(tx, col, field, email) {
  let snap = await tx.get(col.where(field, '==', email).limit(2));
  if (snap.empty && email !== email.toLowerCase()) {
    snap = await tx.get(col.where(field, '==', email.toLowerCase()).limit(2));
  }
  return snap;
}

/**
 * The one FAMILY `users` doc carrying this email, or null when none, more
 * than one, or a staff doc (no athleteId and no householdId): a staff login
 * must not stop the search (review 2026-11-04).
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {string} email The email as typed.
 * @return {!Promise<?Object>} The users doc body.
 */
async function userByEmail(tx, store, email) {
  const snap = await byEmail(tx, store.collection('users'), 'email', email);
  const u = snap.size === 1 ? snap.docs[0].data() || {} : null;
  return u && (u.athleteId || u.householdId) ? u : null;
}

/**
 * The trimmed answer to the invitee question whose text matches `re`.
 * @param {?Array<!Object>} qa `payload.questions_and_answers`.
 * @param {!RegExp} re Tested against the question text.
 * @return {string} The answer, '' when the question is not there.
 */
function answerOf(qa, re) {
  const row = (qa || []).find((q) => re.test(String(q && q.question || '')));
  return row ? String(row.answer || '').trim() : '';
}

/**
 * A name as compared: lower-cased, accents dropped, single spaces.
 * @param {?string} s Any name.
 * @return {string} The key, '' for nothing.
 */
function nameKey(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * utm_source of the portal's own Calendly link
 * (frontend/src/portal/data/calendly.js) and of the link script's replay
 * (scripts/calendly-unmatched.mjs).
 */
const RYP_SOURCES = ['ryp-portal', 'ryp-link-script'];
/** The RYP 1:1 form's "Athlete name" question. */
const ATHLETE_NAME = /athlete.*name|name.*athlete/i;

/**
 * Whether a payload is the RYP 1:1 (event type "RYP Academy - Mental Game
 * 1:1", calendly.com/yannickartigolle2022-u/ryp-academy-mental-game-1on1),
 * the only one of Yannick's Calendly event types that may book, hold a
 * session, spend a token or keep who booked. Owner ruling 2026-11-04: "not
 * his entire calendly account no but that link is just for ryp sessions";
 * his subscription is user-scoped, so his private clients' event types and
 * the website's free 15-minute info call arrive too. The RYP 1:1 is a
 * payload with ANY of: the portal's or the link script's utm_source; an
 * event name containing "Mental Game" (any case); the RYP form's "Athlete
 * name" question; no event name at all (a legacy or malformed payload fails
 * open, as before). Anything else is another event type.
 * @param {?Object} p `body.payload` (both events carry `scheduled_event`).
 * @return {boolean} True for the RYP 1:1.
 */
function isRypOneOnOne(p) {
  const x = p || {};
  const name = String((x.scheduled_event || {}).name || '').trim();
  const source = String((x.tracking || {}).utm_source || '');
  if (RYP_SOURCES.includes(source) || !name) return true;
  const qa = Array.isArray(x.questions_and_answers) ?
      x.questions_and_answers : [];
  return /mental\s+game/i.test(name) ||
      qa.some((q) => ATHLETE_NAME.test(String(q && q.question || '')));
}

/**
 * Who booked, as typed on Calendly (2026-11-04): kept on the ledger so an
 * unresolved row can be matched to a family by hand. Emails lower-cased
 * here only; the lookups use them as typed (resolveAthlete).
 * @param {!Object} p `body.payload`.
 * @return {{name: ?string, email: ?string, athleteName: ?string,
 *     parentEmail: ?string}} Nulls for what was not given.
 */
function inviteeOf(p) {
  const qa = p.questions_and_answers;
  const email = String(p.email || '').trim().toLowerCase();
  const parent = answerOf(qa, PARENT_EMAIL).toLowerCase();
  return {
    name: String(p.name || '').trim() || null, email: email || null,
    athleteName: answerOf(qa, ATHLETE_NAME) || null,
    parentEmail: parent || null,
  };
}

/**
 * The one kid of a household a booking is for (2026-11-04: a parent of
 * two books from Yannick's own link, so no utm_content): an only child
 * needs no answer; otherwise the "Athlete name" answer must equal one kid's
 * full name, else one kid's first name.
 * @param {!Array<!Object>} kids `{id, data}` rows of the household.
 * @param {?string} athleteName The "Athlete name" answer.
 * @return {?Object} The kid, or null when none or several fit.
 */
function kidByName(kids, athleteName) {
  if (kids.length === 1) return kids[0];
  const key = nameKey(athleteName);
  if (!key) return null;
  const one = (list) => (list.length === 1 ? list[0] : null);
  const first = (s) => nameKey(s).split(' ')[0];
  return one(kids.filter((k) => nameKey(k.data.name) === key)) ||
      one(kids.filter((k) => first(k.data.name) === first(key)));
}

/**
 * Resolve the athlete (spec 6.2 step 1; widened 2026-11-04). The family is
 * found by the invitee email or the "Parent email" answer as a family
 * `users` doc (a staff one does not count), else as a household's guardian
 * email; each is tried as typed, then lower-cased. `utm_content` ->
 * athletes/{id} is accepted only when that family OWNS the athlete (its
 * login, or the same household), so an edited or forwarded link never
 * spends another family's token. Without it: an athlete login is its
 * athlete; a parent login is the household's only kid, or the kid the
 * "Athlete name" answer names (kidByName). Never a name alone across
 * families.
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {!Object} p `body.payload`.
 * @return {!Promise<{athlete: ?{id: string, data: !Object, ref: !Object},
 *     via: ?string, reason: ?string}>} The athlete and how (`utm`,
 *     `athlete-login`, `household`, `household-name`), or null and why
 *     (`no-login`, `utm-not-owned`, `no-athlete`, `ambiguous-household`).
 */
async function resolveAthlete(tx, store, p) {
  const inv = inviteeOf(p);
  // As typed (review 2026-11-04): the stored emails keep the family's case.
  const typed = [String(p.email || '').trim(),
    answerOf(p.questions_and_answers, PARENT_EMAIL)]
      .filter((e, i, all) => e && all.indexOf(e) === i);
  const emails = typed.map((e) => e.toLowerCase());
  let u = null;
  for (let i = 0; !u && i < typed.length; i++) {
    u = await userByEmail(tx, store, typed[i]);
  }
  let householdId = u ? u.householdId || null : null;
  for (let i = 0; !householdId && i < typed.length; i++) {
    const hh = await byEmail(tx, store.collection('households'),
        'guardian.email', typed[i]);
    if (hh.size === 1) householdId = hh.docs[0].id;
  }
  const utm = p.tracking && p.tracking.utm_content;
  if (utm) {
    const a = docOf(await tx.get(
        store.collection('athletes').doc(String(utm))));
    const login = a ? String(a.data.loginEmail || '').toLowerCase() : '';
    const owns = a && ((login && emails.includes(login)) ||
        (householdId && householdId === a.data.householdId));
    if (owns) return {athlete: a, via: 'utm', reason: null};
  }
  if (u && u.athleteId) {
    const a = docOf(await tx.get(
        store.collection('athletes').doc(u.athleteId)));
    if (a) return {athlete: a, via: 'athlete-login', reason: null};
  }
  if (!householdId) {
    return {athlete: null, via: null, reason: utm ? 'utm-not-owned' :
        'no-login'};
  }
  const kids = (await tx.get(store.collection('athletes')
      .where('householdId', '==', householdId).limit(10))).docs.map(docOf);
  const kid = kidByName(kids, inv.athleteName);
  if (kid) {
    return {athlete: kid, reason: null,
      via: kids.length === 1 ? 'household' : 'household-name'};
  }
  return {athlete: null, via: null,
    reason: kids.length ? 'ambiguous-household' : 'no-athlete'};
}

module.exports = {
  docOf, inviteeOf, isRypOneOnOne, kidByName, nameKey, resolveAthlete,
};
