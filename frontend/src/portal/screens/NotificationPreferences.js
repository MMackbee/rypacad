import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TOUCH_MIN, color, font, radius, tint } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import ProfileCard from '../components/ProfileCard';
import RecentNotices from '../components/RecentNotices';
import PhoneFrame from '../components/PhoneFrame';
import SavedToast from '../components/SavedToast';
import { Toggle } from '../components/Toggle';
import { SectionLabel, Body, Card, ScreenTitle } from '../components/Primitives';
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
 * Sprint 5 pins (TEAM.md): "Link another athlete" moves here from the family
 * dashboard, and every role needs a visible sign-out affordance - Settings is
 * where the parent's lives, at the bottom of the screen.
 *
 * Sprint 11 pin D entry point (TEAM.md, contract v1.9): "Settings gains a
 * 'Membership' row (parent + athlete)." `role` is new this sprint, defaulting
 * to 'parent' to match every existing caller — PortalRoutes' /portal/settings
 * route is still `RequireRole roles={['parent']}` only (PortalRoutes.js is
 * not this lane's to edit) and this screen's own footer/copy were parent-only
 * throughout, so an athlete cannot reach this screen at all yet even with the
 * row added here. Flagged in the sprint report: routing needs to widen that
 * RequireRole to include 'athlete' and give athlete's tab bar (which has no
 * Settings slot — components/BottomTabBar.js's TABS.athlete) some way in.
 *
 * @param {'default'|'saved'} variant
 * @param {'parent'|'athlete'} [role]
 * @param {() => void} [onLinkAthlete]  Opens 08·L. Row hides without it
 *   (also parent-only — an athlete has no household to link a sibling into).
 * @param {() => void} [onSignOut]  Hidden when not supplied (harness/demo).
 */
export default function NotificationPreferences({
  variant = 'default',
  bare = false,
  role = 'parent',
  onLinkAthlete,
  onSignOut,
}) {
  const prefsState = useNotificationPrefs({ variant });
  const { data } = prefsState;
  /**
   * Sprint 10 pin G (TEAM.md, contract v1.8): useNotificationPrefs gains
   * save(prefs) writing the whole notificationPrefs map in one shot (rules:
   * the one self-write the users collection allows, hasOnly(['notificationPrefs'])).
   * FALLBACK FLAG: this worktree's useNotificationPrefs has no `save` export
   * yet (routing lane's parallel worktree) — the inert fallback below echoes
   * the object back successfully so the toggle → save → toast flow is fully
   * wired and reviewable, but nothing persists until routing lands the real
   * write. Flagged in the sprint report.
   */
  const save = prefsState.save || (async (prefs) => prefs);

  // Local state holds only the parent's changes, keyed "categoryId.channel";
  // anything untouched reads its default from the hook data at render time.
  // Seeding a useState from `data` would freeze empty the moment the seam
  // returns asynchronously - the first render of a real fetch has data: null,
  // and a lazy initializer never runs again.
  const [overrides, setOverrides] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = React.useRef(null);
  React.useEffect(() => () => savedTimer.current && clearTimeout(savedTimer.current), []);

  const valueFor = (cat, channel) => overrides[`${cat.id}.${channel}`] ?? cat[channel];

  // A real save, not just local state: every toggle persists the FULL prefs
  // map immediately (the rules-gated field is a whole-map replace, not a
  // per-toggle patch), then the shared SavedToast confirms it landed.
  const persist = async (nextOverrides) => {
    const categories = data?.categories ?? [];
    const prefs = {};
    categories.forEach((cat) => {
      prefs[cat.id] = {
        email: nextOverrides[`${cat.id}.email`] ?? cat.email,
        sms: nextOverrides[`${cat.id}.sms`] ?? cat.sms,
      };
    });
    setSaving(true);
    setSaveError(null);
    try {
      await save(prefs);
      setJustSaved(true);
      if (savedTimer.current) clearTimeout(savedTimer.current);
      savedTimer.current = setTimeout(() => setJustSaved(false), 2600);
    } catch (err) {
      setSaveError(
        err && typeof err.message === 'string' && err.message
          ? err.message
          : 'Your preferences did not save. Try again.'
      );
    } finally {
      setSaving(false);
    }
  };

  const set = (cat, channel, value) => {
    setOverrides((prev) => {
      const next = { ...prev, [`${cat.id}.${channel}`]: value };
      persist(next);
      return next;
    });
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <ScreenTitle size={22}>Settings</ScreenTitle>
        </div>
      }
      // athlete's tab set has no Settings slot (BottomTabBar.js's
      // TABS.athlete) — active stays unset for that role, same convention
      // every other tab-less destination in this codebase already uses.
      footer={<BottomTabBar role={role} active={role === 'parent' ? 'settings' : undefined} />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {saveError ? (
          <Body size={12} tone={color.error}>
            {saveError}
          </Body>
        ) : justSaved || data?.saved ? (
          <SavedToast message={saving ? 'Saving…' : 'Preferences saved'} />
        ) : null}

        <ProfileCard />

        <SectionLabel style={{ marginTop: 6 }}>Notifications</SectionLabel>
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

        <RecentNotices style={{ marginTop: 6 }} />

        {onLinkAthlete ? <LinkAthleteRow onLinkAthlete={onLinkAthlete} /> : null}
        <MembershipRow />
        <ReplayWalkthroughRow />
        <SignOutRow onSignOut={onSignOut} />
      </div>
    </PhoneFrame>
  );
}

/**
 * Moved here from the family dashboard (Sprint 5 pin) - same green-link row
 * idiom as "Replay the walkthrough" below it.
 */
function LinkAthleteRow({ onLinkAthlete }) {
  return (
    <div style={{ borderTop: `1px solid ${color.rule}`, marginTop: 8, paddingTop: 4 }}>
      <button
        type="button"
        onClick={onLinkAthlete}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          width: '100%',
          minHeight: TOUCH_MIN,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          font: `500 13px ${font.body}`,
          color: color.primary,
          cursor: 'pointer',
        }}
      >
        <span>+ Link another athlete</span>
        <span aria-hidden="true" style={{ color: color.textTertiary }}>
          ›
        </span>
      </button>
    </div>
  );
}

/**
 * Sprint 11 pin D entry point (TEAM.md, contract v1.9): "Settings gains a
 * 'Membership' row (parent + athlete)." Same green-link row idiom as
 * "Replay the walkthrough" below it, and the same direct-navigate()
 * precedent AthleteDashboard's own membership link and CoachingAction
 * already use (this lane never edits PortalRoutes.js) — one static internal
 * route needs no caller-supplied callback prop.
 */
function MembershipRow() {
  const navigate = useNavigate();
  return (
    <div style={{ borderTop: `1px solid ${color.rule}`, marginTop: 8, paddingTop: 4 }}>
      <button
        type="button"
        onClick={() => navigate('/portal/membership')}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          width: '100%',
          minHeight: TOUCH_MIN,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          font: `500 13px ${font.body}`,
          color: color.primary,
          cursor: 'pointer',
        }}
      >
        <span>Membership</span>
        <span aria-hidden="true" style={{ color: color.textTertiary }}>
          ›
        </span>
      </button>
    </div>
  );
}

/**
 * Sign-out row, bottom of Settings (Sprint 5 pin) - hidden without
 * `onSignOut`, exactly like every other role's affordance.
 */
function SignOutRow({ onSignOut }) {
  if (!onSignOut) return null;
  return (
    <div style={{ borderTop: `1px solid ${color.rule}`, marginTop: 4, paddingTop: 4 }}>
      <button
        type="button"
        onClick={onSignOut}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          width: '100%',
          minHeight: TOUCH_MIN,
          display: 'flex',
          alignItems: 'center',
          font: `500 13px ${font.body}`,
          color: color.error,
          cursor: 'pointer',
        }}
      >
        Sign out
      </button>
    </div>
  );
}

/**
 * Footer row: re-enter the onboarding walkthrough (Sprint 4, TEAM.md pins).
 * Settings is where a parent goes looking for it months later, so the entry
 * lives here rather than on a dashboard. Green text is the tappable-link idiom
 * ("Forgot password", "Start enrollment"); the button box keeps the 44px
 * touch floor even though the label is one line.
 */
function ReplayWalkthroughRow() {
  const navigate = useNavigate();
  return (
    <div style={{ borderTop: `1px solid ${color.rule}`, marginTop: 8, paddingTop: 4 }}>
      <button
        type="button"
        onClick={() => navigate('/portal/welcome')}
        style={{
          background: 'none',
          border: 'none',
          padding: '0 2px',
          width: '100%',
          minHeight: TOUCH_MIN,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          font: `500 13px ${font.body}`,
          color: color.primary,
          cursor: 'pointer',
        }}
      >
        <span>Replay the walkthrough</span>
        <span aria-hidden="true" style={{ color: color.textTertiary }}>
          ›
        </span>
      </button>
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
