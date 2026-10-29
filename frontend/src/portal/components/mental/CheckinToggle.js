import React from 'react';
import { Toggle } from '../Toggle';

/**
 * The board's per-week "Checked in" switch (spec 5.4). The bare Toggle, not
 * ToggleRow: the row wrapper would fire onChange twice per tap (its own
 * onClick and the switch's).
 */
export default function CheckinToggle({ checked, onChange, name }) {
  return <Toggle checked={checked} onChange={onChange} label={`Checked in · ${name}`} />;
}
