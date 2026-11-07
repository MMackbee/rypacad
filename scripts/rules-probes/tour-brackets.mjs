/**
 * Tour brackets (owner ruling 2026-11-06): 11 & under, 12-14, and 15 & up
 * with boys and girls ranked apart. tournamentResults.bracket accepts the
 * four new ids '11U', '12-14', '15+B', '15+G' and null (Open); the Sprint 8
 * ids '10U', '11-13', '14+' stay accepted (additive change - staging and
 * production share one database and a cached old app may still save one);
 * a bare '15+' (no Boys/Girls) and any other id are refused, on create and
 * on update. Written as a coach, the role that enters Tour scores. Run by
 * scripts/verify-rules.mjs in both passes; it seeds and removes everything
 * it touches.
 */
import { commitAs, createAs, del, expect, patchWrite, t, uid } from '../verify-rules.mjs';

const SESSION = '2026-11-07-1';
const DATE = '2026-11-07';
const docId = (athleteId) => `${SESSION}_${athleteId}`;
const result = (athleteId, bracket, extra = {}) => ({ sessionId: SESSION, athleteId, name: 'Probe Athlete', bracket, date: DATE, score: 40, createdBy: uid.coach, ...extra });
// A create as the coach: createdAt is the server's REQUEST_TIME, as live.js saveTournamentResults writes it.
const create = (athleteId, bracket) => createAs(t.coach, 'tournamentResults', docId(athleteId), result(athleteId, bracket));
// A correction of an existing result: every field again (setDoc), createdAt the server time.
const update = (athleteId, bracket, extra = {}) => {
  const fields = result(athleteId, bracket, extra);
  return commitAs(t.coach, [patchWrite('tournamentResults', docId(athleteId), fields, Object.keys(fields), ['createdAt'])]);
};

const ACCEPTED = [['tb-11u', '11U'], ['tb-12-14', '12-14'], ['tb-15b', '15+B'], ['tb-15g', '15+G'], ['tb-open', null]];
const LEGACY = [['tb-10u', '10U'], ['tb-11-13', '11-13'], ['tb-14up', '14+']];
const REFUSED = [['tb-bare15', '15+'], ['tb-junk', 'Varsity'], ['tb-15x', '15+X'], ['tb-open-id', 'open'], ['tb-empty', '']];

export async function taskTourBrackets() {
  console.log("Tour brackets: 11U, 12-14, 15+B, 15+G and null accepted; legacy 10U, 11-13, 14+ still accepted; a bare '15+' and junk refused");
  const touched = [];
  try {
    for (const [id, bracket] of ACCEPTED) {
      touched.push(id);
      expect(`coach saves a result in bracket ${JSON.stringify(bracket)}`, await create(id, bracket), 200);
    }
    for (const [id, bracket] of LEGACY) {
      touched.push(id);
      expect(`legacy: coach saves a result in old bracket '${bracket}'`, await create(id, bracket), 200);
    }
    for (const [id, bracket] of REFUSED) {
      touched.push(id);
      expect(`coach saving bracket '${bracket}' refused`, await create(id, bracket), 403);
    }
    // Corrections go through the same check: a saved 15 & up result can switch Boys/Girls, never drop to a bare '15+'.
    expect("update: a 15+B result corrected to 15+G", await update('tb-15b', '15+G'), 200);
    expect("update: a 15+G result rewritten as a bare '15+' refused", await update('tb-15g', '15+'), 403);
    expect("update: a result rewritten with a junk bracket refused", await update('tb-12-14', 'Varsity'), 403);
    expect("update: a legacy 14+ result rewritten as 15+B", await update('tb-14up', '15+B'), 200);
    // The bracket check does not loosen anything else: a parent still cannot write a result in a new bracket.
    touched.push('tb-parent');
    expect('a parent saving a 15+B result refused', await createAs(t.parent, 'tournamentResults', docId('tb-parent'), result('tb-parent', '15+B', { createdBy: uid.parent })), 403);
  } finally {
    for (const id of touched) await del('tournamentResults', docId(id));
  }
}
