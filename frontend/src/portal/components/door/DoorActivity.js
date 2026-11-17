import React, { useCallback, useEffect, useState } from 'react';
import { TOUCH_MIN, color, font, radius } from '../../tokens';
import Button from '../Button';
import StatusBadge from '../StatusBadge';
import AthleteSearch from '../staffBooking/AthleteSearch';
import { Body, Card, SectionLabel } from '../Primitives';
import { useHouseholdsDirectory } from '../../hooks/billing';
import { eventRow, pausedRow, pauseTarget } from '../../data/doorAdmin';

const TONE_COLOR = { green: color.primary, red: color.error, yellow: color.secondary, neutral: color.textSecondary };

const linkStyle = {
  background: 'none',
  border: 'none',
  padding: '0 0 0 12px',
  minHeight: TOUCH_MIN,
  margin: `${-(TOUCH_MIN - 16) / 2}px 0`,
  font: `500 12px ${font.body}`,
  color: color.primary,
  cursor: 'pointer',
};

/**
 * Recent activity on the Facility door screen (spec 7): the latest 50
 * doorEvents, newest first - who, their family, what happened and why, how
 * far from the academy, when (America/Chicago). Refresh reads them again.
 */
export function DoorActivityCard({ events, error, onRefresh }) {
  let body;
  if (error) body = <Body size={12} tone={color.error}>Activity didn't load.</Body>;
  else if (!events) body = <Body size={12}>Loading…</Body>;
  else if (!events.length) body = <Body size={12}>No unlocks yet.</Body>;
  else {
    body = (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {events.map((e, i) => {
          const row = eventRow(e);
          const what = `${row.family} · ${row.outcome}${row.reason ? `: ${row.reason}` : ''}${row.distance ? ` · ${row.distance}` : ''}`;
          return (
            <div key={row.id || i} style={{ padding: '10px 0', borderTop: i ? `1px solid ${color.rule}` : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ flex: 1, minWidth: 0, font: `600 13px ${font.body}`, color: color.text, overflowWrap: 'anywhere' }}>{row.name}</span>
                {row.test ? <StatusBadge>Test</StatusBadge> : null}
                <span style={{ flex: 'none', font: `400 11px ${font.body}`, color: color.textTertiary }}>{row.when}</span>
              </div>
              <div style={{ marginTop: 3, font: `400 12px/1.45 ${font.body}`, color: TONE_COLOR[row.tone] || color.textSecondary, overflowWrap: 'anywhere' }}>
                {what}
              </div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <SectionLabel>Recent activity</SectionLabel>
        <button type="button" onClick={onRefresh} style={linkStyle}>
          Refresh
        </button>
      </div>
      {body}
    </Card>
  );
}

/**
 * Loads the households directory (every household and every athlete) and
 * hands it up. Mounted only while the card needs it (review 2026-11-17
 * app-9): a paused family to name, or the Pause search in use. `fresh` is
 * false while the shared cache's copy shows and the read is still running.
 */
function DirectoryLoader({ onData }) {
  const { data, isRefreshing } = useHouseholdsDirectory();
  const fresh = Boolean(data) && isRefreshing !== true;
  useEffect(() => {
    onData(data || null, fresh);
  }, [data, fresh, onData]);
  return null;
}

/**
 * Paused families (spec 7): each paused household by name with Unpause, and
 * Pause a family - find an athlete, confirm, and their household is paused.
 * Athletes in a household already paused read "Paused" and cannot be picked
 * (the rules allow no second pause doc); a family another staff member
 * paused meanwhile reads "already paused" (onPause answers 'already').
 * Family names come from the households directory, loaded only when a
 * family is paused or the search is first used - not on every open. The
 * pick may come from a cached copy of it (review 2026-11-17): Pause waits
 * for the fresh read and pauses the family THAT puts the athlete in.
 */
export function DoorPausesCard({ pauses, onPause, onUnpause }) {
  const [searching, setSearching] = useState(false);
  const [directory, setDirectory] = useState(null);
  const [fresh, setFresh] = useState(false);
  const onDirectory = useCallback((data, isFresh) => {
    setDirectory(data);
    setFresh(isFresh);
  }, []);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [note, setNote] = useState(null);
  const needsDirectory = searching || (pauses || []).length > 0;
  const names = Object.fromEntries((directory || []).map((h) => [h.id, h.name]));
  const pausedIds = new Set((pauses || []).map((p) => p.householdId));
  const pausedAthletes = (directory || []).filter((h) => pausedIds.has(h.id)).flatMap((h) => (h.athletes || []).map((a) => a.id));
  const rows = (pauses || []).map((p) => pausedRow(p, names));
  const target = picked && fresh ? pauseTarget(directory, picked.athleteId) : null;

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError("Didn't save. Check your connection and try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const confirmPause = async () => {
    if (!target) return;
    const family = target.householdName || 'That family';
    let answer = null;
    if (await run(async () => { answer = await onPause(target.householdId); })) {
      setPicked(null);
      if (answer === 'already') setNote(`${family} is already paused.`);
    }
  };

  return (
    <Card large>
      {needsDirectory ? <DirectoryLoader onData={onDirectory} /> : null}
      <SectionLabel style={{ marginBottom: 8 }}>Paused families</SectionLabel>
      {rows.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map((row) => (
            <div key={row.householdId} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ font: `600 13px ${font.body}`, color: color.text, overflowWrap: 'anywhere' }}>{row.name}</div>
                <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>{row.since}</div>
              </div>
              <Button
                variant="outline"
                height={40}
                disabled={busy}
                aria-label={`Unpause ${row.name}`}
                onClick={() => run(() => onUnpause(row.householdId))}
                style={{ width: 'auto', flex: 'none', boxShadow: 'none', font: `600 13px ${font.body}` }}
              >
                Unpause
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <Body size={12}>No family is paused.</Body>
      )}
      <div style={{ height: 1, background: color.rule, margin: '14px 0' }} />
      <SectionLabel style={{ marginBottom: 8 }}>Pause a family</SectionLabel>
      {picked ? (
        <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.input, padding: 12 }}>
          <div style={{ font: `600 13px ${font.body}`, color: color.text }}>
            Pause door unlocking for {(target || picked).householdName || picked.name}?
          </div>
          <Body size={12} style={{ marginTop: 4 }}>
            {fresh && !target
              ? `${picked.name} isn't on file any more. Cancel and search again.`
              : 'Nobody in the family can unlock the door until you unpause it. Staff can still let them in.'}
          </Body>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            {/* Waits (a spinner) for the fresh directory: the pause goes where the athlete lives now. */}
            <Button variant="dangerOutline" height={44} loading={busy || !fresh} disabled={fresh && !target} onClick={confirmPause} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>
              Pause
            </Button>
            <Button variant="outline" height={44} disabled={busy} onClick={() => setPicked(null)} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div onFocus={() => setSearching(true)}>
          <AthleteSearch onPick={setPicked} disabledIds={pausedAthletes} disabledLabel="Paused" />
        </div>
      )}
      {note ? (
        <Body size={12} tone={color.text} style={{ marginTop: 10 }}>
          {note}
        </Body>
      ) : null}
      {error ? (
        <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
          {error}
        </Body>
      ) : null}
    </Card>
  );
}
