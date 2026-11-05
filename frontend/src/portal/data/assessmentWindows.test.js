import {
  circuitDateProblem, consentStatus, daysBetween, dueStatus, inResearch, newWaveId, researchCountsFrom, seasonOf, staleOpen, toISODate, waveBlock,
  weeksBetween, windowIdFor,
} from './assessmentWindows';

const win = (kind, circuitDate, over = {}) => ({ id: `2026-27-${kind}`, season: '2026-27', kind, circuitDate, status: 'complete', ...over });

describe('seasons and window ids', () => {
  test('a season runs August to July', () => {
    expect(seasonOf('2026-11-03')).toBe('2026-27');
    expect(seasonOf('2027-02-27')).toBe('2026-27');
    expect(seasonOf('2027-07-31')).toBe('2026-27');
    expect(seasonOf('2027-08-01')).toBe('2027-28');
    expect(seasonOf('Nov 3')).toBeNull();
    expect(windowIdFor('2026-27', 'mid')).toBe('2026-27-mid');
  });
  test('day and week counts between two dates', () => {
    expect(daysBetween('2026-11-03', '2026-12-29')).toBe(56);
    expect(weeksBetween('2026-11-03', '2026-12-29')).toBe(8);
    expect(weeksBetween('2026-11-03', '2026-12-28')).toBe(7);
    expect(weeksBetween('2026-11-03', '2026-11-02')).toBeNull();
  });
});

describe('what is due (spec 5, list)', () => {
  test('never tested this season: baseline due', () => {
    expect(dueStatus([], '2026-11-03')).toMatchObject({ kind: 'baseline', kinds: ['baseline'], label: 'Baseline due', lastTestDate: null });
  });
  test('an open window is in progress for 14 days', () => {
    expect(dueStatus([win('baseline', '2026-11-03', { status: 'open' })], '2026-11-04')).toMatchObject({
      kind: 'baseline', kinds: ['baseline'], label: 'Baseline in progress', inProgress: true, stale: false, windowId: '2026-27-baseline',
    });
    expect(dueStatus([win('baseline', '2026-11-03', { status: 'open' })], '2026-11-17')).toMatchObject({ kind: 'baseline', stale: false });
  });
  test('an open window more than 14 days old is never re-waved: it reads "mark it complete" and blocks the wave', () => {
    const left = [win('baseline', '2026-11-03', { status: 'open' })];
    expect(dueStatus(left, '2026-11-18')).toMatchObject({
      kind: null, kinds: [], label: 'Open since Nov 3: mark it complete', inProgress: true, stale: true, windowId: '2026-27-baseline',
    });
    expect(waveBlock({ consent: 'yes', due: dueStatus(left, '2027-01-05') })).toBe('Open since Nov 3: mark it complete');
    expect(staleOpen(left[0], '2026-11-17')).toBe(false);
    expect(staleOpen(left[0], '2026-11-18')).toBe(true);
    expect(staleOpen(win('baseline', '2026-11-03'), '2027-01-05')).toBe(false);
  });
  test('mid-season is eligible 8 weeks after the baseline, and end of season may be chosen instead (late joiners)', () => {
    expect(dueStatus([win('baseline', '2026-11-03')], '2026-12-28')).toMatchObject({ kind: null, kinds: [], label: 'Mid-season from Dec 29', eligibleOn: '2026-12-29' });
    expect(dueStatus([win('baseline', '2026-11-03')], '2026-12-29')).toMatchObject({ kind: 'mid', kinds: ['mid', 'end'], label: 'Mid-season eligible', lastTestDate: '2026-11-03' });
  });
  test('a late joiner whose mid-season would leave no 8 weeks before the season end (Feb 27) defaults to end of season; mid-season stays a choice', () => {
    expect(dueStatus([win('baseline', '2026-12-15')], '2027-02-08')).toMatchObject({ kind: null, kinds: [], label: 'End of season from Feb 9', eligibleOn: '2027-02-09' });
    expect(dueStatus([win('baseline', '2026-12-15')], '2027-02-09')).toMatchObject({ kind: 'end', kinds: ['end', 'mid'], label: 'End of season' });
    expect(dueStatus([win('baseline', '2026-11-07')], '2027-01-02')).toMatchObject({ kind: 'mid', kinds: ['mid', 'end'] });
    expect(dueStatus([win('baseline', '2026-11-08')], '2027-01-03')).toMatchObject({ kind: 'end', kinds: ['end', 'mid'] });
  });
  test('end of season 8 weeks after mid-season; then the season is complete', () => {
    const done = [win('baseline', '2026-11-03'), win('mid', '2026-12-29')];
    expect(dueStatus(done, '2027-02-22')).toMatchObject({ kind: null, label: 'End of season from Feb 23' });
    expect(dueStatus(done, '2027-02-23')).toMatchObject({ kind: 'end', kinds: ['end'], label: 'End of season', lastTestDate: '2026-12-29' });
    expect(dueStatus([...done, win('end', '2027-02-24')], '2027-02-27')).toMatchObject({ kind: null, label: 'Season complete' });
  });
  test('last season does not count toward this one', () => {
    const old = { ...win('baseline', '2026-03-01'), id: '2025-26-baseline', season: '2025-26' };
    expect(dueStatus([old], '2026-11-03')).toMatchObject({ kind: 'baseline', lastTestDate: '2026-03-01' });
  });
});

describe('research consent and who can join a wave', () => {
  test('yes, no, or not answered', () => {
    expect(consentStatus({ consents: { research: { value: true } } })).toBe('yes');
    expect(consentStatus({ consents: { research: { value: false } } })).toBe('no');
    expect(consentStatus({ consents: {} })).toBe('unanswered');
    expect(consentStatus({ consents: { research: { value: 'yes' } } })).toBe('unanswered');
    expect(consentStatus(null)).toBe('unanswered');
  });
  test('the research answer never blocks a wave (owner 2026-11-05); not due says why', () => {
    const due = dueStatus([], '2026-11-03');
    expect(waveBlock({ consent: 'unanswered', due })).toBeNull();
    expect(waveBlock({ consent: 'unanswered', due: dueStatus([win('baseline', '2026-11-03')], '2026-11-10') })).toBe('Mid-season from Dec 29');
    expect(waveBlock({ consent: 'no', due })).toBeNull();
    expect(waveBlock({ consent: 'yes', due: dueStatus([win('baseline', '2026-11-03')], '2026-11-10') })).toBe('Mid-season from Dec 29');
  });
  test('research counts only from the date a yes was recorded', () => {
    const yes = { value: true, recordedAt: { toDate: () => new Date('2026-10-15T18:00:00Z') } };
    expect(researchCountsFrom(yes)).toBe('2026-10-15');
    expect(inResearch(yes, '2026-11-03')).toBe(true);
    expect(inResearch(yes, '2026-10-14')).toBe(false);
    expect(researchCountsFrom({ value: false, recordedAt: '2026-10-15T18:00:00Z' })).toBeNull();
    expect(inResearch(null, '2026-11-03')).toBe(false);
  });
  test('timestamps become the academy (Chicago) date', () => {
    expect(toISODate('2026-10-15T03:00:00Z')).toBe('2026-10-14');
    expect(toISODate(new Date('2026-10-15T18:00:00Z'))).toBe('2026-10-15');
    expect(toISODate(Date.UTC(2026, 9, 15, 18))).toBe('2026-10-15');
    expect(toISODate(null)).toBeNull();
    expect(toISODate('not a date')).toBeNull();
  });
});

describe('circuit dates and wave ids', () => {
  test('a circuit date is in the last 14 days and never in the future', () => {
    expect(circuitDateProblem('2026-11-03', '2026-11-03')).toBeNull();
    expect(circuitDateProblem('2026-10-20', '2026-11-03')).toBeNull();
    expect(circuitDateProblem('2026-10-19', '2026-11-03')).toBe('Pick a date in the last 14 days.');
    expect(circuitDateProblem('2026-11-04', '2026-11-03')).toBe("The circuit date can't be in the future.");
    expect(circuitDateProblem('', '2026-11-03')).toBe('Pick a date.');
  });
  test('a wave id names its date', () => {
    expect(newWaveId('2026-11-03', () => 0.5)).toBe('wave-2026-11-03-i');
    expect(newWaveId('2026-11-03')).toMatch(/^wave-2026-11-03-[a-z0-9]{1,5}$/);
  });
});

test('research counts by the answer in force on the circuit date: a later no keeps the yes before it', () => {
  const changed = { value: false, assent: false, recordedAt: '2026-11-10T15:00:00Z', history: [{ value: true, assent: true, recordedAt: '2026-10-15T15:00:00Z' }] };
  expect(inResearch(changed, '2026-11-03')).toBe(true);
  expect(inResearch(changed, '2026-11-20')).toBe(false);
  expect(inResearch(changed, '2026-10-01')).toBe(false);
  const later = { value: true, assent: true, recordedAt: '2026-12-01T15:00:00Z', history: [{ value: false, assent: false, recordedAt: '2026-10-15T15:00:00Z' }] };
  expect(inResearch(later, '2026-11-03')).toBe(false);
  expect(inResearch(later, '2026-12-01')).toBe(true);
});
