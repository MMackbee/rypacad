/**
 * A fold's open/closed choice, remembered on this device (owner 2026-11-13:
 * the admin screen's Outstanding card folds and stays the way it was left).
 *
 * Follows hooks/calendarView.js: storage can be unavailable or throw
 * (private browsing, blocked storage, quota), so every read and write is
 * wrapped. A failed read falls back to `defaultOpen`; a failed write still
 * flips the fold in memory, it just will not survive a reload.
 *
 * Stored values are '1' (open) and '0' (closed); anything else reads as
 * `defaultOpen`. The value is read once, on mount.
 *
 * Nothing here touches Firestore. Deliberately NOT re-exported from
 * ./index.js: screen tests jest.mock('../hooks'), and a re-export would erase
 * this hook from them.
 */

import { useCallback, useState } from 'react';

function readOpen(storageKey, defaultOpen) {
  try {
    const v = window.localStorage.getItem(storageKey);
    if (v === '1') return true;
    if (v === '0') return false;
  } catch (err) {
    // Storage unavailable: the default stands.
  }
  return Boolean(defaultOpen);
}

function writeOpen(storageKey, open) {
  try {
    window.localStorage.setItem(storageKey, open ? '1' : '0');
  } catch (err) {
    // Write rejected (private mode/quota): the fold still flips in memory.
  }
}

/** `[open, toggle]`: `toggle` flips the fold and stores the new choice. */
export function useRememberedOpen(storageKey, defaultOpen = false) {
  const [open, setOpen] = useState(() => readOpen(storageKey, defaultOpen));
  const toggle = useCallback(() => {
    const next = !open;
    setOpen(next);
    writeOpen(storageKey, next);
  }, [open, storageKey]);
  return [open, toggle];
}

export default useRememberedOpen;
