import React, { useState } from 'react';
import { color, font } from '../tokens';
import { Toggle } from './Toggle';
import { setStaffAssessor } from '../hooks/assessmentsLive';

/**
 * The owner's Assessments permission for one coach or mental account
 * (assessments spec 3: "switched on by the owner in Staff & Roles"). On, the
 * account runs assessment waves and edits every section. Writes
 * users/{uid}.assessor, which firestore.rules lets the owner alone set; a
 * refused or failed write leaves the switch where it was and says so. The
 * bare Toggle, not ToggleRow: the row's own click would send every change
 * twice.
 */
export default function AssessorToggle({ member }) {
  const [on, setOn] = useState(member.assessor === true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const change = async (next) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await setStaffAssessor({ uid: member.id, assessor: next });
      setOn(next);
    } catch (err) {
      setError('The Assessments permission did not save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `500 13px ${font.body}`, color: color.text }}>Assessments</div>
        <div style={{ font: `400 11px/1.5 ${font.body}`, color: error ? color.error : color.textTertiary }}>
          {error || 'Runs assessment waves and edits every section.'}
        </div>
      </div>
      <Toggle checked={on} onChange={change} label={`Assessments for ${member.name}`} />
    </div>
  );
}
