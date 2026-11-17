import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import StatusBadge from '../components/StatusBadge';
import DoorCard from '../components/door/DoorCard';
import DoorChoice from '../components/door/DoorChoice';
import { DoorActivityCard, DoorPausesCard } from '../components/door/DoorActivity';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useDoorAdmin } from '../hooks/doorAdmin';
import { currentLocation } from '../hooks/door';
import { MODES, NEEDS_LOCATION, OPEN_SECONDS_MAX, OPEN_SECONDS_MIN, RADIUS_OPTIONS, locationSet } from '../data/doorAdmin';
import { doorCopy } from '../data/doorRules';

const SAVE_FAILED = "Didn't save. Check your connection and try again.";
const saveMessage = (err) => (err && err.message === NEEDS_LOCATION ? NEEDS_LOCATION : SAVE_FAILED);

/**
 * Facility door, the staff screen (docs/portal/plans/2026-11-17-door-button/
 * 00-spec.md 7): /portal/admin/door for the owner and ops, from the Admin
 * screen's Facility door card.
 *
 * - Who can unlock: Off / Staff only / Everyone (doorConfig/main.mode).
 *   Everyone stays off until the academy location is set.
 * - Academy location: set or not, "Use this phone's location" (standing
 *   inside the academy), the reach (100/200/300/500 m) and the door's open
 *   time in seconds.
 * - Staff unlock: the door card's control, no location check (the server
 *   lets owner and ops in from anywhere), rechecked after each saved change.
 * - Recent activity and Paused families (components/door/DoorActivity.js).
 *
 * @param {'owner'|'ops'} role  The signed-in staff role (the tab bar).
 * @param {() => void} onBack  Back to Admin.
 */
export default function AdminDoor({ role = 'owner', onBack, bare = false }) {
  const admin = useDoorAdmin();
  const { config, loading, error } = admin;

  let body;
  if (loading) {
    body = <SkeletonCard large height={180} />;
  } else if (error || !config) {
    body = (
      <ErrorNotice title="The door settings didn't load" onRetry={admin.reload}>
        Check your connection and try again.
      </ErrorNotice>
    );
  } else {
    body = (
      <>
        <WhoCard config={config} onSave={admin.saveConfig} />
        <LocationCard config={config} onSave={admin.saveConfig} />
        <DoorCard staffScreen label="Staff unlock" recheckKey={config.updatedAtMs} />
        <DoorActivityCard events={admin.events} error={admin.eventsError} onRefresh={admin.refreshEvents} />
        <DoorPausesCard pauses={admin.pauses} onPause={admin.pause} onUnpause={admin.unpause} />
      </>
    );
  }

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <BackLink onClick={onBack}>‹ Admin</BackLink>
          <ScreenTitle size={22} style={{ marginTop: 8 }}>
            Facility door
          </ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>{body}</div>
    </PhoneFrame>
  );
}

/** A save run by a card: its own error line, cleared on the next try. */
function useSave(onSave) {
  const [error, setError] = useState(null);
  const save = async (patch) => {
    setError(null);
    try {
      await onSave(patch);
      return true;
    } catch (err) {
      setError(saveMessage(err));
      return false;
    }
  };
  return [save, error, setError];
}

function ErrorLine({ children }) {
  return children ? (
    <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
      {children}
    </Body>
  ) : null;
}

/** Who can unlock: Off / Staff only / Everyone; Everyone waits for the academy location. */
function WhoCard({ config, onSave }) {
  const [save, error] = useSave(onSave);
  const located = locationSet(config);
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 10 }}>Who can unlock</SectionLabel>
      <DoorChoice
        label="Who can unlock"
        value={config.mode}
        options={MODES.map(([id, text]) => ({ id, text, disabled: id === 'all' && !located }))}
        onChange={(mode) => save({ mode })}
      />
      {located ? null : (
        <Body size={12} style={{ marginTop: 8 }}>
          Everyone turns on once the academy location is set.
        </Body>
      )}
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}

/** Academy location, the reach and the door's open time. */
function LocationCard({ config, onSave }) {
  const [save, error, setError] = useSave(onSave);
  const [locating, setLocating] = useState(false);
  const [fix, setFix] = useState(null);
  const located = locationSet(config);

  const useHere = async () => {
    setLocating(true);
    setError(null);
    setFix(null);
    try {
      const here = await currentLocation();
      if (await save({ lat: here.lat, lng: here.lng })) setFix(Math.round(here.accuracy));
    } catch (err) {
      setError(doorCopy('location-needed'));
    } finally {
      setLocating(false);
    }
  };

  const secs = config.openSeconds;
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <SectionLabel>Academy location</SectionLabel>
        <StatusBadge tone={located ? 'green' : 'neutral'}>{located ? 'Set' : 'Not set'}</StatusBadge>
      </div>
      <Button variant="secondary" height={46} loading={locating} onClick={useHere} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>
        Use this phone's location
      </Button>
      <Body size={12} tone={color.textTertiary} style={{ marginTop: 6 }}>
        Stand inside the academy, then tap it.
      </Body>
      {fix != null ? (
        <Body size={12} tone={color.primary} style={{ marginTop: 6 }}>
          Set from this phone, accurate to about {fix} m.
        </Body>
      ) : null}

      <SectionLabel style={{ marginTop: 16, marginBottom: 8 }}>Reach from the academy</SectionLabel>
      <DoorChoice
        label="Reach from the academy"
        value={config.radiusM}
        options={RADIUS_OPTIONS.map((m) => ({ id: m, text: `${m} m` }))}
        onChange={(radiusM) => save({ radiusM })}
      />

      <SectionLabel style={{ marginTop: 16, marginBottom: 8 }}>Door open time</SectionLabel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StepButton label="One second less" disabled={secs <= OPEN_SECONDS_MIN} onClick={() => save({ openSeconds: secs - 1 })}>
          −
        </StepButton>
        <div style={{ minWidth: 56, textAlign: 'center', font: `600 16px ${font.body}`, color: color.text }}>{secs} s</div>
        <StepButton label="One second more" disabled={secs >= OPEN_SECONDS_MAX} onClick={() => save({ openSeconds: secs + 1 })}>
          +
        </StepButton>
      </div>
      <Body size={12} tone={color.textTertiary} style={{ marginTop: 6 }}>
        Match the door's own unlock time; the app counts it down after an unlock.
      </Body>
      <ErrorLine>{error}</ErrorLine>
    </Card>
  );
}

function StepButton({ label, disabled, onClick, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        flex: 'none',
        borderRadius: radius.input,
        border: `1px solid ${color.border}`,
        background: color.track,
        font: `600 18px ${font.body}`,
        color: disabled ? color.faintText : color.text,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  );
}
