# Frontend - Sprint 20 Implementation Plan (part 3 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is part 3.** Header, Global Constraints, the Day-2 sequencing note and the list of names not in the contract live in `20-frontend.md`; every constraint there applies here. Part 3 consumes `renderScreen` (Task 1), `reasonCopy`/`CALENDLY_MANAGED_COPY` (Task 1), `PayButton` (Task 6) and `data/billingCopy.js` (Task 8).

---

### Task 11: SpecialistBooking - Book with Yannick (Calendly) + real durations (closes part of #10) (MAY SLIP - Oct 10)

**Files:**
- Create: `frontend/src/portal/data/specialistGate.js`, `frontend/src/portal/components/CalendlyPanel.js`
- Modify: `frontend/src/portal/screens/SpecialistBooking.js:25-33,212-233,326-360,517-552,561-608`
- Test: `frontend/src/portal/data/specialistGate.test.js`, `frontend/src/portal/screens/SpecialistBooking.test.js`

**Interfaces:**
- Consumes: `useSpecialistSlots(id, { athleteId }).data -> { days, tokens, capReached, bookingMode: 'in-app' | 'calendly', calendlyUrl, billingStatus, bookingOpen, athlete: { id, name, loginEmail }, guardian: { name, email }, householdId }` with slots carrying `durationMinutes` (contract 4.3, `householdId` per D9); `householdId` for `utm_campaign` from the same payload (D9 - `useSpecialistSlots().data.householdId` is in the contract for both the parent and the athlete caller; read as `slotsState.data?.householdId ?? null`, never from `useMembership`, which stays only for the booking window); `calendlyLinkFor`, `CALENDLY_NOTE` from `data/calendly.js` (contract 3.4); `reasonCopy`, `capReachedCopy` (Task 1); `formatDuration` (`calendar.js:76`).
- Produces (new, not in contract): `calendlyBlockReason({ billingStatus, bookingOpen, tokens, capReached }) -> null | 'billing-pending' | 'membership-inactive' | 'booking-not-open' | 'cap-reached' | 'no-tokens-left'`; `attendeeContact({ attendee, athlete, guardian }) -> { name, email }`; `CalendlyPanel({ data, tokens, capReached, attendee, onAttendee, householdId, open })` where `open(url)` defaults to `window.open(url, '_blank', 'noopener')`.

- [ ] **Step 1: Write the failing gate test**

`frontend/src/portal/data/specialistGate.test.js`:
```js
import { attendeeContact, calendlyBlockReason } from './specialistGate';

const ok = { billingStatus: 'active', bookingOpen: true, tokens: { left: 2, unlimited: false, grace: [] }, capReached: false };
test('gate order: billing, open, cadence, tokens (spec 6.1)', () => {
  expect(calendlyBlockReason(ok)).toBeNull();
  expect(calendlyBlockReason({ ...ok, billingStatus: 'pending' })).toBe('billing-pending');
  expect(calendlyBlockReason({ ...ok, billingStatus: 'past_due' })).toBe('membership-inactive');
  expect(calendlyBlockReason({ ...ok, billingStatus: undefined })).toBeNull();
  expect(calendlyBlockReason({ ...ok, bookingOpen: false })).toBe('booking-not-open');
  expect(calendlyBlockReason({ ...ok, capReached: true })).toBe('cap-reached');
  expect(calendlyBlockReason({ ...ok, tokens: { left: 0, unlimited: false, grace: [] } })).toBe('no-tokens-left');
  expect(calendlyBlockReason({ ...ok, tokens: { left: 0, unlimited: false, grace: [{ id: 'g' }] } })).toBeNull();
  expect(calendlyBlockReason({ ...ok, tokens: { left: null, unlimited: true, grace: [] } })).toBeNull();
});
test("the attendee's own name and email go to Calendly", () => {
  const athlete = { id: 'a1', name: 'Jordan', loginEmail: null };
  const guardian = { name: 'Dana', email: 'dana@email.com' };
  expect(attendeeContact({ attendee: 'parent', athlete, guardian })).toEqual({ name: 'Dana', email: 'dana@email.com' });
  expect(attendeeContact({ attendee: 'athlete', athlete, guardian })).toEqual({ name: 'Jordan', email: 'dana@email.com' });
  expect(attendeeContact({ attendee: 'athlete', athlete: { ...athlete, loginEmail: 'j@email.com' }, guardian })).toEqual({ name: 'Jordan', email: 'j@email.com' });
});
```

- [ ] **Step 2: Run it** - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `data/specialistGate.js`**

```js
/** Why the Calendly button is hidden (spec 6.1: paid, open, a token left or Elite, cadence not hit). PURE. */
export function calendlyBlockReason({ billingStatus, bookingOpen, tokens, capReached }) {
  const billing = billingStatus ?? 'active';
  if (billing === 'pending') return 'billing-pending';
  if (billing !== 'active') return 'membership-inactive';
  if (!bookingOpen) return 'booking-not-open';
  if (capReached) return 'cap-reached';
  if (tokens && !tokens.unlimited && tokens.left === 0 && !(tokens.grace && tokens.grace.length)) return 'no-tokens-left';
  return null;
}

/** Whose name/email Calendly prefills: the person walking in (contract 3.4). */
export function attendeeContact({ attendee, athlete, guardian }) {
  if (attendee === 'parent') return { name: guardian?.name ?? '', email: guardian?.email ?? '' };
  return { name: athlete?.name ?? '', email: athlete?.loginEmail || guardian?.email || '' };
}
```

- [ ] **Step 4: Run it** - Expected: PASS.

- [ ] **Step 5: Write the failing screen test**

`frontend/src/portal/screens/SpecialistBooking.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import SpecialistBooking from './SpecialistBooking';

let mockSlots;
jest.mock('../hooks', () => ({
  seedSpecialistDays: () => [],
  useSpecialistSlots: () => mockSlots,
  useBooking: () => ({ book: async () => ({}) }),
  useHouseholdAthletes: () => ({ data: [], loading: false }),
  useMembership: () => ({ data: { household: { id: 'h1' }, members: [] } }),
}));
jest.mock('../data/calendly', () => ({
  calendlyUrlFor: () => 'https://calendly.com/ryp/mental',
  calendlyLinkFor: ({ url, athleteId, athleteName, householdId, name, email }) =>
    `${url}?${new URLSearchParams({ name, email, a1: athleteName, utm_content: athleteId, utm_campaign: householdId })}`,
  CALENDLY_NOTE: "Yannick's confirmation, reminders and cancellations come from Calendly. The session appears on My Schedule within a minute and spends one token.",
}), { virtual: true });

beforeEach(() => {
  mockSlots = { loading: false, error: null, data: {
    days: [], tokens: { left: 3, unlimited: false, grace: [] }, capReached: false,
    bookingMode: 'calendly', calendlyUrl: 'https://calendly.com/ryp/mental', billingStatus: 'active', bookingOpen: true,
    athlete: { id: 'a1', name: 'Jordan', loginEmail: null }, guardian: { name: 'Dana', email: 'dana@email.com' }, householdId: 'h1',
  } };
});

test('Book with Yannick opens the prefilled link in a new tab, with the note', async () => {
  const opened = [];
  window.open = (url, target, features) => { opened.push([url, target, features]); return null; };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  await r.click('Book with Yannick');
  expect(opened[0][1]).toBe('_blank');
  expect(opened[0][0]).toContain('utm_content=a1');
  expect(opened[0][0]).toContain('name=Jordan');
  await r.click('A parent');
  await r.click('Book with Yannick');
  expect(opened[1][0]).toContain('name=Dana');
  expect(r.text()).toContain('The session appears on My Schedule within a minute and spends one token.');
  await r.unmount();
});

test('gated copy replaces the button', async () => {
  mockSlots.data.billingStatus = 'pending';
  const p = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(p.button('Book with Yannick')).toBeNull();
  expect(p.text()).toContain('Payment pending - finish checkout to start booking');
  await p.unmount();
  mockSlots.data.billingStatus = 'active';
  mockSlots.data.bookingOpen = false;
  const g = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(g.text()).toContain('Booking opens Sat, Oct 10 at 7 AM');
  await g.unmount();
});

test('no Calendly url: the in-app slot list with real durations', async () => {
  mockSlots.data = { ...mockSlots.data, bookingMode: 'in-app', calendlyUrl: null,
    days: [{ date: '2026-11-04', dayLabel: 'Wed, Nov 4', slots: [{ sessionId: 's1', time: '4:00 PM', open: true, capacity: 1, booked: 0, durationMinutes: 30 }] }] };
  const r = await renderScreen(<SpecialistBooking bare initialSpecialist="mental" />);
  expect(r.button('Book with Yannick')).toBeNull();
  expect(r.text()).toContain('30 min');
  expect(r.text()).not.toContain('45 min');
  await r.unmount();
});
```

- [ ] **Step 6: Run it** - Expected: FAIL.

- [ ] **Step 7: Implement `components/CalendlyPanel.js`**

```js
import React from 'react';
import { color, font, radius, tint } from '../tokens';
import Button from './Button';
import { capReachedCopy, reasonCopy } from './BookingReasons';
import { Banner, Body, Card, SectionLabel } from './Primitives';
import { calendlyLinkFor, CALENDLY_NOTE } from '../data/calendly';
import { attendeeContact, calendlyBlockReason } from '../data/specialistGate';

/** Yannick via Calendly (spec 6.1): one button, gated exactly like an in-app booking, opening a prefilled link in a new tab. */
export default function CalendlyPanel({ data, tokens, capReached, attendee, onAttendee, householdId, open = (url) => window.open(url, '_blank', 'noopener') }) {
  const reason = calendlyBlockReason({ billingStatus: data.billingStatus, bookingOpen: data.bookingOpen, tokens, capReached });
  const contact = attendeeContact({ attendee, athlete: data.athlete, guardian: data.guardian });
  const link = calendlyLinkFor({ url: data.calendlyUrl, athleteId: data.athlete?.id ?? '', athleteName: data.athlete?.name ?? '', householdId: householdId ?? '', ...contact });
  return (
    <Card large>
      <SectionLabel>Who is attending?</SectionLabel>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {[['athlete', 'The athlete'], ['parent', 'A parent']].map(([value, label]) => {
          const on = attendee === value;
          return (
            <button key={value} type="button" aria-pressed={on} onClick={() => onAttendee(value)}
              style={{ flex: 1, minHeight: 44, cursor: 'pointer', borderRadius: radius.input, border: `1px solid ${on ? color.primary : color.controlBorder}`, background: on ? tint.green : 'transparent', color: on ? color.primary : color.textSecondary, font: `600 13px ${font.body}` }}>
              {label}
            </button>
          );
        })}
      </div>
      {reason ? (
        <Banner tone="yellow" title="Not yet" style={{ marginTop: 14 }}>{reason === 'cap-reached' ? capReachedCopy() : reasonCopy(reason)}</Banner>
      ) : (
        <Button height={50} onClick={() => open(link)} style={{ marginTop: 14 }}>Book with Yannick</Button>
      )}
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 10 }}>{CALENDLY_NOTE}</Body>
    </Card>
  );
}
```

- [ ] **Step 8: Wire SpecialistBooking**

Imports: `import CalendlyPanel from '../components/CalendlyPanel';`, and line 32 becomes `import { formatDuration, longDayLabel, openThrough, todayISO } from '../data/calendar';`. After line 233 (`const blocked = tokensSpent || capReached;`):
```js
  // Sprint 20 (spec 6.1): Yannick books through Calendly when the hook says so
  // (SPECIALISTS.mental.bookingMode === 'calendly' AND a URL is configured);
  // anything else - Phil, the seed, an emulator with no URL - keeps the slot
  // list. `householdId` is the hook's own (contract 4.3 as amended by D9: the
  // slots payload carries it for both the parent and the athlete caller).
  const calendly = specialistId === 'mental' && slotsState.data?.bookingMode === 'calendly' && Boolean(slotsState.data?.calendlyUrl);
  const householdId = slotsState.data?.householdId ?? null;
```
The loaded branch (`:325-360`, the last arm of the `!specialist ? ... : loading ? ... : error ? ... :` chain) is replaced in full by:
```js
        ) : (
          <>
            <div style={{ padding: '0 22px' }}>
              <SpecialistHeader specialist={specialist} />
            </div>
            <div style={{ padding: '0 22px' }}>
              <EntitlementSummary
                specialistId={specialistId}
                tokens={tokens}
                capReached={capReached}
                onSeeMembership={() => navigate('/portal/membership')}
              />
            </div>
            {calendly ? (
              <div style={{ padding: '0 22px' }}>
                <CalendlyPanel
                  data={slotsState.data}
                  tokens={tokens}
                  capReached={capReached}
                  attendee={attendee}
                  onAttendee={setAttendee}
                  householdId={householdId}
                />
              </div>
            ) : (
              <>
                <div style={{ padding: '0 22px' }}>
                  <DayStrip days={days} selectedDate={selectedDate} onSelect={setSelectedDate} />
                </div>
                {selectedDateLocked ? (
                  <div style={{ padding: '0 22px' }}>
                    <LockedDayNotice date={selectedDate} windowDays={windowDays} />
                  </div>
                ) : (
                  <div style={{ padding: '0 22px', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <SlotList
                      day={selectedDay}
                      specialist={specialist}
                      disabled={disabledForNoAthlete || blocked}
                      reserving={reserving}
                      onSelect={(slot, date) => {
                        setFailure(null);
                        setSheetSlot({ ...slot, date });
                      }}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
```
(`EntitlementSummary` stays above both branches - the same token note the Calendly button and the slot list share. Task 15 adds the Oct 10 banner inside the in-app `<>` fragment.)

`SlotList` (`:536`): `meta="45 min"` becomes `meta={formatDuration(slot.durationMinutes)}`. `DetailSheet` (`:607`): `{time} {meridiem} · 45 min` becomes `{time} {meridiem} · {formatDuration(slot.durationMinutes)}`. The `SlotList` doc comment's "time, 45 min, and the spot state" (`:503`) becomes "time, the slot's real duration, and the spot state".

- [ ] **Step 9: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/SpecialistBooking.test.js` - Expected: PASS (3 tests). `grep -n "45 min" frontend/src/portal/screens/SpecialistBooking.js` prints nothing.

- [ ] **Step 10: Commit**
```bash
git add frontend/src/portal/data/specialistGate.js frontend/src/portal/data/specialistGate.test.js frontend/src/portal/components/CalendlyPanel.js frontend/src/portal/screens/SpecialistBooking.js frontend/src/portal/screens/SpecialistBooking.test.js
git commit -m "feat(coaching): Book with Yannick via Calendly, gated like a booking; real slot durations (#10)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Calendly rows are not cancellable in-app - MySchedule and Reservations (closes rest of #10) (MAY SLIP - Oct 10)

**Files:**
- Modify: `frontend/src/portal/screens/MySchedule.js:6,285-309`, `frontend/src/portal/screens/Reservations.js:10,192-215`
- Test: `frontend/src/portal/screens/MySchedule.test.js`, `frontend/src/portal/screens/Reservations.test.js`

**Interfaces:**
- Consumes: schedule/reservation rows gain `source: 'portal' | 'calendly'` and `cancellable` false for Calendly (contract 4.4); `CALENDLY_MANAGED_COPY` (Task 1).
- Produces: rows with `source === 'calendly'` render the copy in place of Cancel.

- [ ] **Step 1: Write the failing tests**

`frontend/src/portal/screens/MySchedule.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import MySchedule from './MySchedule';

const row = (over) => ({ id: 's1', sessionId: 's1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false, time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', meta: '30 min', status: 'confirmed', bookingId: 'b1', cancellable: true, source: 'portal', ...over });
let mockRows;
jest.mock('../hooks', () => ({ useSchedule: () => ({ data: { sessions: mockRows, past: [], cancelled: null, tokens: null }, loading: false, error: null, cancel: async () => {} }) }));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: async () => {} }));

test('a Calendly row says to cancel from the email; a portal row keeps Cancel', async () => {
  mockRows = [row({ source: 'calendly', cancellable: false }), row({ id: 's2', sessionId: 's2', bookingId: 'b2', date: '2026-11-12', dayLabel: 'Thu, Nov 12' })];
  const r = await renderScreen(<MySchedule bare />);
  expect(r.text()).toContain("Cancel or reschedule from Calendly's email");
  expect([...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(1);
  await r.unmount();
});
```
`frontend/src/portal/screens/Reservations.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import Reservations from './Reservations';

const row = (over) => ({
  id: 's1', sessionId: 's1', bookingId: 'b1', date: '2026-11-10', dayLabel: 'Tue, Nov 10', isToday: false,
  time: '4:00', meridiem: 'PM', type: 'mental', name: 'Mental game session · Yannick', durationMinutes: 30,
  instructor: null, status: 'confirmed', cancellable: true, nextPeriod: false, source: 'portal', ...over,
});
let mockRows;
jest.mock('../hooks', () => ({
  useHouseholdReservations: () => ({
    data: { members: [{ athleteId: 'a1', name: 'Jordan', upcoming: mockRows, past: [] }] },
    loading: false,
    error: null,
    cancel: async () => {},
  }),
}));
jest.mock('../hooks/waitlist', () => ({ leaveWaitlist: async () => {} }));

test('a Calendly row says to cancel from the email; a portal row keeps Cancel', async () => {
  mockRows = [
    row({ source: 'calendly', cancellable: false }),
    row({ id: 's2', sessionId: 's2', bookingId: 'b2', date: '2026-11-12', dayLabel: 'Thu, Nov 12' }),
  ];
  const r = await renderScreen(<Reservations bare />);
  expect(r.text()).toContain("Cancel or reschedule from Calendly's email");
  expect([...r.container.querySelectorAll('button')].filter((b) => b.textContent.trim() === 'Cancel reservation')).toHaveLength(1);
  expect(r.text()).toContain('30 min');
  await r.unmount();
});

test('a row without source (routing Task 11 not merged) behaves as a portal row', async () => {
  mockRows = [row({ source: undefined })];
  const r = await renderScreen(<Reservations bare />);
  expect(r.text()).not.toContain("Cancel or reschedule from Calendly's email");
  expect(r.button('Cancel reservation')).not.toBeNull();
  await r.unmount();
});
```


- [ ] **Step 2: Run them** - Expected: FAIL (the Calendly row renders nothing where Cancel would be).

- [ ] **Step 3: Implement** - in both screens import `CALENDLY_MANAGED_COPY` from `../components/BookingReasons` (extend the existing `cancelReasonCopy` import) and, in the `action` ternary, insert before the `dayOf` branch:
```js
                    ) : s.source === 'calendly' ? (
                      <Body size={11} tone={color.textTertiary}>{CALENDLY_MANAGED_COPY}</Body>
```
(`item.source` in Reservations). `Body` is already imported in both files.

- [ ] **Step 4: Run them** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/MySchedule.test.js src/portal/screens/Reservations.test.js` - Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/portal/screens/MySchedule.js frontend/src/portal/screens/MySchedule.test.js frontend/src/portal/screens/Reservations.js frontend/src/portal/screens/Reservations.test.js
git commit -m "feat(schedule): Calendly-sourced rows say cancel from Calendly's email (#10)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Admin sign-ups report, dashboard Sign-ups card, admin hidden from mental (closes #11) (MAY SLIP - Oct 10: the report; the role change ships day 1)

**Files:**
- Create: `frontend/src/portal/data/signupsReport.js`, `frontend/src/portal/screens/AdminSignups.js`
- Modify: `frontend/src/portal/screens/AdminDashboard.js:1-33,86-95,125,152-155,169-339,488-499`, `frontend/src/portal/components/BottomTabBar.js:85-89`, `frontend/src/portal/PortalRoutes.js:301-353,740-757`
- Test: `frontend/src/portal/data/signupsReport.test.js`, `frontend/src/portal/screens/AdminSignups.test.js`, `frontend/src/portal/screens/AdminDashboard.test.js`, `frontend/src/portal/screens/AdminDashboard.fallback.test.js`

**Interfaces:**
- Consumes: `useSignups() -> { data: { rows, counts: { all, unpaid, flagged, unresolved }, unresolved: [{ id, outcome, receivedAt }] } | null, loading, error }` re-exported from `hooks/index.js` (contract 4.2 as amended by D9; row shape there; `unresolved` = Calendly events the webhook could not tie to a household, so they have no row); `useAdminDashboard().data.membership.pending` (contract 3.5); `Segmented` (`components/Segmented.js`, `options` prop of `[key, label]` pairs); `longDayLabel`. **D1**: routing owns `frontend/src/portal/data/signups.js` (`buildSignupRows`, the row BUILDER) - this lane's module is `data/signupsReport.js` (the row COPY); the two never share a name.
- Produces (new, not in contract): `data/signupsReport.js` exports `SIGNUP_FILTERS = [['all','All'],['unpaid','Unpaid'],['flagged','Flagged']]`, `filterSignupRows(rows, filter)`, `flaggedCount(counts)` (flagged households + unmatched Calendly bookings, D16), `athleteLine(a)`, `paymentLabel(a)`, `loginLabel(a)`, `flagLabel(f)`, `unresolvedLabel(e)`, `signedUpLabel(iso)`; `AdminSignups({ bare, role, onBack, onOpenHousehold })` rendering an "Unmatched Calendly bookings" card on the All and Flagged views; `AdminDashboard` prop `onOpenSignups`; `AdminDashboard.js#useSignupsFallback` / `AdminSignups.js#useSignupsFallback` (the D14 guard, `20-frontend.md` "Day-2 sequencing"); `PortalRoutes.js#SignupsRoute`; `/portal/admin` roles `['ops', 'owner']`.

- [ ] **Step 1: Write the failing helper test**

`frontend/src/portal/data/signupsReport.test.js`:
```js
import {
  athleteLine, filterSignupRows, flagLabel, flaggedCount, loginLabel, paymentLabel, signedUpLabel, unresolvedLabel,
} from './signupsReport';

const rows = [{ householdId: 'h1', unpaid: true, flagged: false }, { householdId: 'h2', unpaid: false, flagged: true }, { householdId: 'h3', unpaid: false, flagged: false }];
test('filters', () => {
  expect(filterSignupRows(rows, 'all').map((r) => r.householdId)).toEqual(['h1', 'h2', 'h3']);
  expect(filterSignupRows(rows, 'unpaid').map((r) => r.householdId)).toEqual(['h1']);
  expect(filterSignupRows(rows, 'flagged').map((r) => r.householdId)).toEqual(['h2']);
});
test('the Flagged count folds in unmatched Calendly bookings (D16)', () => {
  expect(flaggedCount({ all: 3, unpaid: 1, flagged: 1, unresolved: 2 })).toBe(3);
  expect(flaggedCount({ all: 3, unpaid: 1, flagged: 1 })).toBe(1);
  expect(flaggedCount(null)).toBe(0);
  expect(unresolvedLabel({ id: 'ev-1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' })).toBe('Calendly unresolved · 2026-11-05');
});
test('row lines (spec 7)', () => {
  const a = { name: 'Jordan', age: 14, packageName: '12 tokens', handicap: 12, billing: 'pending', facility: null, login: 'invited-stale', loginEmail: 'j@email.com', loginClaimedAt: null };
  expect(athleteLine(a)).toBe('Jordan · 14 · 12 tokens · hcp 12');
  expect(athleteLine({ ...a, age: null, handicap: null, packageName: null })).toBe('Jordan · no package · no handicap');
  expect(paymentLabel(a)).toBe('Payment pending');
  expect(paymentLabel({ ...a, billing: 'active', facility: 'active' })).toBe('Paid · facility active');
  expect(loginLabel(a)).toBe('Login: invited 7+ days ago (j@email.com)');
  expect(loginLabel({ ...a, login: 'none', loginEmail: null })).toBe('Login: none');
  expect(loginLabel({ ...a, login: 'claimed', loginClaimedAt: '2026-10-02T09:00' })).toMatch(/^Login: claimed .*Oct/);
  expect(flagLabel({ kind: 'booking', id: 'b1', flag: 'over-cap', date: '2026-11-05' })).toBe('Booking over-cap · 2026-11-05');
  expect(flagLabel({ kind: 'calendly', id: 'c1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' })).toBe('Calendly unresolved · 2026-11-05');
  expect(signedUpLabel('2026-10-01T14:05')).toMatch(/Oct/);
  expect(signedUpLabel(null)).toBe('—');
});
```

- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/signupsReport.test.js` - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `data/signupsReport.js`**

```js
/**
 * The sign-ups report's row COPY (Sprint 20, spec 7) - PURE, over the rows
 * useSignups() returns. Routing's data/signups.js BUILDS the rows
 * (buildSignupRows); this file only turns them into strings and filters,
 * which is why it is a different module (D1).
 */
import { longDayLabel } from './calendar';

export const SIGNUP_FILTERS = [['all', 'All'], ['unpaid', 'Unpaid'], ['flagged', 'Flagged']];

export function filterSignupRows(rows, filter) {
  if (filter === 'unpaid') return (rows || []).filter((r) => r.unpaid);
  if (filter === 'flagged') return (rows || []).filter((r) => r.flagged);
  return rows || [];
}

/** The Flagged pill's number: flagged households PLUS unmatched Calendly bookings, which have no household row (D16). */
export function flaggedCount(counts) {
  if (!counts) return 0;
  return (counts.flagged ?? 0) + (counts.unresolved ?? 0);
}

export function athleteLine(a) {
  return [a.name, a.age != null ? String(a.age) : null, a.packageName || 'no package', a.handicap != null ? `hcp ${a.handicap}` : 'no handicap'].filter(Boolean).join(' · ');
}

const BILLING = { pending: 'Payment pending', active: 'Paid', past_due: 'Past due', lapsed: 'Lapsed' };
export function paymentLabel(a) {
  const base = BILLING[a.billing] || 'Paid';
  return a.facility ? `${base} · facility ${a.facility}` : base;
}

export function loginLabel(a) {
  if (a.login === 'claimed') {
    const day = a.loginClaimedAt ? String(a.loginClaimedAt).slice(0, 10) : null;
    return day ? `Login: claimed ${longDayLabel(day)}` : 'Login: claimed';
  }
  if (a.login === 'invited-stale') return `Login: invited 7+ days ago (${a.loginEmail})`;
  if (a.login === 'invited') return `Login: invited (${a.loginEmail})`;
  return 'Login: none';
}

export function flagLabel(f) {
  if (f.kind === 'calendly') return `Calendly ${f.outcome} · ${String(f.receivedAt || '').slice(0, 10)}`;
  return `Booking ${f.flag} · ${f.date}`;
}

/** One line per unmatched Calendly event (useSignups().data.unresolved) - the same shape flagLabel renders inside a row. */
export function unresolvedLabel(e) {
  return flagLabel({ kind: 'calendly', id: e.id, outcome: e.outcome, receivedAt: e.receivedAt });
}

export function signedUpLabel(iso) {
  if (!iso) return '—';
  const day = String(iso).slice(0, 10);
  const time = String(iso).slice(11, 16);
  return time ? `${longDayLabel(day)} ${time}` : longDayLabel(day);
}
```

- [ ] **Step 4: Run it** - Expected: PASS (3 tests).

- [ ] **Step 5: Write the failing screen tests**

`frontend/src/portal/screens/AdminSignups.test.js` (the `Segmented` pills read `All · 2` / `Unpaid · 1` / `Flagged · 2`, so the clicks use the full label; the household row is a `role="button"` div with `aria-label={row.name}`, which `renderScreen.button()` resolves):
```js
import React from 'react';
import { renderScreen } from './testRender';
import AdminSignups from './AdminSignups';

let mockSignups;
jest.mock('../hooks', () => ({ useSignups: () => mockSignups }));
beforeEach(() => {
  mockSignups = { loading: false, error: null, data: {
    counts: { all: 2, unpaid: 1, flagged: 1, unresolved: 1 },
    unresolved: [{ id: 'c9', outcome: 'unresolved', receivedAt: '2026-11-06T09:00' }],
    rows: [
      { householdId: 'h1', name: 'Whitfield family', signedUpAt: '2026-10-01T14:05', mode: 'parent', parent: { name: 'Dana', email: 'dana@email.com', phone: '612' },
        athletes: [{ athleteId: 'a1', name: 'Jordan', age: 14, packageId: 't-12', packageName: '12 tokens', handicap: 12, billing: 'pending', facility: null, login: 'none', loginEmail: null, loginClaimedAt: null }], flags: [], unpaid: true, flagged: false },
      { householdId: 'h2', name: 'Eisele family', signedUpAt: '2026-10-01T15:00', mode: 'athlete', parent: { name: 'Sam', email: 's@email.com', phone: '1' },
        athletes: [{ athleteId: 'a2', name: 'Sam', age: 19, packageId: 'elite', packageName: 'Elite', handicap: null, billing: 'active', facility: null, login: 'none', loginEmail: null, loginClaimedAt: null }],
        flags: [{ kind: 'calendly', id: 'c1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' }], unpaid: false, flagged: true },
    ],
  } };
});

test('rows, filters, the unmatched Calendly card and the household tap', async () => {
  const opened = [];
  const r = await renderScreen(<AdminSignups bare role="owner" onOpenHousehold={(id) => opened.push(id)} />);
  expect(r.text()).toContain('Jordan · 14 · 12 tokens · hcp 12');
  expect(r.text()).toContain('Payment pending');
  expect(r.text()).toContain('Calendly unresolved · 2026-11-05');
  // D16: one flagged household + one unmatched booking = Flagged · 2.
  expect(r.button('Flagged · 2')).not.toBeNull();
  expect(r.text()).toContain('Unmatched Calendly bookings · 1');
  expect(r.text()).toContain('Calendly unresolved · 2026-11-06');
  await r.click('Unpaid · 1');
  expect(r.text()).toContain('Whitfield family');
  expect(r.text()).not.toContain('Eisele family');
  expect(r.text()).not.toContain('Unmatched Calendly bookings');
  await r.click('Flagged · 2');
  expect(r.text()).toContain('Eisele family');
  expect(r.text()).not.toContain('Whitfield family');
  expect(r.text()).toContain('Unmatched Calendly bookings · 1');
  await r.click('Eisele family');
  expect(opened).toEqual(['h2']);
  await r.unmount();
});

test('nothing unmatched: no card, Flagged counts households only', async () => {
  mockSignups.data = { ...mockSignups.data, counts: { all: 2, unpaid: 1, flagged: 1, unresolved: 0 }, unresolved: [] };
  const r = await renderScreen(<AdminSignups bare role="owner" />);
  expect(r.button('Flagged · 1')).not.toBeNull();
  expect(r.text()).not.toContain('Unmatched Calendly bookings');
  await r.unmount();
});
```
`frontend/src/portal/screens/AdminDashboard.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({ data: { outstanding: [], metrics: { enrolled: 3, enrolledLabel: 'enrolled athletes', fill: '50%', fillLabel: 'fill' }, enrollment: [], blockFill: [], membership: { active: 2, pastDue: 0, lapsed: 0, pending: 1, lapsedHouseholds: [] } } }),
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 2, unpaid: 1, flagged: 0, unresolved: 1 }, unresolved: [{ id: 'c9', outcome: 'unresolved', receivedAt: '2026-11-06T09:00' }], rows: [] } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));

test('the Sign-ups card replaces the enrollment queue; Pending is a stat; unmatched bookings count as flagged', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenSignups={() => opened.push(1)} />);
  expect(r.text()).toContain('Sign-ups · 1 unpaid');
  expect(r.text()).toContain('2 self-signed households · 1 flagged');
  expect(r.text()).not.toContain('Enrollment queue');
  expect(r.text()).toContain('Pending');
  expect(r.text()).not.toContain('Approve');
  await r.click('Open sign-ups');
  expect(opened).toEqual([1]);
  await r.unmount();
});
```
`frontend/src/portal/screens/AdminDashboard.fallback.test.js` (D14: `/portal/admin` before routing Task 13 - the hooks module has no `useSignups`; a separate file because the guard is resolved at module load):
```js
import React from 'react';
import { renderScreen } from './testRender';
import AdminDashboard from './AdminDashboard';

jest.mock('../hooks', () => ({
  useAdminDashboard: () => ({ data: { outstanding: [], metrics: { enrolled: 3, enrolledLabel: 'enrolled athletes', fill: '50%', fillLabel: 'fill' }, enrollment: [], blockFill: [], membership: { active: 2, pastDue: 0, lapsed: 0, lapsedHouseholds: [] } } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));

test('without useSignups (routing Task 13 not merged) the dashboard still renders', async () => {
  const r = await renderScreen(<AdminDashboard bare role="owner" />);
  expect(r.text()).toContain('Sign-ups · 0 unpaid');
  expect(r.text()).toContain('Pending');
  await r.unmount();
});
```

- [ ] **Step 6: Run them** - Expected: FAIL (module not found / old copy).

- [ ] **Step 7: Implement `screens/AdminSignups.js`**

```js
import React, { useState } from 'react';
import { color, font } from '../tokens';
import * as hooks from '../hooks';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import {
  SIGNUP_FILTERS, athleteLine, filterSignupRows, flagLabel, flaggedCount, loginLabel, paymentLabel, signedUpLabel, unresolvedLabel,
} from '../data/signupsReport';

/**
 * Sprint 20 (D14): useSignups() lands with routing Task 13, the last routing
 * merge; until then this screen renders an honest empty report. Namespace-
 * import + inert-fallback (Registration.js:27-35) - its own copy, never
 * imported from AdminDashboard.
 */
function useSignupsFallback() {
  return {
    data: { rows: [], counts: { all: 0, unpaid: 0, flagged: 0, unresolved: 0 }, unresolved: [] },
    loading: false,
    error: null,
  };
}
const useSignups = hooks.useSignups || useSignupsFallback;

/**
 * 21 · Sign-ups (Sprint 20, spec 7) - ops/owner. Every self-signed household,
 * newest first: parent contact, athletes (age, tier, handicap), payment per
 * athlete, child login, flags. Filters all / unpaid / flagged; a row opens
 * the household's staff billing view. Replaces the enrollment queue (2.4).
 * Calendly bookings the webhook could not match to an athlete have no
 * household to hang off, so they get their own card on All and Flagged and
 * count inside the Flagged pill (D16).
 */
export default function AdminSignups({ bare = false, role = 'owner', onBack, onOpenHousehold }) {
  const { data, loading, error } = useSignups();
  const [filter, setFilter] = useState('all');
  const rows = filterSignupRows(data?.rows ?? [], filter);
  const counts = data?.counts ?? { all: 0, unpaid: 0, flagged: 0, unresolved: 0 };
  const pill = { all: counts.all ?? 0, unpaid: counts.unpaid ?? 0, flagged: flaggedCount(counts) };
  const unresolved = filter === 'unpaid' ? [] : data?.unresolved ?? [];
  const empty = rows.length === 0 && unresolved.length === 0;
  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <ScreenTitle size={22} style={{ marginTop: onBack ? 8 : 0 }}>Sign-ups</ScreenTitle>
          <div style={{ marginTop: 12 }}>
            <Segmented value={filter} onChange={setFilter} options={SIGNUP_FILTERS.map(([k, l]) => [k, `${l} · ${pill[k]}`])} />
          </div>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <Body size={12}>Loading sign-ups…</Body>
        ) : error ? (
          <ErrorNotice title="Sign-ups didn't load">Check your connection and try again.</ErrorNotice>
        ) : (
          <>
            {unresolved.length ? <UnmatchedCard events={unresolved} /> : null}
            {empty ? (
              <Body size={12} tone={color.textTertiary}>Nothing here yet.</Body>
            ) : (
              rows.map((row) => (
                <SignupRow key={row.householdId} row={row} onOpen={onOpenHousehold ? () => onOpenHousehold(row.householdId) : undefined} />
              ))
            )}
          </>
        )}
      </div>
    </PhoneFrame>
  );
}

/** D16: unmatched Calendly bookings - no household row exists, so they sit in their own card. */
function UnmatchedCard({ events }) {
  return (
    <Card tone="red" large>
      <SectionLabel tone={color.error} style={{ marginBottom: 6 }}>Unmatched Calendly bookings · {events.length}</SectionLabel>
      <Body size={12} style={{ marginBottom: 8 }}>
        The webhook could not tie these to an athlete (no login with the invitee's email, and no portal link - or one for an athlete that email does not own).
        Find the family from Calendly's email and book it for them, or ask Yannick to cancel it.
      </Body>
      {events.map((e) => <Body key={e.id} size={12} tone={color.error}>{unresolvedLabel(e)}</Body>)}
    </Card>
  );
}

const TONE = { pending: 'yellow', active: 'green', past_due: 'yellow', lapsed: 'red' };

function SignupRow({ row, onOpen }) {
  return (
    <div role={onOpen ? 'button' : undefined} aria-label={row.name} onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
      <Card large>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{row.name}</div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {signedUpLabel(row.signedUpAt)}{row.mode ? ` · ${row.mode === 'athlete' ? 'self (18+)' : 'parent'}` : ''}
            </div>
          </div>
          {row.unpaid ? <StatusBadge tone="yellow">Unpaid</StatusBadge> : null}
          {row.flagged ? <StatusBadge tone="red">Flagged</StatusBadge> : null}
        </div>
        <Body size={12} style={{ marginTop: 8 }}>{row.parent.name} · {row.parent.email} · {row.parent.phone}</Body>
        <SectionLabel style={{ marginTop: 12, marginBottom: 6 }}>Athletes</SectionLabel>
        {row.athletes.map((a) => (
          <div key={a.athleteId} style={{ padding: '6px 0', borderTop: `1px solid ${color.ruleSoft}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, font: `500 12px ${font.body}`, color: color.text }}>{athleteLine(a)}</div>
              <StatusBadge tone={TONE[a.billing] || 'neutral'}>{paymentLabel(a)}</StatusBadge>
            </div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>{loginLabel(a)}</div>
          </div>
        ))}
        {row.flags.length ? (
          <>
            <SectionLabel tone={color.error} style={{ marginTop: 12, marginBottom: 6 }}>Flags</SectionLabel>
            {row.flags.map((f) => <Body key={f.id} size={12} tone={color.error}>{flagLabel(f)}</Body>)}
          </>
        ) : null}
      </Card>
    </div>
  );
}
```

- [ ] **Step 8: AdminDashboard, tab bar, routes**

`AdminDashboard.js`:
1. KEEP line 4 (`import * as hooks from '../hooks';`) - it now serves the D14 guard. Replace lines 13-33 (`useEnrollmentQueueFallback` + `const useEnrollmentQueue = ...`) with the `useSignupsFallback` block written out in `20-frontend.md` "Day-2 sequencing" (copy it verbatim). Line 11 (`import { useAdminDashboard } from '../hooks';`) stays.
2. Delete line 125 (`const queue = useEnrollmentQueue();`) and the whole `EnrollmentQueueCard` (lines 169-339, doc comment included). Delete `radius` from the tokens import (line 3) ONLY if `grep -n "radius\." AdminDashboard.js` shows no other use after the deletion (`TierFilter` and `OutstandingCard` use `radius.control` / `radius.cardLarge`, so it stays).
3. Props (line 86-94): add `onOpenSignups,` after `onOpenHousehold,`. Line 154 `<EnrollmentQueueCard state={queue} />` becomes `<SignupsCard onOpenSignups={onOpenSignups} />`.
4. `MembershipCard` - the exact diff. Before (lines 488-499):
```js
function MembershipCard({ membership }) {
  if (!membership) return null;
  const stats = [
    ['Active', membership.active, 'green'],
    ['Past due', membership.pastDue, 'yellow'],
    ['Lapsed', membership.lapsed, 'red'],
  ];

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 14 }}>Membership</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
```
After:
```js
function MembershipCard({ membership }) {
  if (!membership) return null;
  // Sprint 20 (spec 4.4, contract 3.5): `pending` is an ATHLETE count (still
  // on checkout) beside the household counts, so this card and the sign-ups
  // report agree. Absent (routing Task 13 not merged yet) renders 0.
  const stats = [
    ['Active', membership.active, 'green'],
    ['Pending', membership.pending ?? 0, 'yellow'],
    ['Past due', membership.pastDue, 'yellow'],
    ['Lapsed', membership.lapsed, 'red'],
  ];

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 14 }}>Membership</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
```
The `stats.map(...)` body below it (lines 500-507, `{value ?? 0}` + the badge) is unchanged; four 22px numbers fit a 375px card (Task 14 Step 5 checks it).
5. Add `SignupsCard` where `EnrollmentQueueCard` was:
```js
/** Sign-ups (spec 7): the unpaid count is the day-2 view ops works from; unmatched Calendly bookings count as flagged (D16). */
function SignupsCard({ onOpenSignups }) {
  const { data, loading, error } = useSignups();
  const unpaid = data?.counts?.unpaid ?? 0;
  const flagged = (data?.counts?.flagged ?? 0) + (data?.counts?.unresolved ?? 0);
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Sign-ups · {loading ? '…' : `${unpaid} unpaid`}</SectionLabel>
      {error ? (
        <Body size={12} tone={color.error}>Sign-ups didn't load.</Body>
      ) : (
        <Body size={12}>{data?.counts?.all ?? 0} self-signed households · {flagged} flagged. Sign-up is instant; nothing waits for approval.</Body>
      )}
      {onOpenSignups ? (
        <Button variant="secondary" height={44} onClick={onOpenSignups} style={{ marginTop: 12, boxShadow: 'none' }}>
          Open sign-ups
        </Button>
      ) : null}
    </Card>
  );
}
```
6. The doc comment's Sprint 10 pin D paragraph (lines 64-71, "adds the ENROLLMENT QUEUE section ...") becomes: `Sprint 20 (spec 2.4/7): the enrollment queue is retired - sign-up is instant - and the SIGN-UPS card (unpaid count, flagged count, Open sign-ups) takes its slot. The Membership card gains a Pending stat (spec 4.4).`; the `@param {'owner'|'ops'|'mental'} [role]` line becomes `@param {'owner'|'ops'} [role]` with `(mental no longer lands here - spec 9)`.

`BottomTabBar.js:85-89`: remove the `admin` entry from `mental` (Sessions, Tour only).

`PortalRoutes.js`: `AdminRoute` passes `onOpenSignups={() => navigate('/portal/admin/signups')}`; the `admin` route's roles become `['ops', 'owner']`; `SpecialistDayRoute` (line 328): `if (live && !specialistId && !canSwitch) return <Navigate to="/portal/tour" replace />;` (a `mental` account without `specialistId` has no admin any more; Tour is every role's); add after the `admin/households/:householdId` route:
```js
      <Route
        path="admin/signups"
        element={
          <RequireRole roles={['ops', 'owner']}>
            <SignupsRoute />
          </RequireRole>
        }
      />
```
with
```js
function SignupsRoute() {
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const navigate = useNavigate();
  return (
    <AdminSignups bare role={(live && user?.role) || 'owner'} onBack={() => navigate('/portal/admin')}
      onOpenHousehold={(id) => navigate(`/portal/admin/households/${id}`)} />
  );
}
```
and `import AdminSignups from './screens/AdminSignups';`.

- [ ] **Step 9: Run** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AdminSignups.test.js src/portal/screens/AdminDashboard.test.js src/portal/screens/AdminDashboard.fallback.test.js src/portal/data/signupsReport.test.js` - Expected: PASS. `wc -l frontend/src/portal/screens/AdminDashboard.js` under 500. `grep -rn "data/signups'" frontend/src/portal/screens frontend/src/portal/components` prints nothing (only routing's hook imports `data/signups`).

- [ ] **Step 10: Commit**
```bash
git add frontend/src/portal/data/signupsReport.js frontend/src/portal/data/signupsReport.test.js frontend/src/portal/screens/AdminSignups.js frontend/src/portal/screens/AdminSignups.test.js frontend/src/portal/screens/AdminDashboard.js frontend/src/portal/screens/AdminDashboard.test.js frontend/src/portal/screens/AdminDashboard.fallback.test.js frontend/src/portal/components/BottomTabBar.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(admin): sign-ups report with filters + unmatched Calendly card, dashboard Sign-ups card + Pending stat, admin hidden from mental (#11)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

Continue with `20-frontend-part4.md` (Tasks 14-15 and the self-review).
