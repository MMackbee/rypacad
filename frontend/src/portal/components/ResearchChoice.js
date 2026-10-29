import React from 'react';
import { color, font } from '../tokens';
import Checkbox from './Checkbox';
import { Body } from './Primitives';
import { RESEARCH_SELF_LABEL, assentLabel, researchLabel, researchLine } from '../data/researchConsent';

/**
 * One athlete's research opt-in (assessments spec 7): ticked = yes,
 * unticked = no. Under 18 the assent box shows once the first is ticked,
 * and unticking the first clears it. An 18+ athlete with their own login
 * (`self`) answers for themselves: the approved first-person checkbox, and
 * the approved line under it with their own first name. Used by sign-up's consent step and the
 * one-time confirm.
 */
export default function ResearchChoice({ name, self = false, minor = true, ticked, assent, onChange, onReadMore }) {
  const label = self ? RESEARCH_SELF_LABEL : researchLabel(name);
  return (
    <div style={{ display: 'flex', gap: 13 }}>
      <Checkbox checked={ticked} label={label} onChange={(v) => onChange({ ticked: v, assent: v ? assent : false })} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `600 14px ${font.body}`, color: color.text }}>{label}</div>
        <Body size={12} style={{ marginTop: 6 }}>{researchLine(name)}</Body>
        {!self && minor && ticked ? (
          <div style={{ display: 'flex', gap: 13, marginTop: 12 }}>
            <Checkbox checked={assent} label={assentLabel(name)} onChange={(v) => onChange({ ticked, assent: v })} />
            <div style={{ flex: 1, minWidth: 0, font: `500 13px/1.45 ${font.body}`, color: color.text }}>{assentLabel(name)}</div>
          </div>
        ) : null}
        {onReadMore ? (
          <button
            type="button"
            aria-label={self ? 'Read more about research' : `Read more about research for ${name}`}
            onClick={onReadMore}
            style={{ background: 'none', border: 'none', padding: 0, marginTop: 9, font: `500 12px ${font.body}`, color: color.primary, cursor: 'pointer' }}
          >
            Read more →
          </button>
        ) : null}
      </div>
    </div>
  );
}
