import React, { useEffect, useRef, useState } from 'react';
import { color, font } from '../../tokens';
import Button from '../Button';
import TrialInput from './TrialInput';
import { CAP_SECONDS, holdLabel, round } from '../../data/assessmentScoring';

export const TICK_MS = 250;

/**
 * One McGill hold (protocol Section 3; spec 5): Start, then Stop when the
 * athlete loses position after the one warning. The hold is the clock time
 * since Start (Date.now()), not a count of ticks, so a tablet that sleeps
 * or a slow render loses nothing; it stops itself at 300 s and records 300,
 * shown "300+ (capped)". A time from a stopwatch can be typed instead.
 */
export default function HoldTimer({ label, value, onCommit, disabled = false }) {
  const [startedAt, setStartedAt] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const running = startedAt != null;
  const elapsed = running ? Math.min(CAP_SECONDS, (now - startedAt) / 1000) : null;

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (running && elapsed >= CAP_SECONDS) {
      setStartedAt(null);
      commit.current(CAP_SECONDS);
    }
  }, [running, elapsed]);

  const start = () => {
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
  };
  const stop = () => {
    const seconds = Math.min(CAP_SECONDS, round((Date.now() - startedAt) / 1000, 1));
    setStartedAt(null);
    onCommit(seconds);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div aria-live="polite" style={{ minWidth: 112, font: `700 20px ${font.head}`, color: running ? color.primary : color.text }}>
        {running ? `${Math.floor(elapsed)} s` : holdLabel(value)}
      </div>
      {running ? (
        <Button height={44} aria-label={`${label}: stop`} style={{ width: 'auto', padding: '0 22px' }} onClick={stop}>Stop</Button>
      ) : (
        <>
          <Button variant="outline" height={44} aria-label={`${label}: start`} disabled={disabled} style={{ width: 'auto', padding: '0 22px', boxShadow: 'none' }} onClick={start}>
            {value != null ? 'Time again' : 'Start'}
          </Button>
          <TrialInput label={`${label} (s)`} value={value} rangeKey="mcgill" onCommit={onCommit} disabled={disabled} width={74} />
        </>
      )}
    </div>
  );
}
