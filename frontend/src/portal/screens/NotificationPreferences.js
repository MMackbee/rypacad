import React, { useState } from 'react';
import { color, font, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import { Toggle } from '../components/Toggle';
import { Body, Card, ScreenTitle, Tick } from '../components/Primitives';
import { useNotificationPrefs } from '../hooks';

/**
 * 11 · Notification Preferences - parent.
 * States: Default, Saved.
 *
 * Two channels per category, not one master toggle. Categories differ in
 * urgency: a schedule change 40 minutes before a block needs SMS, a newsletter
 * never does, and collapsing them into one switch forces a parent to choose
 * between being spammed and missing the thing that mattered.
 *
 * Billing is locked on. Failed-payment notices are transactional rather than
 * marketing, and a parent who silenced them would stop hearing that their
 * child's booking is about to be restricted.
 *
 * @param {'default'|'saved'} variant
 */
export default function NotificationPreferences({ variant = 'default', bare = false }) {
  const { data } = useNotificationPrefs({ variant });

  // Local state holds only the parent's changes, keyed "categoryId.channel";
  // anything untouched reads its default from the hook data at render time.
  // Seeding a useState from `data` would freeze empty the moment the seam
  // returns asynchronously - the first render of a real fetch has data: null,
  // and a lazy initializer never runs again.
  const [overrides, setOverrides] = useState({});

  const valueFor = (cat, channel) => overrides[`${cat.id}.${channel}`] ?? cat[channel];
  const set = (cat, channel, value) =>
    setOverrides((prev) => ({ ...prev, [`${cat.id}.${channel}`]: value }));

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <ScreenTitle size={22}>Notifications</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role="parent" active="settings" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data?.saved ? <SavedToast /> : null}

        <ChannelHeader />

        {(data?.categories ?? []).map((cat) => (
          <CategoryCard
            key={cat.id}
            category={cat}
            value={{ email: valueFor(cat, 'email'), sms: valueFor(cat, 'sms') }}
            onChange={(channel, v) => set(cat, channel, v)}
          />
        ))}

        <Body size={11} tone={color.textTertiary}>
          {data?.note}
        </Body>
      </div>
    </PhoneFrame>
  );
}

function SavedToast() {
  return (
    <div
      style={{
        background: 'rgba(0,175,81,.1)',
        border: `1px solid ${color.primary}`,
        borderRadius: 10,
        padding: '11px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <span
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: color.primary,
          display: 'grid',
          placeItems: 'center',
          flex: 'none',
        }}
      >
        <Tick size={9} />
      </span>
      <span style={{ font: `500 13px ${font.body}`, color: color.primary }}>Preferences saved</span>
    </div>
  );
}

/** Labels the two 52px toggle columns once, rather than per card. */
function ChannelHeader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 15px' }}>
      <div style={{ flex: 1 }} />
      {['Email', 'SMS'].map((label) => (
        <div
          key={label}
          style={{
            width: 52,
            flex: 'none',
            textAlign: 'center',
            font: `400 9px ${font.body}`,
            textTransform: 'uppercase',
            letterSpacing: '.1em',
            color: color.disabledText,
          }}
        >
          {label}
        </div>
      ))}
    </div>
  );
}

function CategoryCard({ category, value, onChange }) {
  const locked = category.locked;

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{category.name}</div>
          <div
            style={{ font: `400 11px/1.5 ${font.body}`, color: color.textTertiary, marginTop: 4 }}
          >
            {category.description}
          </div>
        </div>

        {['email', 'sms'].map((channel) => (
          <div key={channel} style={{ width: 52, flex: 'none', display: 'grid', placeItems: 'center' }}>
            {locked ? (
              <LockedToggle label={`${category.name} ${channel}`} />
            ) : (
              <Toggle
                checked={value[channel]}
                onChange={(v) => onChange(channel, v)}
                label={`${category.name} ${channel}`}
              />
            )}
          </div>
        ))}
      </div>

      {category.footnote ? (
        <div
          style={{
            font: `400 10px ${font.body}`,
            color: color.secondary,
            marginTop: 11,
          }}
        >
          {category.footnote}
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Visibly on and visibly not interactive. Hiding the control entirely would
 * leave a parent wondering whether billing notices are configured at all.
 */
function LockedToggle({ label }) {
  return (
    // Same 52x44 footprint as the live Toggle so the columns align and the
    // (deliberately inert) control still meets the touch floor.
    <span
      role="switch"
      aria-checked="true"
      aria-disabled="true"
      aria-label={`${label} — always on`}
      style={{
        width: 52,
        height: 44,
        display: 'grid',
        placeItems: 'center',
        cursor: 'not-allowed',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 42,
          height: 25,
          borderRadius: radius.round,
          background: 'rgba(0,175,81,.35)',
          border: '1px solid rgba(0,175,81,.5)',
          padding: 2,
          boxSizing: 'border-box',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            width: 19,
            height: 19,
            borderRadius: '50%',
            background: tint.greenStrong,
            display: 'block',
          }}
        />
      </span>
    </span>
  );
}
