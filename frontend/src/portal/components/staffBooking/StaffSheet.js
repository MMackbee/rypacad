import React from 'react';
import { SHEET_Z, color, radius, tint } from '../../tokens';
import { ScreenTitle } from '../Primitives';

/**
 * The staff sheets' bottom-sheet shell (the MoveSheet pattern, spec
 * 01-spec-admin-booking.md 10.6): an overlay over the screen that closes
 * on a tap (data-portal-overlay, so the Feedback button steps aside), and
 * a role="dialog" sheet named by its title, 85% high at most, scrolling
 * inside, with the portal's 22px side gutter and no sideways scroll at
 * 375px. `footer` sits under the content (a Close, or the sheet's buttons).
 * The overlay is on SHEET_Z (tokens.js), over everything on the screen, so a
 * sheet mounted inside a roster row still covers the rows after it.
 * Pass no `onClose` while a call runs: the overlay then does nothing.
 *
 * @param {string} title  Shown at the top, and the dialog's name.
 * @param {?() => void} onClose  The overlay tap.
 * @param {React.ReactNode} children
 * @param {React.ReactNode} [footer]
 */
export default function StaffSheet({ title, onClose, children, footer = null }) {
  return (
    <div
      data-portal-overlay=""
      onClick={onClose || undefined}
      style={{ position: 'absolute', inset: 0, zIndex: SHEET_Z, background: tint.overlay, display: 'flex', alignItems: 'flex-end' }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          maxHeight: '85%',
          overflowY: 'auto',
          overflowX: 'hidden',
          background: color.surface,
          borderTop: `1px solid ${color.border}`,
          borderRadius: `${radius.cardLarge} ${radius.cardLarge} 0 0`,
          padding: '20px 22px 26px',
        }}
      >
        <ScreenTitle size={19}>{title}</ScreenTitle>
        {children}
        {footer ? <div style={{ marginTop: 16 }}>{footer}</div> : null}
      </div>
    </div>
  );
}
