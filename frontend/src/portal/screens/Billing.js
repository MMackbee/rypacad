import React from 'react';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import SequenceLadder from '../components/SequenceLadder';
import StatusBadge from '../components/StatusBadge';
import Field from '../components/Field';
import { Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useBilling, useBillingSummary } from '../hooks';

/**
 * 10 · Billing & Subscription - parent.
 * States: Active, Retry 1, Retry 3, Access restricted, Updating card.
 *
 * This screen is where flag 04 is resolved. Stripe retries three times across
 * ten days before booking access is restricted, and the parent has to know
 * exactly where in that sequence they are. One red cannot express four
 * escalating states: a parent shown maximum alarm at retry 1 has learned to
 * ignore it by retry 3.
 *
 * So the ladder grades - caution, amber-red, red, solid red - and the position
 * is drawn rather than implied. The amber-red mid value is `color.errorMid`,
 * the one token this adds to the brief.
 *
 * Card data never passes through app servers: the update flow is a Stripe
 * Elements iframe, and only stripe_customer_id / stripe_subscription_id are
 * stored.
 *
 * @param {'active'|'retry1'|'retry3'|'restricted'|'updating'} variant
 */
export default function Billing({ variant = 'active', bare = false }) {
  const { data } = useBilling({ variant: variant === 'updating' ? 'retry3' : variant });
  const summary = useBillingSummary();

  if (variant === 'updating') return <UpdatingCard bare={bare} />;

  const state = data?.state;
  const showLadder = state?.ladderAt != null;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <ScreenTitle size={22}>Billing</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role="parent" active="billing" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <HeroCard state={state} />

        {showLadder ? (
          <Card large>
            <SectionLabel style={{ marginBottom: 15 }}>Retry sequence</SectionLabel>
            <SequenceLadder rungs={data.ladder} current={state.ladderAt} />
          </Card>
        ) : null}

        <SubscriptionRows rows={summary.data?.rows ?? []} />
        <MembershipCard rows={summary.data?.rows ?? []} />
        <PaymentMethodCard method={data?.paymentMethod} declining={data?.declining} />
        <InvoiceHistory invoices={data?.invoices ?? []} />
      </div>
    </PhoneFrame>
  );
}

/** One subscription row per child (Sprint 5 pin) - package, price, status. */
function SubscriptionRows({ rows }) {
  if (!rows.length) return null;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Athletes on this plan</SectionLabel>
      {rows.map((row, i) => (
        <div
          key={row.athleteId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 0',
            borderBottom: i < rows.length - 1 ? `1px solid ${color.ruleSoft}` : 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 13px ${font.body}`, color: color.text }}>{row.name}</div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {row.packageName}
              {row.price != null ? ` · $${row.price}/mo` : ''}
            </div>
          </div>
          <StatusBadge tone={row.status === 'active' ? 'green' : 'neutral'}>
            {row.status}
          </StatusBadge>
        </div>
      ))}
    </Card>
  );
}

function HeroCard({ state }) {
  if (!state) return null;

  const surfaces = {
    default: { background: color.surface, border: color.border },
    yellow: { background: 'rgba(244,238,25,.06)', border: color.secondary },
    red: { background: 'rgba(255,68,68,.07)', border: color.error },
  };
  const s = surfaces[state.tone] || surfaces.default;

  return (
    <div
      style={{
        background: s.background,
        border: `1px solid ${s.border}`,
        borderRadius: radius.cardLarge,
        padding: 17,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <SectionLabel style={{ flex: 1 }}>Subscription</SectionLabel>
        <StatusBadge tone={state.badge.tone}>{state.badge.label}</StatusBadge>
      </div>

      <ScreenTitle size={22} style={{ marginTop: 12 }}>
        {state.title}
      </ScreenTitle>

      <Body size={13} style={{ marginTop: 10 }}>
        {state.body}
      </Body>

      {state.cta ? (
        <Button variant={state.cta.variant} height={50} style={{ marginTop: 15, boxShadow: 'none' }}>
          {state.cta.label}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * QA #12 fix (Sprint 6, TEAM.md): this card said "2 athletes" from
 * data/parent.js's static MEMBERSHIP seed while SubscriptionRows above it
 * renders one row per child from the live billing summary - the two could
 * only agree by coincidence. Derived from the exact same `rows` the list
 * renders instead, so the count can never drift again. Package name follows
 * the same rule: the household's children are not all on the same package
 * (Sprint 5 pin, "Billing lists one row per child"), so a single tier name
 * is only shown when every row actually shares one - otherwise every
 * distinct package the household is on is listed, never one picked at
 * random.
 */
function MembershipCard({ rows }) {
  if (!rows.length) return null;
  const uniqueNames = [...new Set(rows.map((r) => r.packageName).filter(Boolean))];

  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 12 }}>Membership</SectionLabel>
      <div style={{ font: `600 15px ${font.body}`, color: color.text }}>
        {uniqueNames.length ? uniqueNames.join(' · ') : '—'}
      </div>
      <div style={{ font: `400 12px ${font.body}`, color: color.textTertiary, marginTop: 4 }}>
        {rows.length} {rows.length === 1 ? 'athlete' : 'athletes'} · billed monthly
      </div>
    </Card>
  );
}

function PaymentMethodCard({ method, declining }) {
  if (!method) return null;
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 13 }}>Payment method</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <MediaPlaceholder height={26} style={{ width: 40, flex: 'none' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              font: `600 14px ${font.body}`,
              color: declining ? color.error : color.text,
            }}
          >
            {method.label}
          </div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
            {declining ? method.declining : method.expires}
          </div>
        </div>
        <span style={{ font: `500 13px ${font.body}`, color: color.primary, cursor: 'pointer' }}>
          Change
        </span>
      </div>
    </Card>
  );
}

function InvoiceHistory({ invoices }) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Invoice history</SectionLabel>
      {invoices.map((inv, i) => (
        <div
          key={inv.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '13px 0',
            borderBottom: i < invoices.length - 1 ? `1px solid ${color.ruleSoft}` : 'none',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `500 13px ${font.body}`, color: color.text }}>{inv.month}</div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>
              {inv.date}
            </div>
          </div>
          {/*
            Amounts stay as a dashed slot. The handoff's exclusion list ends with
            "Any specific dollar figure, anywhere", and an invoice total is
            exactly that - the confirmed package prices do not make a historical
            charge a decided number.
          */}
          <span style={{ font: `600 11px ${font.mono}`, color: color.secondary }}>$ ——</span>
          <StatusBadge tone={inv.paid ? 'green' : 'red'}>{inv.paid ? 'Paid' : 'Unpaid'}</StatusBadge>
        </div>
      ))}
    </Card>
  );
}

function UpdatingCard({ bare }) {
  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <ScreenTitle size={22}>Update card</ScreenTitle>
        </div>
      }
      footer={
        <div style={{ borderTop: `1px solid ${color.frameRule}`, padding: '14px 22px 22px' }}>
          <Button>Save and retry now</Button>
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/*
          Card fields render inside Stripe's iframe, never in our DOM. This
          placeholder marks where it mounts - recreating those fields locally
          would pull the app into PCI scope.
        */}
        <MediaPlaceholder
          height={92}
          caption="STRIPE ELEMENTS IFRAME — card fields never render in our DOM"
        />

        <Field label="Billing postal code" value="" placeholder="55344" onChange={() => {}} />

        <Body size={12}>
          Saving a working card retries the open invoice immediately. If it clears, booking access is
          restored the same minute.
        </Body>
      </div>
    </PhoneFrame>
  );
}
