/**
 * Mental performance consent (docs/portal/plans/2026-10-30-mental-consent, spec 6.2, plan Task 1):
 * mentalConsents/{athleteId}, one document per athlete. The household's parent signs a minor's record (the
 * athlete's assent typed on the same phone); an 18+ athlete signs their own section 11, and once that athlete has
 * a claimed login the parent is refused, a minor-era record included; ops/owner record a paper form and the owner
 * corrects it; Yannick (role mental) countersigns and records a withdrawal of the recording answer; a minor-era
 * record is re-signed at 18. History is proven on every update and nobody deletes.
 * Every write is one commit shaped like the client's: server times through REQUEST_TIME, and the history built
 * from a fresh GET so the stored values go back exactly as a client transaction resends them. Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes everything it touches.
 */
import { fsFields, fsValue } from '../lib/firestore-rest.mjs';
import { BASE, call, commitAs, del, expect, listAs, seed, t, token } from '../verify-rules.mjs';

const VERSION = '2026-10-30';
const HH = 'mc-hh';
const OTHER_HH = 'mc-other-hh';
// The UTC date the rules count 18 on (adultOn), and a dob that many years and days before it.
const D = new Date().toISOString().slice(0, 10);
function minus(years, days) {
  const [y, m, d] = D.split('-').map(Number);
  return new Date(Date.UTC(y - years, m - 1, d - days)).toISOString().slice(0, 10);
}

const U = { parent: 'mc-parent', other: 'mc-other', kid: 'mc-kid-login', adult: 'mc-adult-login', turned: 'mc-turned-login',
  mental: 'mc-mental', ops: 'mc-ops', owner: 'mc-owner', phil: 'mc-phil' };
const USERS = {
  [U.parent]: { role: 'parent', householdId: HH, athleteId: null },
  [U.other]: { role: 'parent', householdId: OTHER_HH, athleteId: null },
  [U.kid]: { role: 'athlete', athleteId: 'mc-kid', householdId: HH },
  [U.adult]: { role: 'athlete', athleteId: 'mc-adult', householdId: HH },
  [U.turned]: { role: 'athlete', athleteId: 'mc-turned-claimed', householdId: HH },
  [U.mental]: { role: 'mental', specialistId: 'mental' },
  [U.ops]: { role: 'ops' },
  [U.owner]: { role: 'owner' },
  [U.phil]: { role: 'coach', specialistId: 'phil' },
};
const ATHLETES = {
  'mc-kid': { dob: minus(15, 0), loginEmail: 'mc-kid@example.com' },
  'mc-kid2': { dob: minus(12, 0) },
  'mc-almost': { dob: minus(18, -1) }, // 18 tomorrow (UTC)
  'mc-bday': { dob: minus(18, 0) }, // 18 today (UTC)
  'mc-adult': { dob: minus(18, 1), loginEmail: 'mc-adult@example.com' },
  'mc-handover': { dob: minus(19, 0) },
  'mc-open': { dob: minus(19, 0), loginEmail: 'mc-open@example.com' },
  'mc-turned': { dob: minus(18, 1) },
  'mc-turned2': { dob: minus(18, 1) },
  'mc-turned-claimed': { dob: minus(18, 1), loginEmail: 'mc-turned@example.com' },
  'mc-nodob': { dob: null },
  'mc-other-kid': { dob: minus(14, 0), householdId: OTHER_HH },
  'mc-paper-adult': { dob: minus(19, 0), householdId: OTHER_HH },
  'mc-paper-turned': { dob: minus(18, 1), householdId: OTHER_HH },
};
// claimInvite marks the invite 'claimed' (rules: athleteLoginClaimed); mc-open's is still open.
const INVITES = { 'mc-kid@example.com': ['mc-kid', 'claimed'], 'mc-adult@example.com': ['mc-adult', 'claimed'],
  'mc-turned@example.com': ['mc-turned-claimed', 'claimed'], 'mc-open@example.com': ['mc-open', 'open'] };

// "Same as parent" (minors only) and a full contact. Fixtures carry the literal phone 'test-phone'.
const SAME = { name: null, phone: null, relationship: null };
const LEE = { name: 'Lee Probe', phone: 'test-phone', relationship: 'aunt' };
const minorChoices = (by, extra = {}) => ({ location: 'B', audio: true, driving: false, emergencyContact: SAME, parentSessions: null, parentName: null,
  updatedBy: by, ...extra });
const adultChoices = (by, extra = {}) => ({ location: 'any', audio: true, driving: null, emergencyContact: LEE, parentSessions: true,
  parentName: 'Dana Probe', updatedBy: by, ...extra });
const base = (id, by, householdId = HH) => ({ athleteId: id, householdId, version: VERSION, method: 'portal', signedBy: by,
  adultConfirm: null, adultSignature: null, countersign: null, history: [] });
/** The portal minor record (the parent's section 10 plus the assent); its server times go through REQUEST_TIME. */
const minor = (id, by, extra = {}, choices = {}) => ({ ...base(id, by), signer: { role: 'parent', name: 'Dana Probe' }, adult: false,
  assent: { name: 'Ava Probe', audio: true, readAloud: false, withdrawnBy: null }, choices: minorChoices(by, choices), ...extra });
/** The portal section 11 record: the athlete signs (on their own login or the parent's phone), no assent. */
const adult = (id, by, extra = {}, choices = {}) => ({ ...base(id, by), signer: { role: 'athlete', name: 'Max Probe' }, adult: true,
  assent: null, choices: adultChoices(by, choices), ...extra });
const MINOR_TIMES = ['signedAt', 'assent.at', 'choices.updatedAt'];
const ADULT_TIMES = ['signedAt', 'choices.updatedAt'];
// Paper: the date on the form at Chicago midnight (paperDateToStamp('2026-10-28')); only choices.updatedAt is the server's.
const PAPER_AT = new Date('2026-10-28T05:00:00Z');
const PAPER_TIMES = ['choices.updatedAt'];
const paperMinor = (id, by, signedAt = PAPER_AT) => ({ ...base(id, by, OTHER_HH), method: 'paper', signedAt, signer: { role: 'parent', name: 'Dana Probe' },
  adult: false, assent: { name: 'Ava Probe', audio: true, at: signedAt, readAloud: false, withdrawnBy: null }, choices: minorChoices(by, { location: null }) });
/** A paper section 11 (the athlete signed, 18+): no assent, the adult choices as far as the paper shows. */
const paperAdult = (id, by, householdId = OTHER_HH) => ({ ...base(id, by, householdId), method: 'paper', signedAt: PAPER_AT,
  signer: { role: 'athlete', name: 'Max Probe' }, adult: true, assent: null, choices: adultChoices(by, { location: null }) });
// A minor-era portal record signed before the athlete turned 18, written with the owner bypass.
const PAST = new Date('2026-10-20T15:00:00Z');
const signedEarlier = (id, audio, countersign) => ({ ...minor(id, U.parent, { signedAt: PAST, countersign }),
  assent: { name: 'Max Probe', audio, at: PAST, readAloud: false, withdrawnBy: null }, choices: { ...minorChoices(U.parent), updatedAt: PAST } });

/** The commit write's document name, from the probe's BASE (`http://host/v1/<name prefix>`). */
const nameOf = (col, id) => `${BASE.replace(/^https?:\/\/[^/]+\/v1\//, '')}/${col}/${id}`;
/** One commit on mentalConsents/{id}: `exists` false a create, true an update, undefined a set with no precondition. */
function writeAs(auth, id, fields, { mask, exists, serverTime = [] } = {}) {
  return commitAs(auth, [{ update: { name: nameOf('mentalConsents', id), fields },
    ...(mask ? { updateMask: { fieldPaths: mask } } : {}),
    ...(exists === undefined ? {} : { currentDocument: { exists } }),
    ...(serverTime.length ? { updateTransforms: serverTime.map((fieldPath) => ({ fieldPath, setToServerValue: 'REQUEST_TIME' })) } : {}) }]);
}
const create = (auth, id, body, serverTime) => writeAs(auth, id, fsFields(body), { exists: false, serverTime });
/** The stored record's encoded fields, as a client transaction reads them ({} when missing: the write is then refused). */
const current = async (id) => (await call('GET', `/mentalConsents/${id}`, null, 'owner')).body?.fields || {};
/** The stored (encoded) history plus one map of the stored (encoded) fields named by `keys`. */
function historyWith(cur, keys) {
  return { arrayValue: { values: [...(cur.history?.arrayValue?.values || []), { mapValue: { fields: Object.fromEntries(keys.map((k) => [k, cur[k]])) } }] } };
}
/** A stored (encoded) map with `over` encoded on top; `drop` names the key left to REQUEST_TIME. */
function mapWith(stored, over, drop) {
  const fields = { ...stored?.mapValue?.fields, ...fsFields(over) };
  if (drop) delete fields[drop];
  return { mapValue: { fields } };
}

const FAMILY = ['choices', 'assent', 'adultConfirm'];
/**
 * choicesUpdate: the stored choices with `choices` over them, restamped by `by`; the parent's hand-the-phone
 * `assent` change and an `adultConfirm` when given (its `at` the server's unless one is passed); `extra` rides
 * along; `history(cur)` builds the history (null leaves it out).
 */
async function family(auth, by, id, { choices = {}, assent, adultConfirm, extra = {}, history = (cur) => historyWith(cur, FAMILY) } = {}) {
  const cur = await current(id);
  const fields = { choices: mapWith(cur.choices, { ...choices, updatedBy: by }, 'updatedAt'), ...fsFields(extra) };
  const serverTime = ['choices.updatedAt'];
  if (assent) { fields.assent = mapWith(cur.assent, assent, 'at'); serverTime.push('assent.at'); }
  if (adultConfirm) {
    fields.adultConfirm = fsValue(adultConfirm);
    if (!('at' in adultConfirm)) serverTime.push('adultConfirm.at');
  }
  if (history) fields.history = history(cur);
  return writeAs(auth, id, fields, { mask: Object.keys(fields), exists: true, serverTime });
}
/** A withdrawal: assent.audio to false, stamped `withdrawnBy` at the server's time, the old values on the history. */
async function withdraw(auth, id, withdrawnBy) {
  const cur = await current(id);
  return writeAs(auth, id, { assent: mapWith(cur.assent, { audio: false, withdrawnBy }, 'at'), history: historyWith(cur, ['choices', 'assent']) },
    { mask: ['assent', 'history'], exists: true, serverTime: ['assent.at'] });
}
/** The 18+ re-sign of a minor-era record: adultSignature, adult choices, countersign reset, the old values on the history. */
async function resign(auth, by, id, { method = 'portal', signedAt, choices = adultChoices(by) } = {}) {
  const cur = await current(id);
  const fields = { adultSignature: fsValue({ signedBy: by, name: 'Max Probe', version: VERSION, method, ...(signedAt ? { signedAt } : {}) }),
    choices: fsValue(choices), countersign: fsValue(null), history: historyWith(cur, ['choices', 'assent', 'countersign']) };
  return writeAs(auth, id, fields, { mask: Object.keys(fields), exists: true,
    serverTime: [...(signedAt ? [] : ['adultSignature.signedAt']), 'choices.updatedAt'] });
}
const countersign = (auth, id, by) => writeAs(auth, id, { countersign: fsValue({ by }) }, { mask: ['countersign'], exists: true, serverTime: ['countersign.at'] });
/**
 * The owner's paper correction: the form's fields restated, choices always resent (restamped unless `staleStamp`).
 * `section11` corrects the form to section 11: adult true, the athlete as signer, no assent, the adult choices.
 */
async function correct(auth, by, id, { signedAt, assent, staleStamp = false, section11 = false }) {
  const cur = await current(id);
  const choices = section11 ? fsValue(adultChoices(by, { location: null })) : mapWith(cur.choices, { updatedBy: by }, staleStamp ? null : 'updatedAt');
  const fields = { signedAt: fsValue(signedAt), signer: section11 ? fsValue({ role: 'athlete', name: 'Max Probe' }) : cur.signer,
    adult: section11 ? fsValue(true) : cur.adult, version: cur.version, signedBy: fsValue(by),
    assent: section11 ? fsValue(null) : assent ? fsValue(assent) : cur.assent, choices,
    history: historyWith(cur, ['choices', 'assent', 'signedAt', 'signer', 'adult', 'version', 'signedBy']) };
  return writeAs(auth, id, fields, { mask: Object.keys(fields), exists: true, serverTime: staleStamp ? [] : ['choices.updatedAt'] });
}

export async function taskMentalConsent() {
  console.log('Mental consent: mentalConsents - family signs, paper, withdrawal, re-sign, countersign; history on every update; nobody deletes');
  const tk = Object.fromEntries(Object.entries(U).map(([k, u]) => [k, token(u, { email: `${u}@example.com`, email_verified: true })]));
  const getAs = (auth, id) => call('GET', `/mentalConsents/${id}`, null, auth).then((r) => r.status);
  const ago = () => new Date(Date.now() - 60000); // a minute back: a client "now" can share request.time's millisecond
  const tomorrow = new Date(Date.now() + 86400000);
  try {
    for (const [u, fields] of Object.entries(USERS)) await seed('users', u, fields);
    for (const [id, extra] of Object.entries(ATHLETES)) await seed('athletes', id, { name: id, householdId: HH, contractMinutes: null, coachId: null, ...extra });
    for (const [email, [athleteId, status]] of Object.entries(INVITES)) await seed('loginInvites', email, { email, householdId: HH, athleteId, status });

    // Reads while nothing is stored for the household.
    expect('parent lists its household (householdId == mc-hh, no records yet)', await listAs(tk.parent, 'mentalConsents', { householdId: HH }), 200);
    expect('parent gets mentalConsents/mc-kid before it exists (why hooks never getDoc for a parent)', await getAs(tk.parent, 'mc-kid'), 403);
    expect('mc-adult-login gets mentalConsents/mc-adult before it exists (allowed; fetchOwnConsent reads null)', await getAs(tk.adult, 'mc-adult'), 404);
    await seed('mentalConsents', 'mc-turned', signedEarlier('mc-turned', true, { at: PAST, by: U.mental }));
    await seed('mentalConsents', 'mc-turned2', signedEarlier('mc-turned2', true, null));
    await seed('mentalConsents', 'mc-turned-claimed', signedEarlier('mc-turned-claimed', false, null));

    // Creates. Every refusal runs while its target has no record.
    expect('mc-kid-login creates its own record (a minor, before anyone signed)', await create(tk.kid, 'mc-kid', minor('mc-kid', U.kid), MINOR_TIMES), 403);
    expect('mc-other creates for mc-kid with mc-other-hh in the body', await create(tk.other, 'mc-kid', { ...minor('mc-kid', U.other), householdId: OTHER_HH }, MINOR_TIMES), 403);
    expect("parent creates mc-kid's minor record", await create(tk.parent, 'mc-kid', minor('mc-kid', U.parent, {}, { emergencyContact: LEE, driving: true }), MINOR_TIMES), 200);
    expect('parent sets mc-kid again (no precondition: an update of the whole doc)',
      await writeAs(tk.parent, 'mc-kid', fsFields(minor('mc-kid', U.parent)), { serverTime: MINOR_TIMES }), 403);
    expect('parent creates a minor record for mc-kid2 with assent null', await create(tk.parent, 'mc-kid2', minor('mc-kid2', U.parent, { assent: null }), ADULT_TIMES), 403);
    expect('parent creates mc-kid2 with signedAt sent by the client (a minute back)',
      await create(tk.parent, 'mc-kid2', minor('mc-kid2', U.parent, { signedAt: ago() }), ['assent.at', 'choices.updatedAt']), 403);
    for (const [label, extra, choices] of [
      ["signedBy 'someone'", { signedBy: 'someone' }], ["version 'v1'", { version: 'v1' }], ['history [x]', { history: ['x'] }],
      ['countersign set', { countersign: { at: ago(), by: U.mental } }], ['an extra key', { note: 'x' }], ["location 'D'", {}, { location: 'D' }],
      ['signer.name of 121 chars', { signer: { role: 'parent', name: 'x'.repeat(121) } }], ["driving 'yes'", {}, { driving: 'yes' }],
    ]) expect(`parent creates mc-kid2 with ${label}`, await create(tk.parent, 'mc-kid2', minor('mc-kid2', U.parent, extra, choices), MINOR_TIMES), 403);
    expect('parent creates mc-kid2 (same-as-parent contact, driving null)', await create(tk.parent, 'mc-kid2', minor('mc-kid2', U.parent, {}, { driving: null }), MINOR_TIMES), 200);
    expect('parent creates mc-almost as adult (18 tomorrow)', await create(tk.parent, 'mc-almost', adult('mc-almost', U.parent), ADULT_TIMES), 403);
    expect('parent creates mc-bday as a minor (18 today)', await create(tk.parent, 'mc-bday', minor('mc-bday', U.parent), MINOR_TIMES), 403);
    expect('parent creates mc-bday section 11', await create(tk.parent, 'mc-bday', adult('mc-bday', U.parent), ADULT_TIMES), 200);
    expect('parent creates mc-handover as a minor', await create(tk.parent, 'mc-handover', minor('mc-handover', U.parent), MINOR_TIMES), 403);
    expect('parent creates mc-handover section 11 with an assent map',
      await create(tk.parent, 'mc-handover', adult('mc-handover', U.parent, { assent: { name: 'Max Probe', audio: true, readAloud: false, withdrawnBy: null } }), MINOR_TIMES), 403);
    expect('parent creates mc-handover section 11 with no emergency phone',
      await create(tk.parent, 'mc-handover', adult('mc-handover', U.parent, {}, { emergencyContact: { ...LEE, phone: null } }), ADULT_TIMES), 403);
    expect('parent creates mc-handover section 11 with parentSessions true and parentName null',
      await create(tk.parent, 'mc-handover', adult('mc-handover', U.parent, {}, { parentName: null }), ADULT_TIMES), 403);
    expect('parent creates mc-handover section 11', await create(tk.parent, 'mc-handover', adult('mc-handover', U.parent), ADULT_TIMES), 200);
    expect('parent creates mc-adult section 11 (claimed login)', await create(tk.parent, 'mc-adult', adult('mc-adult', U.parent), ADULT_TIMES), 403);
    expect('mc-adult-login creates its own section 11', await create(tk.adult, 'mc-adult', adult('mc-adult', U.adult), ADULT_TIMES), 200);
    expect('parent creates mc-open section 11 (its invite is still open)', await create(tk.parent, 'mc-open', adult('mc-open', U.parent), ADULT_TIMES), 200);
    expect('parent creates mc-nodob as adult', await create(tk.parent, 'mc-nodob', adult('mc-nodob', U.parent), ADULT_TIMES), 403);
    expect('parent creates mc-nodob as a minor', await create(tk.parent, 'mc-nodob', minor('mc-nodob', U.parent), MINOR_TIMES), 403);

    // Reads of stored records.
    expect('parent gets mentalConsents/mc-kid (the transaction read)', await getAs(tk.parent, 'mc-kid'), 200);
    for (const [who, auth] of [['coach', t.coach], ['mc-phil', tk.phil], ['mc-other', tk.other]]) expect(`${who} gets mentalConsents/mc-kid`, await getAs(auth, 'mc-kid'), 403);
    for (const [who, auth] of [['coach', t.coach], ['mc-phil', tk.phil]]) {
      expect(`${who} lists mentalConsents where householdId == mc-hh`, await listAs(auth, 'mentalConsents', { householdId: HH }), 403);
    }
    for (const who of ['mental', 'ops', 'owner']) expect(`mc-${who} gets mentalConsents/mc-kid`, await getAs(tk[who], 'mc-kid'), 200);
    expect('mc-kid-login gets its own', await getAs(tk.kid, 'mc-kid'), 200);
    expect("mc-kid-login gets mc-adult's", await getAs(tk.kid, 'mc-adult'), 403);
    expect('mc-mental lists the collection unfiltered', await listAs(tk.mental, 'mentalConsents', {}), 200);
    expect('parent lists the collection unfiltered', await listAs(tk.parent, 'mentalConsents', {}), 403);

    // Paper (mc-other-kid has no record until the 200).
    expect('mc-ops paper for mc-other-kid with signedAt tomorrow', await create(tk.ops, 'mc-other-kid', paperMinor('mc-other-kid', U.ops, tomorrow), PAPER_TIMES), 403);
    expect('mc-ops paper for mc-other-kid with signedAt 2025-12-31T06:00:00Z',
      await create(tk.ops, 'mc-other-kid', paperMinor('mc-other-kid', U.ops, new Date('2025-12-31T06:00:00Z')), PAPER_TIMES), 403);
    expect("mc-other (mc-other-kid's own parent) creates paper", await create(tk.other, 'mc-other-kid', paperMinor('mc-other-kid', U.other), PAPER_TIMES), 403);
    expect('mc-mental creates paper for mc-other-kid', await create(tk.mental, 'mc-other-kid', paperMinor('mc-other-kid', U.mental), PAPER_TIMES), 403);
    // Section 11 is the athlete's own signature at 18+: never for an athlete under 18 today (UTC).
    expect('mc-ops paper section 11 for mc-other-kid (14)', await create(tk.ops, 'mc-other-kid', paperAdult('mc-other-kid', U.ops), PAPER_TIMES), 403);
    expect('mc-ops paper section 11 for mc-almost (18 tomorrow)', await create(tk.ops, 'mc-almost', paperAdult('mc-almost', U.ops, HH), PAPER_TIMES), 403);
    expect('mc-ops creates paper minor for mc-other-kid (signedAt and assent.at 2026-10-28T05:00:00Z, assent.audio true, location null)',
      await create(tk.ops, 'mc-other-kid', paperMinor('mc-other-kid', U.ops), PAPER_TIMES), 200);
    expect('mc-owner corrects mc-other-kid (14, not withdrawn) to section 11',
      await correct(tk.owner, U.owner, 'mc-other-kid', { signedAt: PAPER_AT, section11: true }), 403);
    expect('mc-ops paper section 11 for mc-paper-adult (19)', await create(tk.ops, 'mc-paper-adult', paperAdult('mc-paper-adult', U.ops), PAPER_TIMES), 200);
    expect('mc-ops paper section 10 for mc-paper-turned (18 now; the form signed while a minor)',
      await create(tk.ops, 'mc-paper-turned', paperMinor('mc-paper-turned', U.ops), PAPER_TIMES), 200);

    // Updates.
    expect("parent changes mc-kid's location to 'C' (history: the stored choices, assent, adultConfirm)",
      await family(tk.parent, U.parent, 'mc-kid', { choices: { location: 'C' } }), 200);
    expect('the same without history', await family(tk.parent, U.parent, 'mc-kid', { choices: { location: 'A' }, history: null }), 403);
    expect("the same with the old entry's location altered", await family(tk.parent, U.parent, 'mc-kid', { choices: { location: 'A' }, history: (cur) => {
      const h = historyWith(cur, FAMILY);
      h.arrayValue.values.at(-1).mapValue.fields.choices = mapWith(cur.choices, { location: 'A' });
      return h;
    } }), 403);
    expect('the same changing signer', await family(tk.parent, U.parent, 'mc-kid', { choices: { location: 'A' }, extra: { signer: { role: 'parent', name: 'Someone Probe' } } }), 403);
    for (const who of ['ops', 'owner', 'mental']) {
      expect(`mc-${who} changes mc-kid's location with a correct history`, await family(tk[who], U[who], 'mc-kid', { choices: { location: 'A' } }), 403);
    }
    expect('parent sets mc-kid assent.audio false, name unchanged', await family(tk.parent, U.parent, 'mc-kid', { assent: { audio: false } }), 200);
    expect('parent changes assent.name', await family(tk.parent, U.parent, 'mc-kid', { assent: { name: 'Renamed Probe' } }), 403);
    expect("mc-kid-login changes mc-kid's choices.location", await family(tk.kid, U.kid, 'mc-kid', { choices: { location: 'A' } }), 403);
    expect('parent puts assent.audio back to true (hand-the-phone)', await family(tk.parent, U.parent, 'mc-kid', { assent: { audio: true } }), 200);
    expect('mc-kid-login withdraws (true -> false, withdrawnBy mc-kid-login)', await withdraw(tk.kid, 'mc-kid', U.kid), 200);
    expect('mc-kid-login sets it back to true', await family(tk.kid, U.kid, 'mc-kid', { assent: { audio: true, withdrawnBy: null } }), 403);
    expect("parent changes mc-turned's location before its re-sign (18, no login)", await family(tk.parent, U.parent, 'mc-turned', { choices: { location: 'A' } }), 200);
    expect('mc-ops withdraws on mc-turned', await withdraw(tk.ops, 'mc-turned', U.ops), 403);
    expect("mc-mental withdraws on mc-turned with withdrawnBy 'someone'", await withdraw(tk.mental, 'mc-turned', 'someone'), 403);
    expect('mc-mental withdraws on mc-turned', await withdraw(tk.mental, 'mc-turned', U.mental), 200);
    expect("parent puts mc-turned's assent.audio back to true (18 now)",
      await family(tk.parent, U.parent, 'mc-turned', { assent: { audio: true, withdrawnBy: null } }), 403);
    expect('mc-mental withdraws on mc-other-kid (paper)', await withdraw(tk.mental, 'mc-other-kid', U.mental), 200);
    expect('mc-mental withdraws on mc-paper-turned (paper, 18 now)', await withdraw(tk.mental, 'mc-paper-turned', U.mental), 200);
    expect("parent changes mc-handover's location only, no adultConfirm", await family(tk.parent, U.parent, 'mc-handover', { choices: { location: 'C' } }), 200);
    const flip = { parentSessions: false, parentName: null };
    expect('parent flips mc-handover parentSessions without adultConfirm', await family(tk.parent, U.parent, 'mc-handover', { choices: flip }), 403);
    expect('parent flips mc-handover parentSessions with adultConfirm.at a client timestamp',
      await family(tk.parent, U.parent, 'mc-handover', { choices: flip, adultConfirm: { name: 'Max Probe', at: ago() } }), 403);
    expect("parent flips mc-handover parentSessions with adultConfirm { name 'Max Probe', at: REQUEST_TIME }",
      await family(tk.parent, U.parent, 'mc-handover', { choices: flip, adultConfirm: { name: 'Max Probe' } }), 200);
    expect("parent changes mc-adult's location (claimed login)", await family(tk.parent, U.parent, 'mc-adult', { choices: { location: 'C' } }), 403);
    expect('mc-adult-login changes audio with adultConfirm', await family(tk.adult, U.adult, 'mc-adult', { choices: { audio: false }, adultConfirm: { name: 'Max Probe' } }), 200);
    expect("parent changes mc-turned-claimed's location", await family(tk.parent, U.parent, 'mc-turned-claimed', { choices: { location: 'C' } }), 403);
    expect("parent sets mc-turned-claimed's assent.audio true", await family(tk.parent, U.parent, 'mc-turned-claimed', { assent: { audio: true } }), 403);

    // The 18+ re-sign.
    expect('parent section 11 re-sign of mc-kid (still 15)', await resign(tk.parent, U.parent, 'mc-kid'), 403);
    expect("parent re-signs mc-turned (adultSignature method 'portal', adult choices, countersign null, history)", await resign(tk.parent, U.parent, 'mc-turned'), 200);
    expect('a second re-sign on mc-turned', await resign(tk.parent, U.parent, 'mc-turned'), 403);
    expect('parent section 11 re-sign of mc-turned-claimed', await resign(tk.parent, U.parent, 'mc-turned-claimed'), 403);
    expect('mc-turned-login section 11 re-sign of its own record', await resign(tk.turned, U.turned, 'mc-turned-claimed'), 200);
    const paperResign = (auth, by, signedAt = new Date('2026-11-01T05:00:00Z')) =>
      resign(auth, by, 'mc-turned2', { method: 'paper', signedAt, choices: adultChoices(by, { location: null, emergencyContact: SAME }) });
    expect('mc-ops paper re-sign of mc-turned2 with adultSignature.signedAt tomorrow', await paperResign(tk.ops, U.ops, tomorrow), 403);
    expect('mc-mental sends mc-turned2 the paper-shaped re-sign', await paperResign(tk.mental, U.mental), 403);
    expect('parent sends mc-turned2 the paper-shaped re-sign', await paperResign(tk.parent, U.parent), 403);
    expect("mc-ops paper re-sign of mc-turned2 (signedAt 2026-11-01T05:00:00Z, method 'paper', location null, contact both null)",
      await paperResign(tk.ops, U.ops), 200);
    expect('mc-mental withdraws on mc-turned2 after its re-sign (assent.audio still true)', await withdraw(tk.mental, 'mc-turned2', U.mental), 403);

    // Countersign.
    expect('mc-mental countersigns mc-kid', await countersign(tk.mental, 'mc-kid', U.mental), 200);
    expect('mc-mental countersigns mc-kid again', await countersign(tk.mental, 'mc-kid', U.mental), 403);
    expect('mc-ops countersigns mc-kid2', await countersign(tk.ops, 'mc-kid2', U.ops), 403);
    expect("mc-mental countersigns mc-kid2 with by 'someone'", await countersign(tk.mental, 'mc-kid2', 'someone'), 403);

    // Paper correction (mc-other-kid is a withdrawn paper record by now).
    const corrected = new Date('2026-10-27T05:00:00Z');
    expect('mc-owner corrects signedAt to 2026-10-27T05:00:00Z keeping the stored assent (history: choices, assent, signedAt, signer, adult, version, signedBy)',
      await correct(tk.owner, U.owner, 'mc-other-kid', { signedAt: corrected }), 200);
    expect('mc-owner corrects again resending the stored choices.updatedAt', await correct(tk.owner, U.owner, 'mc-other-kid', { signedAt: corrected, staleStamp: true }), 403);
    expect('mc-owner corrects with assent { audio true, withdrawnBy null, at: signedAt } (a withdrawal is never undone)',
      await correct(tk.owner, U.owner, 'mc-other-kid', { signedAt: corrected, assent: { name: 'Ava Probe', audio: true, at: corrected, readAloud: false, withdrawnBy: null } }), 403);
    expect('mc-owner corrects the withdrawn mc-paper-turned (18) to section 11, assent null (a withdrawal is never undone)',
      await correct(tk.owner, U.owner, 'mc-paper-turned', { signedAt: corrected, section11: true }), 403);
    expect('mc-ops paper re-sign of the withdrawn mc-paper-turned (section 11 at 18 keeps the stored assent)',
      await resign(tk.ops, U.ops, 'mc-paper-turned', { method: 'paper', signedAt: new Date('2026-11-01T05:00:00Z'),
        choices: adultChoices(U.ops, { location: null, emergencyContact: SAME }) }), 200);
    expect('mc-owner corrects mc-paper-adult (19, section 11) signedAt only', await correct(tk.owner, U.owner, 'mc-paper-adult', { signedAt: corrected }), 200);
    expect('mc-ops corrects it', await correct(tk.ops, U.ops, 'mc-other-kid', { signedAt: corrected }), 403);
    expect('mc-owner "corrects" mc-kid (a portal record)', await correct(tk.owner, U.owner, 'mc-kid', { signedAt: corrected }), 403);

    // Nobody deletes.
    for (const [who, auth] of [['mc-owner', tk.owner], ['parent', tk.parent]]) {
      expect(`${who} deletes mentalConsents/mc-kid`, (await call('DELETE', '/mentalConsents/mc-kid', null, auth)).status, 403);
    }
  } finally {
    for (const id of Object.keys(ATHLETES)) { await del('mentalConsents', id); await del('athletes', id); }
    for (const email of Object.keys(INVITES)) await del('loginInvites', email);
    for (const u of Object.keys(USERS)) await del('users', u);
  }
}
