/**
 * Staff booking copy. Task C0 makes the row-action and entry-point words
 * real (Lane E's markup reads them before the rest of the copy lands); C2
 * pins every other string in spec 10.2-10.5 here.
 */
import { ADD_ATHLETE, BOOK_A_SESSION, CANCEL_LABEL, MOVE_LABEL, cancelAria, moveAria, testAthleteLine } from './staffBookingCopy';
import * as C from './staffBookingCopy';

describe('the C0 words', () => {
  test('the row buttons and the entry-point buttons', () => {
    expect([MOVE_LABEL, CANCEL_LABEL, BOOK_A_SESSION, ADD_ATHLETE]).toEqual(['Move', 'Cancel', 'Book a session', 'Add athlete']);
  });

  test('moveAria: the athlete, the row, or both', () => {
    expect(moveAria('Jordan')).toBe('Move Jordan');
    expect(moveAria('Jordan', 'Tue, Nov 10 Training block')).toBe("Move Jordan's Tue, Nov 10 Training block");
    expect(moveAria(null, 'Tue, Nov 10 Training block')).toBe('Move Tue, Nov 10 Training block');
  });

  test("cancelAria: the Billing Cancel's label with a row; the athlete's booking without one", () => {
    expect(cancelAria('Jordan', 'Tue, Nov 10 Training block')).toBe("Cancel Jordan's Tue, Nov 10 Training block");
    expect(cancelAria('Jordan')).toBe("Cancel Jordan's booking");
    expect(cancelAria(null, 'Tue, Nov 10 Training block')).toBe('Cancel Tue, Nov 10 Training block');
  });

  test('the test athlete line', () => {
    expect(testAthleteLine('Jordan')).toBe("Jordan is a test athlete. Test athletes can't be booked onto real sessions.");
  });
});

// ---- C2: every other string in spec 10.2-10.5 --------------------------------

describe('the Admin card and the athlete search', () => {
  test('the card, the field, a result, no match, a load failure', () => {
    expect([C.MANAGE_BOOKINGS_LABEL, C.MANAGE_BOOKINGS_BODY]).toEqual(['Manage bookings', 'Add, move or cancel a session for any athlete.']);
    expect([C.FIND_ATHLETE_LABEL, C.FIND_ATHLETE_PLACEHOLDER]).toEqual(['Find an athlete', 'Start typing a name']);
    expect(C.athleteSubline('Whitfield family', '6 tokens')).toBe('Whitfield family · 6 tokens');
    expect(C.athleteSubline('Whitfield family', null)).toBe('Whitfield family');
    expect(C.athleteSubline(null, '6 tokens')).toBe('6 tokens');
    expect(C.TEST_BADGE).toBe('Test');
    expect(C.noAthleteMatches('zz')).toBe('No athlete matches "zz".');
    expect(C.noAthleteMatches('  zz ')).toBe('No athlete matches "zz".');
    expect(C.ATHLETES_LOAD_FAILED).toBe("Athletes didn't load. Check your connection and try again.");
  });
});

describe("the athlete's screen", () => {
  test('the header', () => {
    expect([C.BACK_TO_ADMIN, C.STAFF_VIEW_LABEL, C.FAMILY_BILLING]).toEqual(['‹ Admin', 'Bookings · staff view', 'Family billing']);
  });

  test('the token line, for each package and each pay state', () => {
    const line = (payState, tokens) => C.tokenLine({ payState, tokens });
    expect(line('paid', { left: 3, granted: 6, unlimited: false, perPurchase: false, grace: [] })).toBe('3 of 6 tokens left this period');
    expect(line('paid', { left: null, granted: null, unlimited: true, grace: [] })).toBe('Elite');
    expect(line('paid', { left: 0, granted: 0, perPurchase: true, grace: [{ id: 'single_cs1' }, { id: 'single_cs2' }] })).toBe('2 session tokens');
    expect(line('paid', { left: 0, granted: 0, perPurchase: true, grace: [{ id: 'single_cs1' }] })).toBe('1 session token');
    expect(line('paid', { left: 1, granted: 1, perPurchase: true, grace: [] })).toBe('1 session token');
    expect(line('unpaid', { left: 3, granted: 6 })).toBe('Not paid yet - Free only');
    expect(line('past_due', { unlimited: true })).toBe('Membership past due - Free only');
    expect(line('lapsed', { left: 3, granted: 6 })).toBe('Membership lapsed - Free only');
    expect(line('no-package', null)).toBe('No package on file - Free only');
  });

  test('the groups and the rows', () => {
    expect(C.groupLabel('this', { start: '2026-11-01', end: '2026-11-30' })).toBe('This period · Nov 1 - Nov 30');
    expect(C.groupLabel('next', { start: '2026-12-01', end: '2026-12-31' })).toBe('Next period · Dec 1 - Dec 31');
    expect([C.LATER_LABEL, C.NOTHING_BOOKED]).toEqual(['Later', 'Nothing booked.']);
    expect(C.rowWhen('2026-11-17', '4:00 PM')).toBe('Tue Nov 17 · 4:00 PM');
    expect(C.rowWhen('2026-11-17', null)).toBe('Tue Nov 17');
    expect([C.CANCEL_IN_CALENDLY, C.ATHLETE_NOT_ON_FILE]).toEqual(['Cancel in Calendly', "That athlete isn't on file."]);
    expect(testAthleteLine('Jordan')).toBe("Jordan is a test athlete. Test athletes can't be booked onto real sessions.");
  });
});

describe('the day and session picker', () => {
  test('the day controls and Close', () => {
    expect([C.DAY_LABEL, C.PREV_DAY, C.NEXT_DAY, C.CLOSE]).toEqual(['Day', '‹ Previous day', 'Next day ›', 'Close']);
  });

  test('the seats pill and the tags', () => {
    expect(C.seatsPill({ full: false, taken: 3, capacity: 12 })).toBe('9 left');
    expect(C.seatsPill({ full: true, taken: 14, capacity: 14 })).toBe('Full · 14 of 14');
    expect(C.seatsPill({ full: true, taken: 15, capacity: 14 })).toBe('Full · 15 of 14');
    expect([C.STARTED_TAG, C.reservedTagLine(5), C.WAITLISTED_TAG, C.BOOKED_TAG]).toEqual(['Started', 'Reserved 5 or better', 'Waitlisted', 'Booked']);
  });

  test('empty, loading, failed', () => {
    expect(C.noSessionsOn('2026-11-17')).toBe('No sessions to book on Tue Nov 17.');
    expect(C.FINDING_SESSIONS).toBe('Finding sessions...');
    expect(C.SESSIONS_LOAD_FAILED).toBe("Sessions didn't load. Check your connection and try again.");
  });

  test("the roster's athlete picker", () => {
    expect(C.athletePickerTitle('Training block', '2026-11-17', '4:00 PM')).toBe('Add an athlete to Training block, Tue Nov 17, 4:00 PM');
    expect(C.ON_THIS_SESSION).toBe('On this session');
  });
});

describe('the add sheet', () => {
  test('the title, plain or full, and the summary', () => {
    expect(C.addTitle('Jordan', { full: false })).toBe('Add Jordan to this session?');
    expect(C.addTitle('Jordan', { full: true, taken: 14, capacity: 14 })).toBe('This session is full (14 of 14) - add anyway?');
    expect(C.addSummary('Jordan Whitfield', '2026-11-17', '4:00 PM', 'Training block')).toBe('Jordan Whitfield · Tue Nov 17, 4:00 PM · Training block');
  });

  test('the charge line, one per kind', () => {
    const line = (charge, opts) => C.chargeLine('Jordan', charge, opts);
    expect(line({ kind: 'period', left: 2, next: false, from: '2026-11-01' })).toBe("Uses 1 of Jordan's tokens for this period - 2 left.");
    expect(line({ kind: 'period', left: 5, next: true, from: '2026-12-01' })).toBe("Uses 1 of Jordan's tokens for next period (from Dec 1) - 5 left.");
    expect(line({ kind: 'grace', expiresAt: '2026-11-20' })).toBe("Uses Jordan's bonus token (good through Nov 20).");
    expect(line({ kind: 'grace', expiresAt: null })).toBe("Uses Jordan's bonus token.");
    expect(line({ kind: 'single', expiresAt: '2027-02-27' })).toBe("Uses one of Jordan's session tokens.");
    expect(line({ kind: 'single' })).toBe("Uses one of Jordan's session tokens.");
    expect(line({ kind: 'elite' })).toBe('Elite - nothing to use.');
    expect(line({ kind: 'unknown' })).toBe('Uses a token from that period if one is left.');
    expect(line({ kind: 'none', next: false })).toBe('Jordan has no tokens left for this period. Switch on Free to add anyway.');
    expect(line({ kind: 'none', next: true })).toBe('Jordan has no tokens left for next period. Switch on Free to add anyway.');
  });

  test('Free only, by pay state, even with the switch on; Free switched on', () => {
    const line = (charge, opts) => C.chargeLine('Jordan', charge, opts);
    expect(line({ kind: 'free-only', payState: 'unpaid' })).toBe("Jordan isn't paid up, so this booking is Free.");
    expect(line({ kind: 'free-only', payState: 'no-package' })).toBe("Jordan isn't paid up, so this booking is Free.");
    expect(line({ kind: 'free-only' })).toBe("Jordan isn't paid up, so this booking is Free.");
    expect(line({ kind: 'free-only', payState: 'past_due' }, { freeOn: true })).toBe("Jordan's membership is past due, so this booking is Free.");
    expect(line({ kind: 'free-only', payState: 'lapsed' })).toBe("Jordan's membership is lapsed, so this booking is Free.");
    expect(line({ kind: 'period', left: 2, next: false }, { freeOn: true })).toBe('Free - no token used.');
    expect(line({ kind: 'none', next: false }, { freeOn: true })).toBe('Free - no token used.');
    expect(C.FREE_LABEL).toBe('Free');
  });

  test('the warnings', () => {
    const line = (w) => C.warningLine('Jordan', w);
    expect(line({ kind: 'outside-window', through: '2026-12-31' })).toBe("Past Jordan's booking window - families can book through Dec 31.");
    expect(line({ kind: 'handicap-reserved', limit: 5, handicap: 9 })).toBe("Reserved for handicaps of 5 or better - Jordan's is 9.");
    expect(line({ kind: 'handicap-reserved', limit: 5, handicap: 0 })).toBe("Reserved for handicaps of 5 or better - Jordan's is 0.");
    expect(line({ kind: 'handicap-reserved', limit: 5, handicap: null })).toBe('Reserved for handicaps of 5 or better - Jordan has no handicap on file.');
    expect(line({ kind: 'one-per-day', type: 'training', date: '2026-11-17' })).toBe('Jordan already has a Training block on Tue Nov 17 - Elite includes one a day.');
    expect(line({ kind: 'one-per-day', type: 'tournament', date: '2026-11-21' })).toBe('Jordan already has a Tour event on Sat Nov 21 - Elite includes one a day.');
    expect(line({ kind: 'one-per-day', type: 'phil', date: '2026-11-17' })).toBe('Jordan already has a Phil session on Tue Nov 17 - Elite includes one a day.');
    expect(line({ kind: 'started', today: true, date: '2026-11-12' })).toBe('This session has already started.');
    expect(line({ kind: 'started', today: false, date: '2026-11-10' })).toBe('This session was on Tue Nov 10.');
    expect(line({ kind: 'waiting' })).toBe("Jordan is on this session's waitlist - adding takes Jordan off it.");
    expect(C.waitlistCountLine(3)).toBe('3 on the waitlist for this session.');
  });

  test('the buttons', () => {
    expect(C.addConfirmLabel('Jordan', {})).toBe('Add Jordan');
    expect(C.addConfirmLabel('Jordan', { free: true })).toBe('Add Jordan free');
    expect(C.addConfirmLabel('Jordan', { full: true, free: true })).toBe('Add anyway');
    expect(C.addConfirmLabel('Jordan', { busy: true, full: true })).toBe('Adding...');
    expect(C.BACK).toBe('Back');
  });
});

describe('the move sheet', () => {
  test('the title by kind', () => {
    expect(C.staffMoveTitle('Jordan', 'training')).toBe('Move Jordan to another Training block');
    expect(C.staffMoveTitle('Jordan', 'tournament')).toBe('Move Jordan to another Tour event');
    expect(C.staffMoveTitle('Jordan', 'phil')).toBe('Move Jordan to another Phil session');
  });

  test('the question, plain or full', () => {
    const from = { date: '2026-11-17', time: '4:00 PM' };
    const to = { date: '2026-11-19', time: '4:00 PM' };
    expect(C.staffMoveQuestion('Jordan', from, to, { full: false })).toBe('Move Jordan from Tue Nov 17, 4:00 PM to Thu Nov 19, 4:00 PM?');
    expect(C.staffMoveQuestion('Jordan', from, to, { full: true, taken: 12, capacity: 12 })).toBe('Thu Nov 19, 4:00 PM is full (12 of 12) - move Jordan anyway?');
  });

  test('the charge line, none for Elite; the buttons', () => {
    expect(C.moveChargeLine({ kind: 'carry' })).toBe('The token moves with it.');
    expect(C.moveChargeLine({ kind: 'swap', fromMonth: 'November', toMonth: 'December' })).toBe('Uses a December token; the November one comes back.');
    expect(C.moveChargeLine({ kind: 'free' })).toBe('Stays free.');
    expect(C.moveChargeLine({ kind: 'elite' })).toBeNull();
    expect([C.moveConfirmLabel({}), C.moveConfirmLabel({ full: true }), C.moveConfirmLabel({ busy: true, full: true })]).toEqual(['Move', 'Move anyway', 'Moving...']);
    expect(C.KEEP_IT).toBe('Keep it');
  });
});

describe('the success lines', () => {
  const add = (result, predicted = null) => C.addSuccessLine({ first: 'Jordan', date: '2026-11-17', time: '4:00 PM', result, predicted });
  const live = (over) => ({ bookingId: 'jordan_s2', comp: false, chargedFrom: 'period', graceTokenId: null, booked: 4, capacity: 12, overrides: [], ...over });

  test('one per charge', () => {
    expect(add(live())).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.');
    expect(add(live({ chargedFrom: 'grace', graceTokenId: 'g-1' }))).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - bonus token used.');
    expect(add(live({ chargedFrom: 'grace', graceTokenId: 'single_cs1' }))).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - session token used.');
    expect(add(live({ comp: true }))).toBe('Jordan is booked for Tue Nov 17, 4:00 PM, free.');
    expect(add(live({ chargedFrom: 'elite' }))).toBe('Jordan is booked for Tue Nov 17, 4:00 PM.');
  });

  test('an overfill says the new count', () => {
    expect(add(live({ booked: 15, capacity: 14 }))).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used. The session now has 15 of 14.');
    expect(add(live({ booked: 14, capacity: 14 }))).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.');
  });

  test('practice mode reads the predicted charge', () => {
    const sim = (over = {}) => ({ simulated: true, bookingId: 'jordan_s2', comp: false, chargedFrom: null, booked: null, capacity: null, overrides: [], ...over });
    expect(add(sim(), { kind: 'period', left: 2 })).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - 1 token used.');
    expect(add(sim(), { kind: 'grace' })).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - bonus token used.');
    expect(add(sim(), { kind: 'single' })).toBe('Jordan is booked for Tue Nov 17, 4:00 PM - session token used.');
    expect(add(sim(), { kind: 'elite' })).toBe('Jordan is booked for Tue Nov 17, 4:00 PM.');
    expect(add(sim({ comp: true }), { kind: 'period' })).toBe('Jordan is booked for Tue Nov 17, 4:00 PM, free.');
  });

  test('a move, and no answer', () => {
    expect(C.moveSuccessLine('Jordan', '2026-11-19', '4:00 PM')).toBe('Jordan moved to Thu Nov 19, 4:00 PM.');
    expect(C.STAFF_CHANGE_UNCONFIRMED).toBe("We couldn't confirm the change. Check the list before trying again.");
  });
});

describe('refusals', () => {
  const line = (reason, action = 'add', err = null) => C.staffRefusalLine(reason, { action, first: 'Jordan' }, err);
  const CALENDLY = "Yannick's 1:1s are booked and changed in Calendly.";

  test('every reason in staff words', () => {
    const table = [
      ['signed-out', 'You are signed out. Sign in and try again.'],
      ['not-staff', 'Only the owner or ops can change bookings here.'],
      ['bad-request', "That change wasn't complete. Try again."],
      ['athlete-missing', "That athlete isn't on file any more."],
      ['booking-missing', 'That booking no longer exists.'],
      ['no-household', 'Jordan has no family on file, so the booking would have nowhere to show.'],
      ['test-athlete', "Jordan is a test athlete and can't be booked onto real sessions."],
      ['session-missing', "That session isn't on the schedule any more."],
      ['calendly', CALENDLY],
      ['calendly-managed', CALENDLY],
      ['mental-no-move', CALENDLY],
      ['mental', CALENDLY],
      ['session-cancelled', 'The academy cancelled that session.'],
      ['session-hidden', 'That session is hidden from the schedule. Show it first, then add.'],
      ['display-only', "That session isn't booked through the portal."],
      ['period-over', "That session is in a billing period that's over."],
      ['already-booked', 'Jordan is already on that session.'],
      ['not-confirmed', 'This booking was already changed.'],
      ['attended', "This booking is marked attended, so it can't move."],
      ['different-type', 'Pick a session of the same kind.'],
      ['same-session', 'Pick a different session.'],
    ];
    for (const [reason, words] of table) expect([reason, line(reason)]).toEqual([reason, words]);
  });

  test('paying and tokens read by action', () => {
    expect(line('not-paid', 'add')).toBe("Jordan isn't paid up - switch on Free.");
    expect(line('membership-inactive', 'move')).toBe("Jordan's membership isn't active, so a paid booking can't move. Cancel it and add Free instead.");
    expect(line('not-paid', 'move')).toBe("Jordan's membership isn't active, so a paid booking can't move. Cancel it and add Free instead.");
    expect(line('no-tokens-left', 'move')).toBe('Jordan has no tokens left for that period. Cancel it and add Free instead.');
    expect(line('no-session-token', 'move')).toBe('Jordan has no tokens left for that period. Cancel it and add Free instead.');
    expect(line('no-tokens-left', 'add')).toBe('Jordan has no tokens left for that period. Switch on Free to add anyway.');
  });

  test("full gives the server's count; an unknown reason its own message; no reason, the unconfirmed line", () => {
    expect(line('full', 'add', { cause: { details: { reason: 'full', taken: 12, capacity: 12 } } })).toBe('That session is full (12 of 12).');
    expect(line('full', 'add')).toBe('That session is full.');
    expect(line('something-new', 'add', { message: 'The server said no.' })).toBe('The server said no.');
    expect(line(null, 'add', { message: 'raw' })).toBe("We couldn't confirm the change. Check the list before trying again.");
    expect(line(undefined, 'move')).toBe("We couldn't confirm the change. Check the list before trying again.");
  });

  test('refusalKind: what the sheet does', () => {
    const kinds = {
      full: ['full', 'full'],
      'no-tokens-left': ['none-row', 'end'],
      'no-session-token': ['none-row', 'end'],
      'not-paid': ['free-only', 'end'],
      'membership-inactive': ['end', 'end'],
      attended: ['end', 'end'],
      'not-confirmed': ['end', 'end'],
      'calendly-managed': ['end', 'end'],
      'mental-no-move': ['end', 'end'],
      mental: ['end', 'end'],
      'test-athlete': ['end', 'end'],
      'athlete-missing': ['end', 'end'],
      'booking-missing': ['end', 'end'],
      'something-new': ['end', 'end'],
    };
    for (const reason of ['session-missing', 'calendly', 'session-cancelled', 'session-hidden', 'display-only', 'period-over', 'already-booked', 'different-type', 'same-session']) {
      kinds[reason] = ['session', 'session'];
    }
    for (const [reason, [add, move]] of Object.entries(kinds)) {
      expect([reason, C.refusalKind(reason, 'add'), C.refusalKind(reason, 'move')]).toEqual([reason, add, move]);
    }
    expect(C.refusalKind(null, 'add')).toBe('unconfirmed');
    expect(C.refusalKind(undefined, 'move')).toBe('unconfirmed');
  });

  test('nothingChanged', () => {
    expect(C.nothingChanged('The academy cancelled that session.')).toBe('The academy cancelled that session. Nothing was changed.');
    expect(C.nothingChanged('Pick a different session')).toBe('Pick a different session. Nothing was changed.');
  });
});

describe('the copy rules', () => {
  // Every string the module makes, through every call above.
  const everyString = () => {
    const out = Object.values(C).filter((v) => typeof v === 'string');
    const charges = ['period', 'grace', 'single', 'elite', 'unknown', 'none', 'free-only'].map((kind) => ({ kind, left: 1, next: true, expiresAt: '2026-11-20' }));
    for (const c of charges) out.push(C.chargeLine('Jordan', c), C.chargeLine('Jordan', c, { freeOn: true }));
    for (const type of ['training', 'tournament', 'phil']) {
      out.push(C.staffMoveTitle('Jordan', type), C.warningLine('Jordan', { kind: 'one-per-day', type, date: '2026-11-21' }));
    }
    return out;
  };

  test('never "tournament" in what anyone reads', () => {
    for (const s of everyString()) expect(s.toLowerCase()).not.toContain('tournament');
  });

  test('Elite copy never mentions tokens', () => {
    const elite = [
      C.chargeLine('Jordan', { kind: 'elite' }),
      C.tokenLine({ payState: 'paid', tokens: { unlimited: true } }),
      C.addSuccessLine({ first: 'Jordan', date: '2026-11-17', time: '4:00 PM', result: { chargedFrom: 'elite', comp: false } }),
      C.warningLine('Jordan', { kind: 'one-per-day', type: 'training', date: '2026-11-17' }),
    ];
    for (const s of elite) expect(s.toLowerCase()).not.toContain('token');
  });

  test('Free copy never promises a token back', () => {
    const free = [
      C.chargeLine('Jordan', { kind: 'period' }, { freeOn: true }),
      C.chargeLine('Jordan', { kind: 'free-only', payState: 'unpaid' }),
      C.addSuccessLine({ first: 'Jordan', date: '2026-11-17', time: '4:00 PM', result: { comp: true } }),
      C.moveChargeLine({ kind: 'free' }),
    ];
    for (const s of free) expect(s.toLowerCase()).not.toMatch(/token (back|comes back|returned)/);
  });
});
