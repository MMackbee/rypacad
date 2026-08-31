import React, { useState } from 'react';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import MediaPlaceholder from '../components/MediaPlaceholder';
import NumericField from '../components/NumericField';
import PhoneFrame from '../components/PhoneFrame';
import StatusBadge from '../components/StatusBadge';
import { Body, Card, ScreenTitle, SectionLabel } from '../components/Primitives';
import { usePracticeDNA } from '../hooks';

/**
 * Sprint 5 pin (TEAM.md), direction-only this sprint: every module carries
 * `source: 'measured' | 'self' | 'upload' | 'parallax'`. The routing lane is
 * adding the field to the data; DNA_MODULES on this branch does not have it
 * yet, so a module with no `source` defaults to 'measured' - the behavior
 * every module already had, unchanged.
 */
const SOURCE_LABEL = {
  measured: 'Measured',
  self: 'Self-reported',
  upload: 'Upload',
  parallax: 'Parallax',
};

function sourceOf(module) {
  return module.source || 'measured';
}

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
 * progress, not a model swing, and a single percentile would undo that. That
 * constraint holds across every source below, including the self-report form.
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
 *
 * Sprint 5 pin: what a "pending" module offers below the header now depends
 * on where its data comes from - measured stays the Diagnostic-only note,
 * self gets an entry form, upload gets a dropzone stub, parallax gets a named
 * seam. No source invents a score, grade or percentile; the hard constraint
 * holds across all four.
 */
function ModuleCard({ module }) {
  const source = sourceOf(module);

  return (
    <Card large>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{module.name}</div>
            <SourceBadge source={source} />
          </div>
          <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 3 }}>
            {module.descriptor}
          </div>
        </div>
        {source === 'measured' ? (
          <StatusBadge tone={module.captured ? 'green' : 'muted'} dashed={!module.captured}>
            {module.captured ? 'Captured' : 'Pending'}
          </StatusBadge>
        ) : null}
      </div>

      {source === 'measured' ? <MeasuredBody module={module} /> : null}
      {source === 'self' ? <SelfReportBody module={module} /> : null}
      {source === 'upload' ? <UploadBody module={module} /> : null}
      {source === 'parallax' ? <ParallaxBody /> : null}
    </Card>
  );
}

/** Small tag naming where a module's data comes from - shown on every module. */
function SourceBadge({ source }) {
  return (
    <span
      style={{
        font: `500 9px ${font.body}`,
        letterSpacing: '.06em',
        textTransform: 'uppercase',
        color: color.disabledText,
        border: `1px solid ${color.ruleFaint}`,
        borderRadius: radius.badge,
        padding: '2px 6px',
        flex: 'none',
      }}
    >
      {SOURCE_LABEL[source] || SOURCE_LABEL.measured}
    </span>
  );
}

/** Unchanged existing behavior for a Diagnostic-captured module. */
function MeasuredBody({ module }) {
  return (
    <>
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
    </>
  );
}

/**
 * Self-reported module: an entry form keyed to the module's own stats, so the
 * fields an athlete fills in match what a measured version of the same
 * module would show. Component state only this sprint (TEAM.md, "direction-
 * only") - nothing here persists or calls a hook that does not exist yet.
 */
function SelfReportBody({ module }) {
  // The field set to collect: the module's existing stat keys when it has
  // been captured before, or one open value field when it has not - never an
  // invented key that isn't already part of this module's own data.
  const fields = module.stats?.length ? module.stats.map((s) => s.key) : [module.name];
  const [values, setValues] = useState({});
  const [saved, setSaved] = useState(false);

  return (
    <div style={{ marginTop: 13 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {fields.map((key) => (
          <NumericField
            key={key}
            label={key}
            unit=""
            value={values[key]}
            onChange={(v) => {
              setValues((prev) => ({ ...prev, [key]: v }));
              setSaved(false);
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onClick={() => setSaved(true)}
        style={{
          marginTop: 10,
          background: 'none',
          border: 'none',
          padding: 0,
          font: `500 11px ${font.body}`,
          color: color.primary,
          cursor: 'pointer',
        }}
      >
        {saved ? 'Saved for this session' : 'Save'}
      </button>
      <div style={{ font: `400 10px ${font.body}`, color: color.disabledText, marginTop: 6 }}>
        Self-reported — not verified by a coach. Kept on this device until sync lands.
      </div>
    </div>
  );
}

/**
 * Upload module: a visual dropzone stub, honest about being one. No file
 * input is wired - inventing an upload affordance that silently does nothing
 * on drop would be worse than not having one.
 */
function UploadBody({ module }) {
  return (
    <div style={{ marginTop: 13 }}>
      <MediaPlaceholder
        height={72}
        caption={`DROP A FILE OR TAP TO CHOOSE — ${module.name.toUpperCase()} · upload isn't wired yet`}
      />
    </div>
  );
}

/** Parallax module: a named integration seam, no invented API. */
function ParallaxBody() {
  return (
    <div style={{ marginTop: 13 }}>
      <span
        style={{
          display: 'inline-block',
          font: `600 10px ${font.body}`,
          letterSpacing: '.06em',
          textTransform: 'uppercase',
          color: color.secondary,
          border: `1px dashed ${color.secondary}`,
          borderRadius: radius.badge,
          padding: '5px 9px',
        }}
      >
        Connects to Parallax
      </span>
      <Body size={11} tone={color.textTertiary} style={{ marginTop: 8 }}>
        This module reads from Parallax once that integration is built. Nothing here calls out to
        it yet.
      </Body>
    </div>
  );
}
