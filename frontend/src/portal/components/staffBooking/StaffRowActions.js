import React from 'react';
import { color, font } from '../../tokens';
import { staffCancellable } from '../../data/staffCancel';
import { staffMovable } from '../../data/staffBooking';
import { CANCEL_LABEL, MOVE_LABEL, cancelAria, moveAria } from '../../data/staffBookingCopy';

/**
 * The staff Move and Cancel on one booking row (spec 01-spec-admin-booking.md
 * 10.1, 10.4): small, after the badge, Move before Cancel, each a 44px tap
 * target in the Billing Cancel's style, named for the athlete (and the row,
 * when given) so brothers' and sisters' buttons differ for a screen reader.
 * A button shows only when its handler is given and the row allows it;
 * neither gives nothing. Each click hands over the row.
 */
export default function StaffRowActions({ row, first = null, rowLabel = null, periodStart = null, onMove = null, onCancel = null }) {
  const move = Boolean(onMove) && staffMovable(row, { periodStart });
  const cancel = Boolean(onCancel) && staffCancellable(row, { periodStart });
  if (!move && !cancel) return null;
  return (
    <>
      {move ? (
        <RowButton label={MOVE_LABEL} aria={moveAria(first, rowLabel)} tone={color.primary} onClick={() => onMove(row)} />
      ) : null}
      {cancel ? (
        <RowButton label={CANCEL_LABEL} aria={cancelAria(first, rowLabel)} tone={color.error} onClick={() => onCancel(row)} />
      ) : null}
    </>
  );
}

function RowButton({ label, aria, tone, onClick }) {
  return (
    <button
      type="button"
      aria-label={aria}
      onClick={onClick}
      style={{
        height: 44,
        minWidth: 44,
        padding: '0 2px 0 6px',
        background: 'none',
        border: 'none',
        font: `600 12px ${font.body}`,
        color: tone,
        cursor: 'pointer',
        flex: 'none',
      }}
    >
      {label}
    </button>
  );
}
