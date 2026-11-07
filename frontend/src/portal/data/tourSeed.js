/**
 * Seed demo Tour season - the fallback every role sees with
 * REACT_APP_PORTAL_LIVE_DATA unset (useTourStandings). Computed by the same
 * deriveTourStandings the live read uses, never hand-summed.
 *
 * Names are NOT invented: the three Whitfields from seed.js's HOUSEHOLD
 * (jordan/reese/nico, their athleteIds elsewhere in this repo) plus the five
 * names on the coach's ROSTER/ATTENTION_LIST screens. Nico sits out the two
 * older events on purpose - HOUSEHOLD tells his story as "New Feb 8".
 *
 * Age groups follow the facts on file (2026-11-06 groups, age on the season
 * start): jordan 14 and reese 12 (owner-supplied dobs) -> 11-14, nico 9 ->
 * 10U; nguyen and alvarez "Age 12", sandoval "Age 14", bergstrom "Age 13"
 * (14 by the start) -> 11-14. Okonkwo's meta states no age; he takes 10U,
 * the one unconstrained assignment, so the 9-hole board is not empty. No seed
 * kid is 15, so the 15-18 boards stay empty rather than invent a kid.
 *
 * Gender: reese is a girl and nico a boy in seed.js's own wording ("her",
 * "him"); jordan, sandoval and alvarez (boys) and nguyen and bergstrom
 * (girls) are a demo assignment, made so both gender boards hold a field.
 * 11-14 scores are 18-hole rounds, 10 & under 9-hole ones.
 *
 * Three past Saturdays, computed off today so the demo never shows a past
 * Tour event in the future; every event carries the plain 'Tour event'
 * label.
 */
import { addDaysISO, lastSaturdayOnOrBefore, todayISO } from './calendar';
import { deriveTourStandings } from './tour';

const EVENT_1 = lastSaturdayOnOrBefore(todayISO()); // most recent Saturday
const EVENT_2 = addDaysISO(EVENT_1, -7);
const EVENT_3 = addDaysISO(EVENT_1, -14);

const TOUR_SEED_NAMES = {
  jordan: 'Jordan Whitfield',
  reese: 'Reese Whitfield',
  nico: 'Nico Whitfield',
  nguyen: 'A. Nguyen',
  okonkwo: 'M. Okonkwo',
  sandoval: 'R. Sandoval',
  alvarez: 'T. Alvarez',
  bergstrom: 'S. Bergstrom',
};

const SEED_PLAYERS = {
  jordan: ['11-14', 'boys'],
  reese: ['11-14', 'girls'],
  nico: ['10U', 'boys'],
  nguyen: ['11-14', 'girls'],
  okonkwo: ['10U', null],
  sandoval: ['11-14', 'boys'],
  alvarez: ['11-14', 'boys'],
  bergstrom: ['11-14', 'girls'],
};

// [date, athleteId, score] per row; the field grows from 6 to 8 the way a
// season roster does. Bergstrom edges Jordan for the best season, with
// Jordan taking one head-to-head week - the old seed's rivalry, kept.
const ROWS = [
  [EVENT_3, 'bergstrom', 78],
  [EVENT_3, 'jordan', 82],
  [EVENT_3, 'nguyen', 90],
  [EVENT_3, 'sandoval', 100],
  [EVENT_3, 'alvarez', 88],
  [EVENT_3, 'okonkwo', 47],
  [EVENT_2, 'jordan', 74],
  [EVENT_2, 'bergstrom', 76],
  [EVENT_2, 'okonkwo', 42],
  [EVENT_2, 'nguyen', 86],
  [EVENT_2, 'reese', 92],
  [EVENT_2, 'alvarez', 96],
  [EVENT_2, 'sandoval', 98],
  [EVENT_1, 'bergstrom', 72],
  [EVENT_1, 'jordan', 78],
  [EVENT_1, 'reese', 82],
  [EVENT_1, 'nguyen', 86],
  [EVENT_1, 'nico', 47],
  [EVENT_1, 'sandoval', 100],
  [EVENT_1, 'okonkwo', 46],
  [EVENT_1, 'alvarez', 98],
];

export const TOUR_SEED_RESULTS = ROWS.map(([date, athleteId, score]) => ({
  sessionId: `${date}-1`,
  date,
  athleteId,
  bracket: SEED_PLAYERS[athleteId][0],
  gender: SEED_PLAYERS[athleteId][1],
  score,
}));

/** The seed fallback for useTourStandings. */
export const TOUR_SEED = deriveTourStandings(TOUR_SEED_RESULTS, {
  nameById: TOUR_SEED_NAMES,
  labelById: Object.fromEntries([EVENT_1, EVENT_2, EVENT_3].map((d) => [`${d}-1`, 'Tour event'])),
});
