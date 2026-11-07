/**
 * Tour results (owner rulings 2026-11-06): age groups '10U', '11-14' and
 * '15-18', a 'coaches' entry, and an optional gender. tournamentResults
 * accepts those ids and null (Open); the Sprint 8 ids '11-13' and '14+' stay
 * accepted (additive - staging and production share one database and a
 * cached old app may still save one); any other id is refused, the
 * never-deployed ids of the same evening's first pass included.
 * gender is absent, null, 'boys' or 'girls'. bracket 'coaches' exactly when
 * the athleteId starts 'coach_' (and then a lowercase slug). The eight keys
 * stay required, and nothing but gender joins them. Written as a coach, the
 * role that enters Tour scores. Run by scripts/verify-rules.mjs in both
 * passes; it seeds and removes everything it touches.
 */
import { commitAs, createAs, del, expect, patchWrite, t, uid } from '../verify-rules.mjs';

const SESSION = '2026-11-07-1';
const DATE = '2026-11-07';
const docId = (athleteId) => `${SESSION}_${athleteId}`;
const result = (athleteId, bracket, extra = {}) => ({ sessionId: SESSION, athleteId, name: 'Probe Player', bracket, date: DATE, score: 80, createdBy: uid.coach, ...extra });
// A create as the coach: createdAt is the server's REQUEST_TIME, as live.js saveTournamentResults writes it.
const create = (athleteId, bracket, extra = {}, auth = t.coach) => createAs(auth, 'tournamentResults', docId(athleteId), result(athleteId, bracket, extra));
// A correction of an existing result: every field again (setDoc), createdAt the server time.
const update = (athleteId, bracket, extra = {}) => {
  const fields = result(athleteId, bracket, extra);
  return commitAs(t.coach, [patchWrite('tournamentResults', docId(athleteId), fields, Object.keys(fields), ['createdAt'])]);
};

const ACCEPTED = [['tr-10u', '10U'], ['tr-11-14', '11-14'], ['tr-15-18', '15-18'], ['tr-open', null]];
const LEGACY = [['tr-11-13', '11-13'], ['tr-14up', '14+']];
const REFUSED = [
  ['tr-11u', '11U'], ['tr-12-14', '12-14'], ['tr-15b', '15+B'], ['tr-15g', '15+G'], ['tr-15', '15+'],
  ['tr-junk', 'Varsity'], ['tr-open-id', 'open'], ['tr-empty', ''], ['tr-caps', 'Coaches'], ['tr-overall', 'overall'],
];

export async function taskTourBrackets() {
  console.log("Tour results: 10U, 11-14, 15-18, coaches and null accepted; legacy 11-13 and 14+ still accepted; other ids refused; gender boys/girls/null; coach_ ids and the coaches bracket go together");
  const touched = [];
  const track = (id) => { touched.push(id); return id; };
  try {
    for (const [id, bracket] of ACCEPTED) expect(`coach saves a result in bracket ${JSON.stringify(bracket)}`, await create(track(id), bracket), 200);
    for (const [id, bracket] of LEGACY) expect(`legacy: coach saves a result in old bracket '${bracket}'`, await create(track(id), bracket), 200);
    for (const [id, bracket] of REFUSED) expect(`coach saving bracket '${bracket}' refused`, await create(track(id), bracket), 403);

    // gender: optional, and only the two stored values.
    expect('an 11-14 result with gender boys', await create(track('tr-g-boys'), '11-14', { gender: 'boys' }), 200);
    expect('a 15-18 result with gender girls', await create(track('tr-g-girls'), '15-18', { gender: 'girls' }), 200);
    expect('a 10U result with gender null', await create(track('tr-g-null'), '10U', { gender: null }), 200);
    for (const [id, gender] of [['tr-g-cap', 'Boys'], ['tr-g-men', 'men'], ['tr-g-male', 'male'], ['tr-g-empty', ''], ['tr-g-int', 1]]) {
      expect(`gender ${JSON.stringify(gender)} refused`, await create(track(id), '11-14', { gender }), 403);
    }

    // Coaches: bracket 'coaches' exactly when the id starts 'coach_', with a lowercase slug.
    expect('a coach entry: coach_pat-lee in coaches, Men', await create(track('coach_pat-lee'), 'coaches', { name: 'Pat Lee', gender: 'boys' }), 200);
    expect('a coach entry with no gender yet', await create(track('coach_sam-2'), 'coaches', { name: 'Sam 2' }), 200);
    expect("a kid's id filed as a coach refused", await create(track('tr-kid-as-coach'), 'coaches'), 403);
    expect('a coach id in 11-14 refused', await create(track('coach_in-kids'), '11-14'), 403);
    expect('a coach id with no bracket (Open) refused', await create(track('coach_open'), null), 403);
    expect('a coach id in a legacy bracket refused', await create(track('coach_legacy'), '14+'), 403);
    expect('a coach id with capitals refused', await create(track('coach_Pat'), 'coaches'), 403);
    expect('a coach id with a space refused', await create(track('coach_pat lee'), 'coaches'), 403);
    expect("a bare 'coach_' refused", await create(track('coach_'), 'coaches'), 403);

    // The shape: the eight keys stay required, gender is the only extra.
    for (const [id, extra] of [['tr-pos', { position: 1 }], ['tr-pts', { points: 10 }], ['tr-sex', { sex: 'girls' }]]) {
      expect(`an extra key ${Object.keys(extra)[0]} refused`, await create(track(id), '11-14', extra), 403);
    }
    const noName = result(track('tr-noname'), '11-14');
    delete noName.name;
    expect('a result with no name key refused', await createAs(t.coach, 'tournamentResults', docId('tr-noname'), noName), 403);

    // Corrections go through the same checks.
    expect('update: 11-14 boys corrected to girls', await update('tr-g-boys', '11-14', { gender: 'girls' }), 200);
    expect('update: a result moved to a junk bracket refused', await update('tr-11-14', 'Varsity'), 403);
    expect('update: a legacy 14+ result rewritten as 15-18', await update('tr-14up', '15-18', { gender: 'boys' }), 200);
    expect('update: a coach entry moved out of coaches refused', await update('coach_pat-lee', '15-18'), 403);

    // Roles unchanged: a parent or athlete still writes no result.
    expect('a parent saving a result refused', await create(track('tr-parent'), '11-14', { createdBy: uid.parent }, t.parent), 403);
    expect('an athlete saving a coach result refused', await create(track('coach_by-athlete'), 'coaches', { createdBy: uid.athlete }, t.athlete), 403);
  } finally {
    for (const id of touched) await del('tournamentResults', docId(id));
  }
}
