# Frontend - Sprint 20 Implementation Plan (part 2 of 6)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is part 2.** Header, Global Constraints, the Day-2 sequencing note and the list of names not in the contract live in `20-frontend.md`; Tasks 3-4 in `20-frontend-part1b.md`, Tasks 5-7 in `20-frontend-part1c.md`; every constraint there applies here. Part 2 consumes `renderScreen` (Task 1), `PayButton`/`startCheckout` (Task 6) and the `data/authCopy.js` strings (Task 3).

**Goal:** Per-athlete payment state on every membership reader, the `?paid=` confirmation, the facility add-on, Yannick via Calendly, the admin sign-ups report and the section-9 launch fixes.

**Spec:** docs/portal/SPRINT-20-LAUNCH.md sections 4.2 (after payment), 4.4, 4.5, 6.1, 7, 9, 13.
**Interfaces:** docs/portal/plans/2026-09-28-sprint-20-launch/01-interfaces.md (3.4, 3.5, 3.6, 4.2, 4.3, 4.4, 4.5).
**GitHub issues:** #9 #10 #11 #12.

---

### Task 8: Billing copy helpers, PendingBanner, PaymentConfirming, ParentDashboard (closes part of #9)

**Files:**
- Create: `frontend/src/portal/data/billingCopy.js`, `frontend/src/portal/components/PendingBanner.js`, `frontend/src/portal/components/PaymentConfirming.js`
- Modify: `frontend/src/portal/screens/ParentDashboard.js:1-16,65-96,137-157,261-317`
- Test: `frontend/src/portal/data/billingCopy.test.js`, `frontend/src/portal/screens/ParentDashboard.test.js`

**Interfaces:**
- Consumes: `useBillingHub().data -> { household, members: [{ athleteId, name, package, billing: { status, facility }, facilityAccess, ... }], status: { status: 'pending' | ..., pendingAthletes: [{ athleteId, name }], body, cta }, portalUrl }` (contract 3.5, `hooks/billing.js:240`); `usePaymentConfirmation(athleteId) -> { state: 'idle'|'confirming'|'confirmed'|'timeout', billingStatus }` from `hooks/billing.js` (contract 4.5); `bookingOpen`, `BOOKING_OPENS_LABEL` (contract 3.1); `longDayLabel` (`calendar.js:86`); `PayButton` (Task 6); `useSearchParams` (react-router 6.30); `useHousehold().data.children[].loginEmail: string | null` + `login: { state: 'none'|'invited'|'invited-stale'|'claimed', claimedAt } | null` (D9 - routing Task 12's `liveChildCard`; absent on legacy and seed cards, so `ChildCard` renders the line only when the key exists).
- Produces (new, not in contract): `data/billingCopy.js` exports `PENDING_TITLE`, `PAY_NOW`, `PENDING_PLAN_LINE`, `CONNECTED_LINE`, `CONFIRMING`, `CONFIRM_TIMEOUT`, `confirmedLine(open) -> string`, `billingBadge(status) -> { tone, label } | null`, `facilityCardState(member) -> null | 'offer' | 'paid-waiver-pending' | 'active' | 'past_due' | 'lapsed'`, `facilityLine(state) -> string | null`, `loginStatusLine({ loginEmail, login }) -> string`; `PendingBanner({ pendingAthletes, body, email, style })`; `PaymentConfirming({ athleteId, style })`.

- [ ] **Step 1: Write the failing helper test**

`frontend/src/portal/data/billingCopy.test.js`:
```js
import { billingBadge, confirmedLine, facilityCardState, facilityLine, loginStatusLine, PENDING_PLAN_LINE, PENDING_TITLE } from './billingCopy';

test('section 9 strings', () => {
  expect(PENDING_TITLE).toBe('Payment pending - finish checkout to start booking');
  expect(PENDING_PLAN_LINE).toBe("Billed monthly from the 1st once you've paid");
  expect(confirmedLine(false)).toBe('Payment received - booking opens Fri, Oct 10 at 7 AM.');
  expect(confirmedLine(true)).toBe("Payment received - you're all set to book.");
});

test('badges: pending is yellow, absent is none', () => {
  expect(billingBadge('pending')).toEqual({ tone: 'yellow', label: 'Payment pending' });
  expect(billingBadge('lapsed')).toEqual({ tone: 'red', label: 'Lapsed' });
  expect(billingBadge(undefined)).toBeNull();
  expect(billingBadge('active')).toBeNull();
});

test('facility add-on card state (spec 4.5)', () => {
  const m = (over) => ({ package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });
  expect(facilityCardState(m({ package: { kind: 'elite' } }))).toBeNull();
  expect(facilityCardState(m({ billing: { status: 'pending', facility: null } }))).toBeNull();
  expect(facilityCardState(m({ billing: undefined }))).toBe('offer'); // absent billing == active
  expect(facilityCardState(m())).toBe('offer');
  expect(facilityCardState(m({ billing: { status: 'active', facility: 'active' } }))).toBe('paid-waiver-pending');
  expect(facilityCardState(m({ billing: { status: 'active', facility: 'active' }, facilityAccessConsent: true }))).toBe('active');
  expect(facilityCardState(m({ facilityAccess: true }))).toBe('active'); // ops-granted, no add-on subscription
  expect(facilityCardState(m({ billing: { status: 'active', facility: 'lapsed' } }))).toBe('lapsed');
  expect(facilityLine('paid-waiver-pending')).toBe('Facility access: paid - waiver pending');
  expect(facilityLine('active')).toBe('Facility access: active');
  expect(facilityLine('offer')).toBeNull();
});

test('login status line (spec 3.2)', () => {
  expect(loginStatusLine({ loginEmail: null })).toBe('Login: none');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'invited' } })).toBe('Login: not claimed (kid@email.com)');
  expect(loginStatusLine({ loginEmail: 'kid@email.com', login: { state: 'claimed', claimedAt: '2026-10-02T14:00' } })).toMatch(/^Login: claimed .*Oct/);
});
```

- [ ] **Step 2: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/data/billingCopy.test.js` - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `data/billingCopy.js`**

```js
/**
 * Per-athlete payment copy and card states (Sprint 20, spec 4.4/4.5, 3.2),
 * PURE - shared by ParentDashboard, AthleteDashboard, Membership, Billing
 * and AthleteDetail so the words cannot drift. `billing` absent == active.
 */
import { BOOKING_OPENS_LABEL, longDayLabel } from './calendar';

export const PENDING_TITLE = 'Payment pending - finish checkout to start booking';
export const PAY_NOW = 'Pay now';
export const PENDING_PLAN_LINE = "Billed monthly from the 1st once you've paid";
export const CONNECTED_LINE = 'Your card and invoices are managed in Stripe.';
export const CONFIRMING = 'Confirming your payment...';
export const CONFIRM_TIMEOUT = 'Still confirming - refresh in a minute, or check your email from Stripe.';

export function confirmedLine(open) {
  return open ? "Payment received - you're all set to book." : `Payment received - booking opens ${BOOKING_OPENS_LABEL}.`;
}

const BADGES = {
  pending: { tone: 'yellow', label: 'Payment pending' },
  past_due: { tone: 'yellow', label: 'Past due' },
  lapsed: { tone: 'red', label: 'Lapsed' },
};
export function billingBadge(status) {
  return BADGES[status] || null;
}

/** null == no card (Elite includes it; a tier not yet active cannot add it). */
export function facilityCardState(member) {
  if (!member || !member.package || member.package.kind === 'elite') return null;
  if ((member.billing?.status ?? 'active') !== 'active') return null;
  const facility = member.billing?.facility ?? null;
  if (facility == null) return member.facilityAccess ? 'active' : 'offer';
  if (facility === 'active') return member.facilityAccessConsent ? 'active' : 'paid-waiver-pending';
  return facility; // 'past_due' | 'lapsed'
}

const FACILITY_LINES = {
  'paid-waiver-pending': 'Facility access: paid - waiver pending',
  active: 'Facility access: active',
  past_due: 'Facility access: payment past due',
  lapsed: 'Facility access: lapsed',
};
export function facilityLine(state) {
  return FACILITY_LINES[state] || null;
}

/** "Login: none / not claimed / claimed <date>" for the athlete card. */
export function loginStatusLine({ loginEmail, login } = {}) {
  if (!loginEmail) return 'Login: none';
  if (login && login.state === 'claimed') {
    const day = login.claimedAt ? String(login.claimedAt).slice(0, 10) : null;
    return day ? `Login: claimed ${longDayLabel(day)}` : 'Login: claimed';
  }
  return `Login: not claimed (${loginEmail})`;
}
```

- [ ] **Step 4: Run it** - Expected: PASS (4 tests).

- [ ] **Step 5: The two components**

`components/PendingBanner.js`:
```js
import React from 'react';
import { color, font } from '../tokens';
import PayButton from './PayButton';
import { Body, Card, SectionLabel } from './Primitives';
import { PAY_NOW, PENDING_TITLE } from '../data/billingCopy';

/** One banner, one Pay now per unpaid athlete (spec 4.4). Renders nothing when nobody is pending. */
export default function PendingBanner({ pendingAthletes, body, email = null, style }) {
  if (!pendingAthletes || pendingAthletes.length === 0) return null;
  return (
    <Card tone="yellow" large style={style}>
      <SectionLabel tone={color.secondary}>{PENDING_TITLE}</SectionLabel>
      {body ? <Body size={12} style={{ marginTop: 8 }}>{body}</Body> : null}
      {pendingAthletes.map((a) => (
        <div key={a.athleteId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>{a.name}</div>
          <PayButton athleteId={a.athleteId} label={PAY_NOW} height={44} email={email} style={{ width: 132, flex: 'none' }} />
        </div>
      ))}
    </Card>
  );
}
```

`components/PaymentConfirming.js`:
```js
import React, { useEffect, useState } from 'react';
import { color } from '../tokens';
import { Spinner } from './Button';
import { Banner } from './Primitives';
import { usePaymentConfirmation } from '../hooks/billing';
import { bookingOpen } from '../data/calendar';
import { CONFIRMING, CONFIRM_TIMEOUT, confirmedLine } from '../data/billingCopy';

/**
 * The `?paid=<athleteId>` return from Stripe (spec 4.2): the hook re-reads the
 * athlete every 5 s for 2 min; this keeps the last non-idle state on screen
 * after the hook strips the query, so "Payment received" does not vanish.
 */
export default function PaymentConfirming({ athleteId, style }) {
  const { state } = usePaymentConfirmation(athleteId ?? null);
  const [shown, setShown] = useState(null);
  useEffect(() => { if (state !== 'idle') setShown(state); }, [state]);
  const s = shown ?? (athleteId ? 'confirming' : null);
  if (!s) return null;
  if (s === 'confirmed') return <Banner tone="green" title="Payment received" style={style}>{confirmedLine(bookingOpen(Date.now()))}</Banner>;
  if (s === 'timeout') return <Banner tone="yellow" title="Still confirming" style={style}>{CONFIRM_TIMEOUT}</Banner>;
  return (
    <Banner tone="neutral" title="Payment" style={style}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Spinner size={14} track={color.rule} head={color.primary} /> {CONFIRMING}
      </span>
    </Banner>
  );
}
```

- [ ] **Step 6: Write the failing ParentDashboard test**

`frontend/src/portal/screens/ParentDashboard.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import ParentDashboard from './ParentDashboard';

let mockHub; let mockConfirm;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, label }) => <button type="button">{label}|{athleteId}</button> }));
jest.mock('../hooks/billing', () => ({
  __esModule: true,
  default: () => mockHub,
  useBillingHub: () => mockHub,
  usePaymentConfirmation: (id) => (id ? mockConfirm : { state: 'idle', billingStatus: null }),
  STRIPE_PORTAL_URL: null,
}));
jest.mock('../hooks', () => ({
  useHousehold: () => ({ loading: false, error: null, data: { name: 'Whitfield family', date: 'Thu, Oct 1', children: [
    { id: 'a1', name: 'Jordan', ageLine: 'Age 14', standing: { tone: 'green', label: 'On track' }, next: null, contract: null, packageId: 't-12', tokens: null, loginEmail: 'jordan@email.com', login: { state: 'invited', claimedAt: null } },
    { id: 'a2', name: 'Reese', ageLine: 'Age 12', standing: { tone: 'neutral', label: 'New', dashed: true }, next: null, contract: null, packageId: 't-6', tokens: null },
  ], billing: { status: 'ok' } } }),
  useMembership: () => ({ data: { household: { membership: null } } }),
}));

beforeEach(() => {
  mockConfirm = { state: 'confirming', billingStatus: 'pending' };
  mockHub = { loading: false, error: null, data: {
    household: { id: 'h1' }, portalUrl: null,
    members: [
      { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null } },
      { athleteId: 'a2', name: 'Reese', package: { kind: 'tokens' }, billing: { status: 'pending', facility: null } },
    ],
    status: { status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, title: 'Payment pending - finish checkout to start booking',
      body: "Reese can book as soon as checkout is complete. Billed monthly from the 1st once you've paid.", cta: 'Pay now', paused: false, pendingAthletes: [{ athleteId: 'a2', name: 'Reese' }] },
  } };
});

test('pending banner with one Pay now per unpaid athlete; the unpaid card is badged', async () => {
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family' });
  expect(r.text()).toContain('Payment pending - finish checkout to start booking');
  expect(r.button('Pay now|a2')).not.toBeNull();
  expect(r.button('Pay now|a1')).toBeNull();
  expect(r.text()).toContain('Payment pending');
  expect(r.text()).toContain('On track');
  // D9: liveChildCard's login field -> the card's login line; Reese has no
  // loginEmail key (legacy shape), so no line at all - not even "Login: none".
  expect(r.text()).toContain('Login: not claimed (jordan@email.com)');
  expect(r.text()).not.toContain('Login: none');
  await r.unmount();
});

test('?paid= shows the confirming state, then payment received', async () => {
  const r = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2&cs=cs_1' });
  expect(r.text()).toContain('Confirming your payment...');
  await r.unmount();
  mockConfirm = { state: 'confirmed', billingStatus: 'active' };
  const c = await renderScreen(<ParentDashboard bare />, { path: '/portal/family?paid=a2' });
  expect(c.text()).toMatch(/Payment received - /);
  await c.unmount();
});
```

- [ ] **Step 7: Run it** - Expected: FAIL (no banner, no confirming copy).

- [ ] **Step 8: Wire ParentDashboard**

Imports to add: `import { useNavigate, useSearchParams } from 'react-router-dom';` (replace line 2), `import PendingBanner from '../components/PendingBanner';`, `import PaymentConfirming from '../components/PaymentConfirming';`, `import { useBillingHub } from '../hooks/billing';`, `import { billingBadge, loginStatusLine } from '../data/billingCopy';`. Note: `hooks/billing.js` default-exports `useBillingHub` and adding a named alias there is routing's file - so import the default: `import useBillingHub from '../hooks/billing';`.

In the component body after line 81 (`const onHold = ...`):
```js
  // Sprint 20 (spec 4.4): per-athlete paid state from the same hub Billing
  // renders; the household-level `membership` above keeps its meaning.
  const hub = useBillingHub();
  const hubStatus = hub.data?.status ?? null;
  const pendingAthletes = hubStatus?.status === 'pending' ? hubStatus.pendingAthletes : [];
  const billingById = new Map((hub.data?.members ?? []).map((m) => [m.athleteId, m.billing?.status ?? 'active']));
  const [params] = useSearchParams();
  const paidAthleteId = params.get('paid');
```
In the loaded branch, before the `{onHold ? ...}` banner:
```js
        <PaymentConfirming athleteId={paidAthleteId} />
        <PendingBanner pendingAthletes={pendingAthletes} body={hubStatus?.body} />
```
`ChildCard` gains `billingStatus` (pass `billingStatus={billingById.get(child.id) ?? 'active'}` from the map at line 148-157) and computes
```js
  const standing = onHold ? { tone: 'red', label: 'On hold' } : billingBadge(billingStatus) ?? child.standing;
```
`ChildCard` login line (spec 3.2 "the athlete card shows Login: none / not claimed / claimed <date>"; D9): directly under the `ageLine` div (`ParentDashboard.js:276-278`), before the package button, insert
```js
          {/* Sprint 20 (spec 3.2, D9): the child-login state, from liveChildCard's
              loginEmail + login. Legacy payloads and the seed carry neither key,
              so nothing renders and the card keeps its shape. */}
          {'loginEmail' in child ? (
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {loginStatusLine(child)}
            </div>
          ) : null}
```
(`loginStatusLine({ loginEmail, login })` is Task 8 Step 3's helper; `child` carries both keys, so it is passed whole.)

- [ ] **Step 9: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/ParentDashboard.test.js` - Expected: PASS (2 tests).

- [ ] **Step 10: Commit**
```bash
git add frontend/src/portal/data/billingCopy.js frontend/src/portal/data/billingCopy.test.js frontend/src/portal/components/PendingBanner.js frontend/src/portal/components/PaymentConfirming.js frontend/src/portal/screens/ParentDashboard.js frontend/src/portal/screens/ParentDashboard.test.js
git commit -m "feat(billing): pending banner + pay buttons and ?paid= confirming on the family home (#9)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: FacilityCard, athlete home + Membership pending state (closes part of #9) (MAY SLIP - Oct 10: the facility card only)

**Files:**
- Create: `frontend/src/portal/components/FacilityCard.js`
- Modify: `frontend/src/portal/screens/AthleteDashboard.js:1-16,44-54,93-101`, `frontend/src/portal/screens/Membership.js:1-11,31-42,56-78,83-98`
- Test: `frontend/src/portal/components/FacilityCard.test.js`, `frontend/src/portal/screens/Membership.test.js`

**Interfaces:**
- Consumes: `useMyTokens().data -> { household, member, status }` (`hooks/billing.js:254`, contract 3.5: `status` gains the pending branch; `member.billing`); `FACILITY_ACCESS` (`packages.js:78`); `facilityCardState`, `facilityLine` (Task 8); `PayButton`, `PendingBanner`, `PaymentConfirming`.
- Produces (new, not in contract): `FacilityCard({ member, email, readOnly, style })` - renders nothing when `facilityCardState(member)` is null; `'offer'` renders the price line and a `PayButton product="facility"` labelled `Add facility access`; other states render `facilityLine(state)`.

- [ ] **Step 1: Write the failing FacilityCard test**

`frontend/src/portal/components/FacilityCard.test.js`:
```js
import React from 'react';
import { renderScreen } from '../screens/testRender';
import FacilityCard from './FacilityCard';

jest.mock('./PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
const member = (over) => ({ athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });

test('offer, paid-waiver-pending, active, elite', async () => {
  const o = await renderScreen(<FacilityCard member={member()} />);
  expect(o.text()).toContain('$300');
  expect(o.button('Add facility access|a1|facility')).not.toBeNull();
  await o.unmount();
  const p = await renderScreen(<FacilityCard member={member({ billing: { status: 'active', facility: 'active' } })} />);
  expect(p.text()).toContain('Facility access: paid - waiver pending');
  await p.unmount();
  const e = await renderScreen(<FacilityCard member={member({ package: { kind: 'elite' } })} />);
  expect(e.text()).toBe('');
  await e.unmount();
  const ro = await renderScreen(<FacilityCard member={member()} readOnly />);
  expect(ro.button('Add facility access|a1|facility')).toBeNull();
  expect(ro.text()).toContain('No facility access');
  await ro.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `components/FacilityCard.js`**

```js
import React from 'react';
import { color } from '../tokens';
import PayButton from './PayButton';
import { Body, Card, SectionLabel } from './Primitives';
import { FACILITY_ACCESS } from '../data/packages';
import { facilityCardState, facilityLine } from '../data/billingCopy';

/**
 * The $300/month facility-access add-on (spec 4.5): bought per athlete once
 * the tier is active, never for Elite (included). The waiver stays ops-
 * verified: "paid - waiver pending" until consent is on file.
 */
export default function FacilityCard({ member, email = null, readOnly = false, style }) {
  const state = facilityCardState(member);
  if (!state) return null;
  return (
    <Card large style={style}>
      <SectionLabel style={{ marginBottom: 8 }}>Facility access</SectionLabel>
      {state === 'offer' ? (
        <>
          <Body size={12}>
            {readOnly ? 'No facility access add-on.' : `24/7 facility access for ${member.name} - $${FACILITY_ACCESS.price}/month, billed with the membership. The signed waiver is checked by the academy before the door opens.`}
          </Body>
          {readOnly ? null : (
            <PayButton athleteId={member.athleteId} product="facility" label="Add facility access" variant="secondary" height={44} email={email} style={{ marginTop: 12 }} />
          )}
        </>
      ) : (
        <Body size={12} tone={state === 'active' ? color.primary : color.secondary}>{facilityLine(state)}</Body>
      )}
    </Card>
  );
}
```

- [ ] **Step 4: Run it** - Expected: PASS.

- [ ] **Step 5: Write the failing Membership test**

`frontend/src/portal/screens/Membership.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import Membership from './Membership';

let mockMine;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
jest.mock('../components/TokenMeter', () => ({ __esModule: true, default: () => 'METER' }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => ({}), useMyTokens: () => mockMine, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: null }));

test('pending athlete sees the banner and Pay now; paid athlete sees the facility offer', async () => {
  const base = { athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens', name: '12 tokens' }, tokens: { left: 12 }, coaching: null, contractMinutes: null, facilityAccess: false };
  mockMine = { loading: false, error: null, data: { member: { ...base, billing: { status: 'pending', facility: null } },
    status: { status: 'pending', paused: false, body: 'Jordan can book as soon as checkout is complete.', pendingAthletes: [{ athleteId: 'a1', name: 'Jordan' }] } } };
  const p = await renderScreen(<Membership bare />);
  expect(p.text()).toContain('Payment pending - finish checkout to start booking');
  expect(p.button('Pay now|a1|tier')).not.toBeNull();
  expect(p.button('Add facility access|a1|facility')).toBeNull();
  await p.unmount();
  mockMine = { loading: false, error: null, data: { member: { ...base, billing: { status: 'active', facility: null } }, status: { status: 'active', paused: false, pendingAthletes: [] } } };
  const a = await renderScreen(<Membership bare />);
  expect(a.button('Add facility access|a1|facility')).not.toBeNull();
  await a.unmount();
});
```

- [ ] **Step 6: Run it** - Expected: FAIL.

- [ ] **Step 7: Wire Membership and AthleteDashboard**

`Membership.js`: import `PendingBanner`, `FacilityCard`; after `<StatusBanner status={status} />` (line 70) add
```js
            <PendingBanner pendingAthletes={status?.status === 'pending' ? status.pendingAthletes : []} body={status?.body} />
```
and inside `<MemberSection>` after `<ContractLine .../>` add `<FacilityCard member={member} />`. In `StatusBanner`, keep the two paused branches (pending is not `paused`, so it already returns null there).

`AthleteDashboard.js`: imports `import { useNavigate, useSearchParams } from 'react-router-dom';`, `import PendingBanner from '../components/PendingBanner';`, `import PaymentConfirming from '../components/PaymentConfirming';`, `import { useMyTokens } from '../hooks/billing';`. After line 53:
```js
  // Sprint 20 (spec 4.4): the athlete's own paid state and the ?paid= return.
  const mine = useMyTokens();
  const mineStatus = mine.data?.status ?? null;
  const [params] = useSearchParams();
```
At the top of the loaded column (before the `StartHere` line, 96) add
```js
        <PaymentConfirming athleteId={params.get('paid')} />
        <PendingBanner pendingAthletes={mineStatus?.status === 'pending' ? mineStatus.pendingAthletes : []} body={mineStatus?.body} />
```

- [ ] **Step 8: Run it** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/Membership.test.js src/portal/components/FacilityCard.test.js` - Expected: PASS. Then `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal` - Expected: all PASS.

- [ ] **Step 9: Commit**
```bash
git add frontend/src/portal/components/FacilityCard.js frontend/src/portal/components/FacilityCard.test.js frontend/src/portal/screens/Membership.js frontend/src/portal/screens/Membership.test.js frontend/src/portal/screens/AthleteDashboard.js
git commit -m "feat(billing): athlete home + Membership pending banner, ?paid= return, facility add-on card (#9)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Billing hub pending hero, plan/connected copy, facility rows; AthleteDetail login line (closes rest of #9)

**Files:**
- Modify: `frontend/src/portal/screens/Billing.js:1-16,107-120,135-170,209-273`, `frontend/src/portal/screens/AthleteDetail.js:1-13,131-133`
- Test: `frontend/src/portal/screens/Billing.test.js`, `frontend/src/portal/screens/AthleteDetail.test.js`

**Interfaces:**
- Consumes: `useBillingHub()` (Task 8's shape); `statusFor` pending branch `cta: 'Pay now'`; `useAthleteDetail().data.athlete` gains `loginEmail: string | null` and `login: { state: 'none'|'invited'|'invited-stale'|'claimed', claimedAt } | null` (D9 - in the contract now: routing Task 12's `liveAthleteDetail`, `hooks/index.js:3140`, reads `loginInvites/{loginEmail}` under the parent/ops rules clause; absent on legacy payloads, hence the `'loginEmail' in athlete` guard below); `loginStatusLine`, `PENDING_PLAN_LINE`, `CONNECTED_LINE` (Task 8).
- Produces: `Billing` renders `PayButton`s in the hero for `status.pendingAthletes`, `PENDING_PLAN_LINE` per pending member on the Plan card, `CONNECTED_LINE` on the connection card, one `FacilityCard` per member (`readOnly={staff}`); `AthleteDetail` renders the login line when the payload carries `loginEmail`.

- [ ] **Step 1: Write the failing Billing test**

`frontend/src/portal/screens/Billing.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import Billing from './Billing';

let mockHub;
jest.mock('../components/PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
jest.mock('../components/TokenMeter', () => ({ __esModule: true, default: () => 'METER' }));
jest.mock('../hooks/billing', () => ({ __esModule: true, default: () => mockHub, useBillingHub: () => mockHub, usePaymentConfirmation: () => ({ state: 'idle' }), STRIPE_PORTAL_URL: 'https://billing.stripe.test/p/x' }));

beforeEach(() => {
  const m = (id, name, billing) => ({ athleteId: id, name, package: { id: 't-6', name: '6 tokens', kind: 'tokens', windowDays: 30, price: 299 }, tokens: { left: 6 }, coaching: null, contractMinutes: null, facilityAccess: false, billing });
  mockHub = { loading: false, error: null, data: {
    household: { id: 'h1', name: 'Whitfield family', anchorDay: 1, membership: null, stripeCustomerId: 'cus_1' }, portalUrl: 'https://billing.stripe.test/p/x',
    members: [m('a1', 'Jordan', { status: 'active', facility: null }), m('a2', 'Reese', { status: 'pending', facility: null })],
    status: { status: 'pending', tone: 'yellow', badge: { tone: 'yellow', label: 'Payment pending' }, title: 'Payment pending - finish checkout to start booking',
      body: "Reese can book as soon as checkout is complete. Billed monthly from the 1st once you've paid.", ladder: null, ladderAt: null, cta: 'Pay now', paused: false, pendingAthletes: [{ athleteId: 'a2', name: 'Reese' }] },
  } };
});

test('pending hero pays, plan and connection copy, facility offer for the paid athlete', async () => {
  const r = await renderScreen(<Billing bare />);
  expect(r.button('Pay now|a2|tier')).not.toBeNull();
  expect(r.text()).toContain("Billed monthly from the 1st once you've paid");
  expect(r.text()).toContain('Your card and invoices are managed in Stripe.');
  expect(r.button('Manage billing in Stripe')).not.toBeNull();
  expect(r.button('Add facility access|a1|facility')).not.toBeNull();
  expect(r.button('Add facility access|a2|facility')).toBeNull();
  await r.unmount();
});

test('staff view never pays', async () => {
  const r = await renderScreen(<Billing bare staff role="owner" householdId="h1" />);
  expect(r.button('Pay now|a2|tier')).toBeNull();
  expect(r.button('Add facility access|a1|facility')).toBeNull();
  await r.unmount();
});
```

- [ ] **Step 2: Run it** - Expected: FAIL.

- [ ] **Step 3: Wire Billing.js**

Imports: `import FacilityCard from '../components/FacilityCard';`, `import PayButton from '../components/PayButton';`, `import { CONNECTED_LINE, PAY_NOW, PENDING_PLAN_LINE } from '../data/billingCopy';`.

`StatusHero` (`Billing.js:134-170`) is replaced in full by:
```js
/**
 * The membership's standing — Stripe's status, the contract's copy, dates
 * only when recorded. Sprint 20 (spec 4.4): the `pending` branch lists one
 * Pay now per unpaid athlete (createCheckoutSession) instead of the card
 * portal CTA - there is no card to update before the first checkout.
 */
function StatusHero({ status, portalUrl, staff = false }) {
  if (!status) return null;
  const s = SURFACES[status.tone] || SURFACES.default;
  // Staff read the standing; only the payer updates the card or pays.
  const cta = staff ? null : status.cta;
  const pendingAthletes = status.status === 'pending' ? status.pendingAthletes ?? [] : [];
  return (
    <div style={{ background: s.background, border: `1px solid ${s.border}`, borderRadius: radius.cardLarge, padding: 17 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionLabel style={{ flex: 1 }}>Membership</SectionLabel>
        <StatusBadge tone={status.badge.tone}>{status.badge.label}</StatusBadge>
      </div>
      <ScreenTitle size={20} style={{ marginTop: 12 }}>
        {status.title}
      </ScreenTitle>
      <Body size={13} style={{ marginTop: 10 }}>
        {status.body}
      </Body>
      {cta && status.status === 'pending' ? (
        pendingAthletes.map((a) => (
          <div key={a.athleteId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text }}>{a.name}</div>
            <PayButton athleteId={a.athleteId} label={PAY_NOW} height={44} style={{ width: 132, flex: 'none' }} />
          </div>
        ))
      ) : cta ? (
        portalUrl ? (
          <Button
            variant={status.tone === 'red' ? 'danger' : 'caution'}
            height={50}
            style={{ marginTop: 15, boxShadow: 'none' }}
            onClick={() => window.open(portalUrl, '_blank', 'noopener')}
          >
            {cta}
          </Button>
        ) : (
          <Body size={12} tone={color.textSecondary} style={{ marginTop: 12 }}>
            To update your card, contact the academy. Booking reopens the same day the invoice clears.
          </Body>
        )
      ) : null}
    </div>
  );
}
```
Members loop (`:107-117`): after `<ContractLine ... />` add `<FacilityCard member={member} readOnly={staff} />`, so the `MemberSection` body reads:
```js
                <MemberSection key={member.athleteId} name={member.name}>
                  <TokenMeter member={member} defaultOpen={members.length === 1} showPrices={staff} />
                  <CoachingLine coaching={member.coaching} />
                  <ContractLine
                    contractMinutes={member.contractMinutes}
                    onOpen={() => navigate(`/portal/athlete/${member.athleteId}`)}
                  />
                  <FacilityCard member={member} readOnly={staff} />
                </MemberSection>
```
`PlanCard` row meta line (`:229-236`): the facility fragment at line 235 gains the pending line after it:
```js
              {m.facilityAccess ? ' · + facility access' : m.package?.kind === 'elite' ? ' · facility access included' : ''}
              {m.billing?.status === 'pending' ? ` · ${PENDING_PLAN_LINE}` : ''}
```
`ConnectionCard` body (`:261-265`) becomes:
```js
      <Body size={12}>
        {connected ? CONNECTED_LINE : 'Card and invoices are managed in Stripe once you have paid.'}
      </Body>
```

- [ ] **Step 4: Run it** - Expected: PASS (2 tests).

- [ ] **Step 5: AthleteDetail login line + test**

`frontend/src/portal/screens/AthleteDetail.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import AthleteDetail from './AthleteDetail';

let mockDetail;
jest.mock('../hooks', () => ({
  useAthleteDetail: () => mockDetail,
  useHousehold: () => ({ data: { name: 'Whitfield family' } }),
  useDiagnostic: () => ({ data: null, loading: false, error: null }),
  useAthleteTier: () => ({ setTier: async () => {} }),
  useAssignPackages: () => ({ assign: async () => {} }),
  useHouseholdSettings: () => ({ saving: false }),
  useIssueTokens: () => ({ issue: async () => {} }),
}));

test('the login line reads the invite state', async () => {
  const athlete = { name: 'Jordan', subline: 'Age 14', contractMinutes: 45, packageId: 't-12', loginEmail: 'jordan@email.com', login: { state: 'invited', claimedAt: null } };
  mockDetail = { data: { athlete, history: [], checklist: [], hasEnoughData: false }, loading: false, error: null };
  const r = await renderScreen(<AthleteDetail bare athleteId="a1" role="parent" />);
  expect(r.text()).toContain('Login: not claimed (jordan@email.com)');
  await r.unmount();
});
```
In `AthleteDetail.js`: `import { loginStatusLine } from '../data/billingCopy';` and after `<AthleteMembershipCard .../>` (line 132):
```js
        {/* Sprint 20 (spec 3.2): the child-login state. Rendered only when the
            payload carries loginEmail (legacy athletes have neither field). */}
        {athlete && 'loginEmail' in athlete ? (
          <Card>
            <Body size={12}>{loginStatusLine(athlete)}</Body>
          </Card>
        ) : null}
```
Run: `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AthleteDetail.test.js` - Expected: PASS.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/portal/screens/Billing.js frontend/src/portal/screens/Billing.test.js frontend/src/portal/screens/AthleteDetail.js frontend/src/portal/screens/AthleteDetail.test.js
git commit -m "feat(billing): hub pending hero with Pay now, plan/connected copy, facility rows; athlete login line (#9)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

Continue with `20-frontend-part3.md` (Tasks 11-13).
