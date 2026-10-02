/**
 * `setAthleteHandicap({ athleteId, handicap })` - the academy sets or corrects
 * the handicap on file (owner ruling 2026-10-02: it decides who may book a
 * handicap-reserved session, data/reserved.js). ops/owner only, enforced by
 * firestore.rules' handicapUpdateOk(), not here; a family never writes it
 * after sign-up. `handicap` is sign-up's value - an integer 0 to 54, or null
 * for none on file (the form turns its text into one with data/signup.js
 * normalizeHandicap). Kept out of the grandfathered hooks/index.js, which
 * re-exports it; live.js's setAthleteHandicap does the one updateDoc +
 * bump('athletes'), so the athlete view and the family's booking cards
 * re-read. Seed mode is a local echo that writes nothing, held to the same
 * range, same discipline as useAssignPackages.
 */
import { ERR, LiveDataError, isLive, setAthleteHandicap as writeAthleteHandicap } from './live';
import { handicapValueOk } from '../data/reserved';
import { HANDICAP_RANGE_ERROR } from '../data/signup';

export async function setAthleteHandicap({ athleteId, handicap } = {}) {
  if (isLive()) return writeAthleteHandicap({ athleteId, handicap });
  if (!athleteId || !handicapValueOk(handicap)) {
    throw new LiveDataError(ERR.INVALID, HANDICAP_RANGE_ERROR, null, 'handicap-range');
  }
  return { athleteId, handicap, simulated: true };
}
