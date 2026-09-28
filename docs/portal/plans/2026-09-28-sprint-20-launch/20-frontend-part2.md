# Frontend - Sprint 20 Implementation Plan (part 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**This is part 2.** Header, Global Constraints, Tasks 1-7 and the list of names not in the contract live in `20-frontend.md`; every constraint there applies here. Part 2 consumes `renderScreen` (Task 1), `PayButton`/`startCheckout` (Task 6) and the `data/authCopy.js` strings (Task 3).

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
- Consumes: `useBillingHub().data -> { household, members: [{ athleteId, name, package, billing: { status, facility }, facilityAccess, ... }], status: { status: 'pending' | ..., pendingAthletes: [{ athleteId, name }], body, cta }, portalUrl }` (contract 3.5, `hooks/billing.js:240`); `usePaymentConfirmation(athleteId) -> { state: 'idle'|'confirming'|'confirmed'|'timeout', billingStatus }` from `hooks/billing.js` (contract 4.5); `bookingOpen`, `BOOKING_OPENS_LABEL` (contract 3.1); `longDayLabel` (`calendar.js:86`); `PayButton` (Task 6); `useSearchParams` (react-router 6.30).
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
    { id: 'a1', name: 'Jordan', ageLine: 'Age 14', standing: { tone: 'green', label: 'On track' }, next: null, contract: null, packageId: 't-12', tokens: null },
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

Imports to add: `import { useNavigate, useSearchParams } from 'react-router-dom';` (replace line 2), `import PendingBanner from '../components/PendingBanner';`, `import PaymentConfirming from '../components/PaymentConfirming';`, `import { useBillingHub } from '../hooks/billing';`, `import { billingBadge } from '../data/billingCopy';`. Note: `hooks/billing.js` default-exports `useBillingHub`; add a named alias there is routing's file - so import the default: `import useBillingHub from '../hooks/billing';`.

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
- Consumes: `useBillingHub()` (Task 8's shape); `statusFor` pending branch `cta: 'Pay now'`; `useAthleteDetail().data.athlete` gains `loginEmail: string | null` and `login: { state: 'none'|'invited'|'invited-stale'|'claimed', claimedAt } | null` **(new, not in contract - HANDOFF to routing: `liveAthleteDetail`, `hooks/index.js:3140`, reads `loginInvites/{loginEmail}` under the new parent/ops rules clause)**; `loginStatusLine`, `PENDING_PLAN_LINE`, `CONNECTED_LINE` (Task 8).
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

`StatusHero({ status, portalUrl, staff })`: replace the `{cta ? (...) : null}` block with
```js
      {cta && status.status === 'pending' ? (
        status.pendingAthletes.map((a) => (
          <div key={a.athleteId} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <div style={{ flex: 1, font: `600 13px ${font.body}`, color: color.text }}>{a.name}</div>
            <PayButton athleteId={a.athleteId} label={PAY_NOW} height={44} style={{ width: 132, flex: 'none' }} />
          </div>
        ))
      ) : cta ? (
        portalUrl ? ( ...existing Button... ) : ( ...existing Body... )
      ) : null}
```
Members loop (line 107-117): after `<ContractLine .../>` add `<FacilityCard member={member} readOnly={staff} />`.
`PlanCard` row meta line: append `{m.billing?.status === 'pending' ? ` · ${PENDING_PLAN_LINE}` : ''}` after the facility fragment (line 235).
`ConnectionCard`: body becomes `{connected ? CONNECTED_LINE : 'Card and invoices are managed in Stripe once you have paid.'}`.

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

### Task 11: SpecialistBooking - Book with Yannick (Calendly) + real durations (closes part of #10) (MAY SLIP - Oct 10)

**Files:**
- Create: `frontend/src/portal/data/specialistGate.js`, `frontend/src/portal/components/CalendlyPanel.js`
- Modify: `frontend/src/portal/screens/SpecialistBooking.js:25-33,212-233,326-360,517-552,561-608`
- Test: `frontend/src/portal/data/specialistGate.test.js`, `frontend/src/portal/screens/SpecialistBooking.test.js`

**Interfaces:**
- Consumes: `useSpecialistSlots(id, { athleteId }).data -> { days, tokens, capReached, bookingMode: 'in-app' | 'calendly', calendlyUrl, billingStatus, bookingOpen, athlete: { id, name, loginEmail }, guardian: { name, email } }` with slots carrying `durationMinutes` (contract 4.3); `householdId` for `utm_campaign` from `useMembership().data.household.id` (`hooks/index.js:1920`; null for an athlete caller - **HANDOFF to routing: add `householdId` to `useSpecialistSlots` data (new, not in contract)**, read as `slotsState.data?.householdId ?? membershipState.data?.household?.id ?? null`); `calendlyLinkFor`, `CALENDLY_NOTE` from `data/calendly.js` (contract 3.4); `reasonCopy`, `capReachedCopy` (Task 1); `formatDuration` (`calendar.js:76`).
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
  expect(g.text()).toContain('Booking opens Fri, Oct 10 at 7 AM');
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

Imports: `import CalendlyPanel from '../components/CalendlyPanel';`, add `formatDuration` to the `../data/calendar` import (line 32). After line 233 (`const blocked = ...`):
```js
  // Sprint 20 (spec 6.1): Yannick books through Calendly when the hook says so
  // (SPECIALISTS.mental.bookingMode === 'calendly' AND a URL is configured).
  const calendly = specialistId === 'mental' && slotsState.data?.bookingMode === 'calendly' && Boolean(slotsState.data?.calendlyUrl);
  const householdId = slotsState.data?.householdId ?? membershipState.data?.household?.id ?? null;
```
In the loaded branch (line 326-359) replace the `<DayStrip>` + locked/slot block with
```js
            {calendly ? (
              <div style={{ padding: '0 22px' }}>
                <CalendlyPanel data={slotsState.data} tokens={tokens} capReached={capReached} attendee={attendee} onAttendee={setAttendee} householdId={householdId} />
              </div>
            ) : (
              <>
                ...the existing DayStrip / LockedDayNotice / SlotList block, unchanged...
              </>
            )}
```
`SlotList` (line 536): `meta={formatDuration(slot.durationMinutes)}`; `DetailSheet` (line 607): `{time} {meridiem} · {formatDuration(slot.durationMinutes)}`. The `EntitlementSummary` line stays above the panel (the same token note both branches share).

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
`frontend/src/portal/screens/Reservations.test.js`: the same shape with `jest.mock('../hooks', () => ({ useHouseholdReservations: () => ({ data: { members: [{ athleteId: 'a1', name: 'Jordan', upcoming: mockRows, past: [] }] }, loading: false, error: null, cancel: async () => {} }) }))`, rendering `<Reservations bare />` and asserting the same two things.

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
- Create: `frontend/src/portal/data/signups.js`, `frontend/src/portal/screens/AdminSignups.js`
- Modify: `frontend/src/portal/screens/AdminDashboard.js:1-33,86-95,125,152-155,169-339`, `frontend/src/portal/components/BottomTabBar.js:85-89`, `frontend/src/portal/PortalRoutes.js:301-353,740-757`
- Test: `frontend/src/portal/data/signups.test.js`, `frontend/src/portal/screens/AdminSignups.test.js`, `frontend/src/portal/screens/AdminDashboard.test.js`

**Interfaces:**
- Consumes: `useSignups() -> { data: { rows, counts: { all, unpaid, flagged } } | null, loading, error }` re-exported from `hooks/index.js` (contract 4.2; row shape there); `useAdminDashboard().data.membership.pending` (contract 3.5); `Segmented` (`components/Segmented.js`, `options` prop); `longDayLabel`.
- Produces (new, not in contract): `data/signups.js` exports `SIGNUP_FILTERS = [['all','All'],['unpaid','Unpaid'],['flagged','Flagged']]`, `filterSignupRows(rows, filter)`, `athleteLine(a)`, `paymentLabel(a)`, `loginLabel(a)`, `flagLabel(f)`, `signedUpLabel(iso)`; `AdminSignups({ bare, role, onBack, onOpenHousehold })`; `AdminDashboard` prop `onOpenSignups`; `PortalRoutes.js#SignupsRoute`; `/portal/admin` roles `['ops', 'owner']`.

- [ ] **Step 1: Write the failing helper test**

`frontend/src/portal/data/signups.test.js`:
```js
import { athleteLine, filterSignupRows, flagLabel, loginLabel, paymentLabel, signedUpLabel } from './signups';

const rows = [{ householdId: 'h1', unpaid: true, flagged: false }, { householdId: 'h2', unpaid: false, flagged: true }, { householdId: 'h3', unpaid: false, flagged: false }];
test('filters', () => {
  expect(filterSignupRows(rows, 'all').map((r) => r.householdId)).toEqual(['h1', 'h2', 'h3']);
  expect(filterSignupRows(rows, 'unpaid').map((r) => r.householdId)).toEqual(['h1']);
  expect(filterSignupRows(rows, 'flagged').map((r) => r.householdId)).toEqual(['h2']);
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

- [ ] **Step 2: Run it** - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `data/signups.js`**

```js
/** The sign-ups report's row copy (Sprint 20, spec 7) - PURE, over useSignups() rows. */
import { longDayLabel } from './calendar';

export const SIGNUP_FILTERS = [['all', 'All'], ['unpaid', 'Unpaid'], ['flagged', 'Flagged']];

export function filterSignupRows(rows, filter) {
  if (filter === 'unpaid') return (rows || []).filter((r) => r.unpaid);
  if (filter === 'flagged') return (rows || []).filter((r) => r.flagged);
  return rows || [];
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

export function signedUpLabel(iso) {
  if (!iso) return '—';
  const day = String(iso).slice(0, 10);
  const time = String(iso).slice(11, 16);
  return time ? `${longDayLabel(day)} ${time}` : longDayLabel(day);
}
```

- [ ] **Step 4: Run it** - Expected: PASS.

- [ ] **Step 5: Write the failing screen tests**

`frontend/src/portal/screens/AdminSignups.test.js`:
```js
import React from 'react';
import { renderScreen } from './testRender';
import AdminSignups from './AdminSignups';

let mockSignups;
jest.mock('../hooks', () => ({ useSignups: () => mockSignups }));
beforeEach(() => {
  mockSignups = { loading: false, error: null, data: { counts: { all: 2, unpaid: 1, flagged: 1 }, rows: [
    { householdId: 'h1', name: 'Whitfield family', signedUpAt: '2026-10-01T14:05', mode: 'parent', parent: { name: 'Dana', email: 'dana@email.com', phone: '612' },
      athletes: [{ athleteId: 'a1', name: 'Jordan', age: 14, packageId: 't-12', packageName: '12 tokens', handicap: 12, billing: 'pending', facility: null, login: 'none', loginEmail: null, loginClaimedAt: null }], flags: [], unpaid: true, flagged: false },
    { householdId: 'h2', name: 'Eisele family', signedUpAt: '2026-10-01T15:00', mode: 'athlete', parent: { name: 'Sam', email: 's@email.com', phone: '1' },
      athletes: [{ athleteId: 'a2', name: 'Sam', age: 19, packageId: 'elite', packageName: 'Elite', handicap: null, billing: 'active', facility: null, login: 'none', loginEmail: null, loginClaimedAt: null }],
      flags: [{ kind: 'calendly', id: 'c1', outcome: 'unresolved', receivedAt: '2026-11-05T10:00' }], unpaid: false, flagged: true },
  ] } };
});

test('rows, filters and the household tap', async () => {
  const opened = [];
  const r = await renderScreen(<AdminSignups bare role="owner" onOpenHousehold={(id) => opened.push(id)} />);
  expect(r.text()).toContain('Jordan · 14 · 12 tokens · hcp 12');
  expect(r.text()).toContain('Payment pending');
  expect(r.text()).toContain('Calendly unresolved · 2026-11-05');
  await r.click('Unpaid');
  expect(r.text()).toContain('Whitfield family');
  expect(r.text()).not.toContain('Eisele family');
  await r.click('Flagged');
  expect(r.text()).toContain('Eisele family');
  const row = r.container.querySelector('[aria-label="Eisele family"]');
  await r.flush();
  row.click();
  await r.flush();
  expect(opened).toEqual(['h2']);
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
  useSignups: () => ({ loading: false, error: null, data: { counts: { all: 2, unpaid: 1, flagged: 0 }, rows: [] } }),
}));
jest.mock('../hooks/billing', () => ({ useHouseholdsDirectory: () => ({ data: [], loading: false, error: null }) }));

test('the Sign-ups card replaces the enrollment queue and counts pending', async () => {
  const opened = [];
  const r = await renderScreen(<AdminDashboard bare role="owner" onOpenSignups={() => opened.push(1)} />);
  expect(r.text()).toContain('Sign-ups · 1 unpaid');
  expect(r.text()).not.toContain('Enrollment queue');
  expect(r.text()).toContain('Pending');
  await r.click('Open sign-ups');
  expect(opened).toEqual([1]);
  await r.unmount();
});
```

- [ ] **Step 6: Run them** - Expected: FAIL.

- [ ] **Step 7: Implement `screens/AdminSignups.js`**

```js
import React, { useState } from 'react';
import { color, font } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useSignups } from '../hooks';
import { SIGNUP_FILTERS, athleteLine, filterSignupRows, flagLabel, loginLabel, paymentLabel, signedUpLabel } from '../data/signups';

/**
 * 21 · Sign-ups (Sprint 20, spec 7) - ops/owner. Every self-signed household,
 * newest first: parent contact, athletes (age, tier, handicap), payment per
 * athlete, child login, flags. Filters all / unpaid / flagged; a row opens
 * the household's staff billing view. Replaces the enrollment queue (2.4).
 */
export default function AdminSignups({ bare = false, role = 'owner', onBack, onOpenHousehold }) {
  const { data, loading, error } = useSignups();
  const [filter, setFilter] = useState('all');
  const rows = filterSignupRows(data?.rows ?? [], filter);
  const counts = data?.counts ?? { all: 0, unpaid: 0, flagged: 0 };
  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <ScreenTitle size={22} style={{ marginTop: onBack ? 8 : 0 }}>Sign-ups</ScreenTitle>
          <div style={{ marginTop: 12 }}>
            <Segmented value={filter} onChange={setFilter} options={SIGNUP_FILTERS.map(([k, l]) => [k, `${l} · ${counts[k] ?? 0}`])} />
          </div>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? <Body size={12}>Loading sign-ups…</Body>
          : error ? <ErrorNotice title="Sign-ups didn't load">Check your connection and try again.</ErrorNotice>
          : rows.length === 0 ? <Body size={12} tone={color.textTertiary}>Nothing here yet.</Body>
          : rows.map((row) => <SignupRow key={row.householdId} row={row} onOpen={onOpenHousehold ? () => onOpenHousehold(row.householdId) : undefined} />)}
      </div>
    </PhoneFrame>
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

`AdminDashboard.js`: delete `useEnrollmentQueueFallback`/`useEnrollmentQueue` (lines 13-33), the `import * as hooks` line 4, the `queue` line 125 and the whole `EnrollmentQueueCard` (169-339); import `useSignups` beside `useAdminDashboard` (line 11); add prop `onOpenSignups`; line 154 becomes `<SignupsCard onOpenSignups={onOpenSignups} />`; `MembershipCard` stats gain `['Pending', membership.pending, 'yellow']` after Active (grid becomes `'1fr 1fr 1fr 1fr'`). Add:
```js
/** Sign-ups (spec 7): the unpaid count is the day-2 view ops works from. */
function SignupsCard({ onOpenSignups }) {
  const { data, loading, error } = useSignups();
  const unpaid = data?.counts?.unpaid ?? 0;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Sign-ups · {loading ? '…' : `${unpaid} unpaid`}</SectionLabel>
      {error ? <Body size={12} tone={color.error}>Sign-ups didn't load.</Body>
        : <Body size={12}>{data?.counts?.all ?? 0} self-signed households · {data?.counts?.flagged ?? 0} flagged. Sign-up is instant; nothing waits for approval.</Body>}
      {onOpenSignups ? <Button variant="secondary" height={44} onClick={onOpenSignups} style={{ marginTop: 12, boxShadow: 'none' }}>Open sign-ups</Button> : null}
    </Card>
  );
}
```
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

- [ ] **Step 9: Run** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/screens/AdminSignups.test.js src/portal/screens/AdminDashboard.test.js` - Expected: PASS. `wc -l frontend/src/portal/screens/AdminDashboard.js` under 500.

- [ ] **Step 10: Commit**
```bash
git add frontend/src/portal/data/signups.js frontend/src/portal/data/signups.test.js frontend/src/portal/screens/AdminSignups.js frontend/src/portal/screens/AdminSignups.test.js frontend/src/portal/screens/AdminDashboard.js frontend/src/portal/screens/AdminDashboard.test.js frontend/src/portal/components/BottomTabBar.js frontend/src/portal/PortalRoutes.js
git commit -m "feat(admin): sign-ups report with filters, dashboard Sign-ups card, admin hidden from mental (#11)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Launch fixes - catch-all route, attendance durations, email copy, 375px pass (closes #12)

**Files:**
- Modify: `frontend/src/portal/PortalRoutes.js:336-353,386-404,768`, `frontend/src/portal/screens/BookSession.js:774-778`
- Test: `frontend/src/portal/PortalRoutes.test.js`

**Interfaces:**
- Consumes: `Navigate` (react-router); `s.durationMinutes` on `useSpecialistSessions` rows and `block.durationMinutes` from CoachDashboard (contract 4.3 / spec 6.1: slot payloads carry `durationMinutes`); `Roster.js:40` reads `block.durationMinutes`.
- Produces: `path="*"` -> `/portal` (PortalIndex decides sign-in vs landing); attendance navigation state `block.durationMinutes`.

- [ ] **Step 1: Write the failing test**

`frontend/src/portal/PortalRoutes.test.js`:
```js
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

test('an unknown portal path lands on the index (K18)', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let loc = null;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/portal/does-not-exist']}>
        <Spy onLoc={(l) => { loc = l; }} />
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
  expect(loc.pathname).toBe('/portal');
  expect(container.textContent).toContain('HARNESS');
  await act(async () => { root.unmount(); });
});
```
(If the import graph of every screen trips jsdom on a library that expects a browser global, mock that one screen module with `jest.mock('./screens/<Name>', () => ({ __esModule: true, default: () => null }))` and say which in the sprint report; the route tree, not the screens, is under test.)

- [ ] **Step 2: Run it** - Expected: FAIL (no route matches; `loc.pathname` stays `/portal/does-not-exist`).

- [ ] **Step 3: Implement**

`PortalRoutes.js`, last route before `</Routes>`:
```js
      {/* K18: an unknown path lands on the index, which sends a signed-in
          account home and everyone else to sign-in. */}
      <Route path="*" element={<Navigate to="/portal" replace />} />
```
`SpecialistDayRoute` block state (line 341-347) gains `durationMinutes: s.durationMinutes ?? null,`; `CoachDashboardRoute` block (396-402) gains `durationMinutes: block.durationMinutes ?? null,`.

`BookSession.js:774-778` (K30 - after the functions deploy `onBookingCreated` emails the guardian through `sendNotice`, so the promise is kept true rather than removed):
```js
          {c.email ? (
            <Body size={13} style={{ marginTop: 8 }}>
              A confirmation is on its way to {c.email} - it also appears under your notices.
            </Body>
          ) : null}
```
Registration's success copy (Task 6) and NotProvisioned (Task 7) already state what sends.

- [ ] **Step 4: Run** - `cd frontend && CI=true npx react-scripts test --watchAll=false src/portal/PortalRoutes.test.js` then the whole suite `cd frontend && CI=true npx react-scripts test --watchAll=false` - Expected: PASS. `cd frontend && npx eslint src/portal` - clean. `cd frontend && npm run build` - succeeds (this is the Railway build; `REACT_APP_*` are absent locally, which is fine for a compile check).

- [ ] **Step 5: 375px layout pass** (spec issue #7/#9/#11 "375px layout check")

Run `cd frontend && PORT=3001 npm start` (seed mode: no `REACT_APP_PORTAL_LIVE_DATA`; `frontend/.env` must carry the `REACT_APP_FIREBASE_*` names for `src/firebase.js` to load - values are never printed). In the browser at 375x812 (devtools device toolbar), walk and screenshot: `/portal/signup`; `/portal` harness cards `02 Registration` (guardian, athlete, tier, consent, success) and `NP Not provisioned`; `/portal/family` and `/portal/billing` (seed shows no pending banner - confirm the layout of `PendingBanner` by temporarily mounting `<PendingBanner pendingAthletes={[{athleteId:'x',name:'A very long athlete name'}]} />` in the harness, then revert); `/portal/coaching` with `REACT_APP_CALENDLY_MENTAL_URL` set in `.env` to any https URL (the `CalendlyPanel` renders when the routing lane's hook flags `bookingMode: 'calendly'`); `/portal/admin/signups` (seed rows come from routing's seed branch). Pass criteria: no horizontal scroll, every button at least 44px tall, the Pay now column (132px) never wraps the athlete name below it. Fix any overflow in the component that owns it and re-run the affected test file.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/portal/PortalRoutes.js frontend/src/portal/PortalRoutes.test.js frontend/src/portal/screens/BookSession.js
git commit -m "fix(portal): catch-all route, attendance block durations, confirmation copy matches what sends (#12)" -m "Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review against the spec (done while writing; the executor re-runs it at the end)

- 2.1 step 0 / 3.1: Task 3. 2.1 register/steps/Success: Tasks 4-6. 2.3 link mode: Task 5. 2.4 legacy states + Approve removed: Tasks 7, 13. 3.2 client states + Check again + login line: Tasks 7, 10. 4.2 Success pay buttons + `?paid=`: Tasks 6, 8, 9. 4.4 pending copy on every reader: Tasks 8-10. 4.5 facility card: Tasks 9, 10. 6.1 Calendly button/gates/note/non-cancellable rows/durations: Tasks 11, 12, 14. 7 report + dashboard card: Task 13. 9: catch-all (14), email copy (6, 7, 14), 95->90 (1), admin hidden from mental (3, 13), walkthrough loop (5, 6), Link another athlete (5). 11 frontend unit rows: claim-state table (Task 3), payload builder (Task 2); `bookingOpen`, window 30, link builder, K04, `statusFor('pending')` are routing-lane tests.
- Every hook/callable name used is from the contract, except the four flagged handoffs: `useAthleteDetail` `loginEmail`/`login`, `hubMemberFor` `facilityAccessConsent`, `useSpecialistSlots` `householdId`, and `BOOKING_OPENS_LABEL` if routing has not exported it yet.
