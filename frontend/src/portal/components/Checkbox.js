import React from 'react';
import { color, radius } from '../tokens';
import { Tick } from './Primitives';

/** The round tick: the consent cards, the facility add-on (RegistrationFacility.js) and the research opt-in. `role` 'radio' for one of a pair that answers one question. */
export default function Checkbox({ checked, onChange, label, role = 'checkbox' }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={Boolean(checked)}
      aria-label={label}
      onClick={() => onChange(!checked)}
      style={{
        width: 26,
        height: 26,
        flex: 'none',
        borderRadius: radius.pill,
        background: checked ? color.primary : 'transparent',
        border: checked ? 'none' : `1.5px solid ${color.faintText}`,
        display: 'grid',
        placeItems: 'center',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      {checked ? <Tick size={11} /> : null}
    </button>
  );
}
