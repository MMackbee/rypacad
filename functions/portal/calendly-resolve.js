/**
 * Who a Calendly booking is for (calendlyWebhook, spec 6.2 step 1; widened
 * 2026-11-04): the family by login (invitee email, "Parent email" answer,
 * guardian email), the athlete by ownership of `utm_content` or by the
 * household's only kid / the "Athlete name" answer. Transaction reads only;
 * nothing here writes. Kept apart from calendly.js so each stays readable.
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

/**
 * The one `users` doc carrying this email (exact, then lower-cased), or
 * null when none or more than one.
 * @param {!Object} tx The transaction.
 * @param {!Object} store Firestore.
 * @param {string} email The invitee email.
 * @return {!Promise<?Object>} The users doc body.
 */
async function userByEmail(tx, store, email) {
  const users = store.collection('users');
  let snap = await tx.get(users.where('email', '==', email).limit(2));
  if (snap.empty && email !== email.toLowerCase()) {
    snap = await tx.get(
        users.where('email', '==', email.toLowerCase()).limit(2));
  }
  return snap.size === 1 ? snap.docs[0].data() || {} : null;
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
 * Who booked, as typed on Calendly (2026-11-04): kept on the ledger so an
 * unresolved row can be matched to a family by hand. Emails lower-cased.
 * @param {!Object} p `body.payload`.
 * @return {{name: ?string, email: ?string, athleteName: ?string,
 *     parentEmail: ?string}} Nulls for what was not given.
 */
function inviteeOf(p) {
  const qa = p.questions_and_answers;
  const email = String(p.email || '').trim().toLowerCase();
  const parent = answerOf(qa, /parent.*e-?mail|e-?mail.*parent/i)
      .toLowerCase();
  return {
    name: String(p.name || '').trim() || null, email: email || null,
    athleteName: answerOf(qa, /athlete.*name|name.*athlete/i) || null,
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
 * found by login: the invitee email or the "Parent email" answer as a
 * `users` doc, else as a household's guardian email. `utm_content` ->
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
  const emails = [inv.email, inv.parentEmail]
      .filter((e, i, all) => e && all.indexOf(e) === i);
  let u = null;
  for (const email of emails) {
    u = await userByEmail(tx, store, email);
    if (u) break;
  }
  let householdId = u ? u.householdId || null : null;
  for (let i = 0; !u && !householdId && i < emails.length; i++) {
    const hh = await tx.get(store.collection('households')
        .where('guardian.email', '==', emails[i]).limit(2));
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

module.exports = {docOf, inviteeOf, kidByName, nameKey, resolveAthlete};
