import React from 'react';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import MediaPlaceholder from '../components/MediaPlaceholder';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { usePracticeDNA } from '../hooks';

/**
 * 06 · Practice DNA - athlete.
 * States: Complete baseline, Partial data, Assessment pending.
 *
 * HARD CONSTRAINT: no score, grade, letter or percentile appears anywhere on
 * this screen, and none is computed on the way to it. Every number shown is a
 * raw measurement. Deltas, when they exist, read against the athlete's own last
 * capture only.
 *
 * This is the whole design of the screen rather than a detail of it — the
 * Blueprint is explicit that athletes are benchmarked against their own future
 * progress, not a model swing, and a single percentile would undo that.
 *
 * Flag 09: with the analytics layer deferred, a captured baseline currently has
 * nothing to compare against. The screen says so rather than leaving a gap that
 * reads as unfinished.
 *
 * @param {'complete'|'partial'|'pending'} variant
 */
export default function PracticeDNA({ variant = 'complete', bare = false }) {
  const { data } = usePracticeDNA({ variant });
  const summary = data?.summary;

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <ScreenTitle size={26}>Practice DNA</ScreenTitle>
        </div>
      }
      footer={<BottomTabBar role="athlete" active="dna" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Body size={12}>
          Your baseline. Every number here is measured against your own future progress, never a
          model swing.
        </Body>

        <SummaryCard summary={summary} pending={variant === 'pending'} />

        {(data?.modules ?? []).map((module) => (
          <ModuleCard key={module.id} module={module} />
        ))}

        <Body size={11} tone={color.textTertiary}>
          Practice and course-performance comparisons arrive with the ecosystem integration. Until
          then this is a baseline with nothing yet to measure against.
        </Body>
      </div>
    </PhoneFrame>
  );
}

function SummaryCard({ summary, pending }) {
  if (!summary) return null;
  const tone = summary.tone === 'green' ? color.primary : color.secondary;

  return (
    <Card tone={pending ? 'yellow' : 'default'} large>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <SectionLabel style={{ flex: 1 }}>{summary.title}</SectionLabel>
        <span style={{ font: `600 12px ${font.body}`, color: tone }}>{summary.count}</span>
      </div>

      {pending ? null : (
        <div
          style={{
            height: 8,
            background: color.track,
            borderRadius: 4,
            overflow: 'hidden',
            marginTop: 12,
          }}
        >
          <div style={{ width: `${summary.pct}%`, height: '100%', background: tone }} />
        </div>
      )}

      <Body size={12} style={{ marginTop: 12 }}>
        {summary.body}
      </Body>
    </Card>
  );
}

/**
 * Six modules in a fixed order. A captured module expands to show what was
 * measured; a pending one stays collapsed rather than showing an empty shell.
 */
function ModuleCard({ module }) {
  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{module.name}</div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
            {module.descriptor}
          </div>
        </div>
        <StatusBadge tone={module.captured ? 'green' : 'muted'} dashed={!module.captured}>
          {module.captured ? 'Captured' : 'Pending'}
        </StatusBadge>
      </div>

      {module.captured && module.kind === 'media' ? (
        <MediaPlaceholder height={86} caption={module.caption} style={{ marginTop: 13 }} />
      ) : null}

      {module.captured && module.kind === 'stats' ? (
        <div style={{ display: 'flex', gap: 0, marginTop: 14 }}>
          {module.stats.map((s) => (
            <div key={s.key} style={{ flex: 1 }}>
              <div
                style={{
                  font: `400 9px ${font.body}`,
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  color: color.textTertiary,
                }}
              >
                {s.key}
              </div>
              {/* A measurement, never a rating. */}
              <div style={{ font: `600 15px ${font.body}`, color: color.text, marginTop: 4 }}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {!module.captured ? (
        <div
          style={{
            marginTop: 12,
            border: `1px dashed ${color.controlBorder}`,
            borderRadius: radius.input,
            padding: '10px 12px',
            font: `400 11px ${font.body}`,
            color: color.disabledText,
          }}
        >
          Captured at your Diagnostic.
        </div>
      ) : null}
    </Card>
  );
}
