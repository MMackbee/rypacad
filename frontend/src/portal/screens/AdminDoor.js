import React from 'react';
import BottomTabBar from '../components/BottomTabBar';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import DoorCard from '../components/door/DoorCard';
import DoorChoice from '../components/door/DoorChoice';
import DoorLocationCard, { ErrorLine, useDoorSave } from '../components/door/DoorLocationCard';
import { DoorActivityCard, DoorPausesCard } from '../components/door/DoorActivity';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useDoorAdmin } from '../hooks/doorAdmin';
import { MODES, locationSet } from '../data/doorAdmin';

/**
 * Facility door, the staff screen (docs/portal/plans/2026-11-17-door-button/
 * 00-spec.md 7): /portal/admin/door for the owner and ops, from the Admin
 * screen's Facility door card.
 *
 * - Who can unlock: Off / Staff only / Everyone (doorConfig/main.mode).
 *   Everyone stays off until the academy location is set.
 * - Academy location (components/door/DoorLocationCard.js): set or not,
 *   "Use this phone's location" (a fresh reading inside the academy, asked
 *   before it is saved), "Check this phone's distance", the reach
 *   (100/200/300/500 m) and the door's open time (a choice of 3 s to
 *   10 min, matching the door's Entry open duration in Alta).
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
        <DoorLocationCard config={config} onSave={admin.saveConfig} />
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

/** Who can unlock: Off / Staff only / Everyone; Everyone waits for the academy location. */
function WhoCard({ config, onSave }) {
  const [save, error] = useDoorSave(onSave);
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
