import React from 'react';
import { color } from '../tokens';
import PhoneFrame from '../components/PhoneFrame';
import CombineDistanceBlock from '../components/combine/CombineDistanceBlock';
import CombineHistory from '../components/combine/CombineHistory';
import { BackLink, Body, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { useCombine } from '../hooks/combine';
// Never through ../hooks/combine: the screen test mocks that module with useCombine alone.
import { COMBINE_KEY } from '../hooks/combineLive';
import { bump } from '../hooks/invalidate';
import { COMBINE_DISTANCES, COMBINE_LOAD_ERROR, COMBINE_READ_ONLY_NOTE } from '../data/combine';

/**
 * One athlete's combine scores (docs/portal/plans/2026-11-11-parallax-combine
 * spec 4): four distance blocks with the best and latest score and, for a
 * coach, the owner, the athlete or a parent, a score to add; the history
 * below, newest first, with an inline delete on the rows the viewer may
 * delete. Mental and ops read everything and enter nothing.
 *
 * The blocks render whenever there is a view, loading or not: the hook
 * keeps the last view while a reload runs, and each block keeps what was
 * typed in it (Review Focus 2). "Loading…" shows only before the first view.
 */
export default function Combine({ bare = false, athleteId, fallbackName = null, onBack }) {
  const { data, loading, error, save, remove } = useCombine(athleteId, { fallbackName });
  const name = data?.athlete?.name ?? fallbackName ?? 'This athlete';

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <BackLink onClick={onBack}>‹ Back</BackLink>
          <ScreenTitle size={22} style={{ marginTop: 8 }}>{name}</ScreenTitle>
          <Body size={12} style={{ marginTop: 4 }}>Combine</Body>
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {!data && error ? (
          <ErrorNotice onRetry={() => bump(COMBINE_KEY)}>{`${COMBINE_LOAD_ERROR} Check your connection and try again.`}</ErrorNotice>
        ) : null}
        {!data && !error && loading ? <Body size={12}>Loading…</Body> : null}
        {data ? (
          <>
            {!data.canEnter ? <Body size={12} tone={color.textTertiary}>{COMBINE_READ_ONLY_NOTE}</Body> : null}
            {COMBINE_DISTANCES.map((d) => (
              <CombineDistanceBlock
                key={d.id}
                distance={d}
                best={data.summary[d.id]?.best ?? null}
                latest={data.summary[d.id]?.latest ?? null}
                canEnter={data.canEnter}
                today={data.today}
                onSave={(distance, score, date) => save({ distance, score, date })}
              />
            ))}
            <SectionLabel style={{ marginTop: 8 }}>History</SectionLabel>
            <CombineHistory rows={data.rows} best={data.best} viewer={data.viewer} onDelete={remove} />
          </>
        ) : null}
      </div>
    </PhoneFrame>
  );
}
