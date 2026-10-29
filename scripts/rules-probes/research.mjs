/**
 * Research consent (assessments spec 4.3, 7): the one-time confirm - the
 * household's parent, or the 18+ member who created their own household,
 * sets consents.research once, that key only, dated by the server and
 * signed by the caller; a yes under 18 needs the assent - and the owner's
 * recorded change, the earlier answer kept on the history. Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes
 * everything it touches.
 */
import { del, expect, seed, t, token, uid, updateAs } from '../verify-rules.mjs';

const KID = 'ath-research-kid';
const ADULT_CHILD = 'ath-research-adult';
const SELF = 'ath-research-self';
const SELF_HH = 'hh-research-self';
const users = { owner: 'owner-research-probe', self: 'research-self-probe', kid: 'research-kid-probe' };
const tok = (u) => token(u, { email: `${u}@example.com`, email_verified: true });
const kidBody = (extra = {}) => ({ name: 'Research Kid', householdId: 'hh', dob: '2012-04-10', contractMinutes: null, coachId: null, packageId: 't-6', ...extra });
const selfBody = { name: 'Self Member', householdId: SELF_HH, dob: '2000-01-01', contractMinutes: null, coachId: null, packageId: 't-6' };
/** The write hooks/researchConsent.js makes: consents.research, its recordedAt the server's time. */
const answer = (auth, id, research, serverTime = ['consents.research.recordedAt']) =>
  updateAs(auth, 'athletes', id, { consents: { research } }, ['consents.research'], serverTime);

export async function taskResearch() {
  console.log('Research consent: the one-time confirm (parent, 18+ self), that key only, assent under 18; the owner records a change');
  const owner = tok(users.owner);
  const self = tok(users.self);
  const kid = tok(users.kid);
  const reset = (extra = {}) => seed('athletes', KID, kidBody(extra));
  try {
    await seed('users', users.owner, { role: 'owner' });
    await seed('users', users.self, { role: 'athlete', athleteId: SELF, householdId: SELF_HH });
    await seed('users', users.kid, { role: 'athlete', athleteId: KID, householdId: 'hh' });
    await seed('households', SELF_HH, { name: 'Self family', createdBy: users.self });
    await seed('athletes', SELF, selfBody);
    await seed('athletes', ADULT_CHILD, kidBody({ name: 'Adult Child', dob: '2000-01-01' }));

    await reset();
    expect('under 18, a yes without the assent is refused', await answer(t.parent, KID, { value: true, assent: false, recordedBy: uid.parent }), 403);
    expect('the parent records yes with the assent', await answer(t.parent, KID, { value: true, assent: true, recordedBy: uid.parent }), 200);
    expect('a second answer from the parent is refused', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent }), 403);
    await reset({ consents: { dataCollection: true, videoCapture: true, mediaRelease: false, research: null, signature: { name: 'Dana', date: '2026-10-01' } } });
    expect('a sign-up record with research null takes the answer', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent }), 200);
    await reset();
    expect('under 18 the assent is a yes or a no, never left out', await answer(t.parent, KID, { value: false, recordedBy: uid.parent }), 403);
    expect('another household cannot answer', await answer(t.other, KID, { value: false, assent: false, recordedBy: uid.other }), 403);
    expect("the child's own login cannot answer", await answer(kid, KID, { value: false, assent: false, recordedBy: users.kid }), 403);
    expect('a coach cannot answer', await answer(t.coach, KID, { value: false, assent: false, recordedBy: uid.coach }), 403);
    expect('the answer is signed by the caller', await answer(t.parent, KID, { value: false, assent: false, recordedBy: 'someone-else' }), 403);
    // A minute back: a client "now" can land in the same millisecond as request.time on a local emulator.
    expect('the answer is dated by the server', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent, recordedAt: new Date(Date.now() - 60000) }, []), 403);
    expect('a first answer carries no history', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent, history: [] }), 403);
    expect('no other consent rides along', await updateAs(t.parent, 'athletes', KID,
      { consents: { mediaRelease: true, research: { value: false, assent: false, recordedBy: uid.parent } } },
      ['consents.mediaRelease', 'consents.research'], ['consents.research.recordedAt']), 403);
    expect('no other field rides along', await updateAs(t.parent, 'athletes', KID,
      { name: 'Renamed', consents: { research: { value: false, assent: false, recordedBy: uid.parent } } },
      ['name', 'consents.research'], ['consents.research.recordedAt']), 403);
    expect('an 18+ athlete in the family: yes, no assent', await answer(t.parent, ADULT_CHILD, { value: true, assent: null, recordedBy: uid.parent }), 200);
    expect('18+: an assent is refused', await answer(self, SELF, { value: true, assent: true, recordedBy: users.self }), 403);
    expect('the 18+ member records their own answer', await answer(self, SELF, { value: true, assent: null, recordedBy: users.self }), 200);

    // A Feb 29 birthday (review 2026-10-28): 18 years on is a common year, so the 18th birthday is Mar 1.
    await reset({ dob: '2012-02-29' });
    expect('Feb 29, under 18: a yes needs the assent', await answer(t.parent, KID, { value: true, assent: null, recordedBy: uid.parent }), 403);
    expect('Feb 29, under 18: the parent records yes with the assent', await answer(t.parent, KID, { value: true, assent: true, recordedBy: uid.parent }), 200);
    await reset({ dob: '2008-02-29' });
    expect('Feb 29, 18+: an assent is refused', await answer(t.parent, KID, { value: true, assent: true, recordedBy: uid.parent }), 403);
    expect('Feb 29, 18+: the parent records yes, no assent', await answer(t.parent, KID, { value: true, assent: null, recordedBy: uid.parent }), 200);
    await reset({ dob: '2012-02-29', consents: { research: { value: true, assent: true, recordedAt: new Date('2026-10-15T15:00:00Z'), recordedBy: uid.parent } } });
    expect('Feb 29: the owner records a change', await answer(owner, KID, { value: false, assent: false, recordedBy: users.owner,
      history: [{ value: true, assent: true, recordedAt: new Date('2026-10-15T15:00:00Z'), recordedBy: uid.parent }] }), 200);

    // The 18th birthday counts from midnight UTC (timestamp.date), and the portal decides the answer's shape on the UTC
    // date to match (hooks/researchConsent.js, screens/AssessmentResults.js; review 2026-10-28).
    const eighteenYearsBefore = (iso) => `${Number(iso.slice(0, 4)) - 18}${iso.slice(4)}`;
    const todayUTC = new Date().toISOString().slice(0, 10);
    const tomorrowUTC = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await reset({ dob: eighteenYearsBefore(todayUTC) });
    expect('18 today by the UTC date: an assent is refused', await answer(t.parent, KID, { value: true, assent: true, recordedBy: uid.parent }), 403);
    expect('18 today by the UTC date: the parent records yes, no assent', await answer(t.parent, KID, { value: true, assent: null, recordedBy: uid.parent }), 200);
    await reset({ dob: eighteenYearsBefore(tomorrowUTC) });
    expect('18 tomorrow by the UTC date: the parent records yes with the assent', await answer(t.parent, KID, { value: true, assent: true, recordedBy: uid.parent }), 200);

    const earlier = { value: true, assent: true, recordedAt: new Date('2026-10-15T15:00:00Z'), recordedBy: uid.parent };
    await reset({ consents: { research: earlier } });
    expect('the parent cannot change a recorded answer', await answer(t.parent, KID, { value: false, assent: false, recordedBy: uid.parent }), 403);
    expect('the owner must keep the earlier answer', await answer(owner, KID, { value: false, assent: false, recordedBy: users.owner, history: [] }), 403);
    expect('the owner records a change, the earlier answer on its history', await answer(owner, KID, { value: false, assent: false, recordedBy: users.owner, history: [earlier] }), 200);
  } finally {
    for (const id of [KID, ADULT_CHILD, SELF]) await del('athletes', id);
    await del('households', SELF_HH);
    for (const u of Object.values(users)) await del('users', u);
  }
}
