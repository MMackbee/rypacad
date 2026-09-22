/**
 * Session length (owner ruling, 2026-09-22): Saturday's 10-12 tournament and
 * 12-2 training are single TWO-HOUR events, each still costing one token. The
 * app had assumed 60 minutes everywhere, so these tests pin the shape the
 * generator produces, the sentence families read, and the formatter - the
 * three things that were wrong by an hour.
 */
import { DEFAULT_DURATION_MINUTES, SATURDAY_BLOCKS, generateSeason } from './schedule';
import { formatDuration } from './calendar';
import { WEEKLY_SCHEDULE, WEEKLY_SCHEDULE_LABEL } from '../tokens';

describe('Saturday is two long events, not four hours', () => {
  test('the block list is 9 AM, 10-12 and 12-2', () => {
    expect(SATURDAY_BLOCKS).toEqual([
      { time: '9:00 AM', type: 'training', durationMinutes: 60 },
      { time: '10:00 AM', type: 'tournament', durationMinutes: 120 },
      { time: '12:00 PM', type: 'training', durationMinutes: 120 },
    ]);
  });

  test('a generated Saturday carries those lengths', () => {
    // Sat 2026-11-07.
    const sat = generateSeason({ start: '2026-11-07', end: '2026-11-07' });
    expect(sat.map((s) => [s.time, s.type, s.durationMinutes])).toEqual([
      ['9:00 AM', 'training', 60],
      ['10:00 AM', 'tournament', 120],
      ['12:00 PM', 'training', 120],
      // The display-only adult block keeps the default; it is never booked.
      ['2:00 PM', 'adult', 60],
    ]);
  });

  test('a weekday block is still an hour', () => {
    // Mon 2026-11-02: four training blocks now (v2.0.3).
    const mon = generateSeason({ start: '2026-11-02', end: '2026-11-02' });
    expect(mon).toHaveLength(4);
    expect(new Set(mon.map((s) => s.durationMinutes))).toEqual(new Set([60]));
  });

  test('a holiday extra takes the default unless it names its own length', () => {
    const extras = generateSeason({
      start: '2026-11-26', end: '2026-11-26', closures: ['2026-11-26'],
      extras: [
        { date: '2026-11-26', time: '9:00 AM', type: 'tournament' },
        { date: '2026-11-26', time: '1:00 PM', type: 'tournament', durationMinutes: 180 },
      ],
    });
    expect(extras.map((s) => s.durationMinutes)).toEqual([DEFAULT_DURATION_MINUTES, 180]);
  });
});

describe('the weekly hours sentence', () => {
  test('Saturday reads to 2 PM, not 1 PM', () => {
    // The bug this guards: the sentence used to add one hour to the last
    // start, so a merged Saturday would have told families the academy shut
    // at 1 PM while the room was still in use.
    expect(WEEKLY_SCHEDULE_LABEL).toContain('Sat 9 AM-2 PM');
  });

  test('the weekdays read from their own first and last block', () => {
    expect(WEEKLY_SCHEDULE_LABEL).toContain('Mon/Wed 3-7 PM');
    expect(WEEKLY_SCHEDULE_LABEL).toContain('Tue/Thu 4-8 PM');
    expect(WEEKLY_SCHEDULE_LABEL).toContain('Fri 3-5 PM');
  });

  test('every day is a list of blocks with real lengths', () => {
    for (const [day, blocks] of Object.entries(WEEKLY_SCHEDULE)) {
      expect(Array.isArray(blocks)).toBe(true);
      for (const b of blocks) {
        expect(typeof b.start).toBe('number');
        expect(b.minutes).toBeGreaterThan(0);
        expect(`${day} ${b.minutes % 30}`).toBe(`${day} 0`);
      }
    }
    expect(WEEKLY_SCHEDULE.Saturday.map((b) => b.minutes)).toEqual([60, 120, 120]);
  });
});

describe('how a length is written', () => {
  test('reads the way a person says it', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(60)).toBe('1 hr');
    expect(formatDuration(90)).toBe('1 hr 30 min');
    expect(formatDuration(120)).toBe('2 hr');
    expect(formatDuration(150)).toBe('2 hr 30 min');
  });

  test('nothing sensible to say means nothing is said', () => {
    expect(formatDuration(0)).toBeNull();
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(undefined)).toBeNull();
    expect(formatDuration('abc')).toBeNull();
    expect(formatDuration(-30)).toBeNull();
  });
});
