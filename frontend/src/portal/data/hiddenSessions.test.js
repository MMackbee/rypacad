import { HIDDEN_SESSION_LINE, SESSION_HIDDEN, isHiddenSession } from './hiddenSessions';

describe('isHiddenSession (owner 2026-11-05: the empty Mon/Wed 6 PM blocks, hidden for now)', () => {
  test('only hidden === true hides a session; absent, false or anything else is not hidden', () => {
    expect(isHiddenSession({ id: 'a', hidden: true })).toBe(true);
    for (const s of [{ id: 'a' }, { id: 'a', hidden: false }, { id: 'a', hidden: 'true' }, { id: 'a', hidden: 1 }, { id: 'a', hidden: null }, null, undefined]) {
      expect(isHiddenSession(s)).toBe(false);
    }
  });

  test('the typed reason and the line a stale screen shows', () => {
    expect(SESSION_HIDDEN).toBe('session-hidden');
    expect(HIDDEN_SESSION_LINE).toBe("That session isn't offered right now. Pick another time.");
  });
});
