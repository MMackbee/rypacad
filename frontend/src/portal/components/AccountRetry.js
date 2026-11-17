import React, { useEffect } from 'react';
import { font } from '../tokens';
import Button from './Button';
import { Banner } from './Primitives';
import { ACCOUNT_LOAD_TITLE } from '../data/authCopy';

/**
 * The sign-in page's way out when the visitor is still signed in but their
 * account (users/{uid}) did not load (review 2026-11-17, AUTH-1). Signing
 * in again cannot fix that - it is the same account - so Try again reads it
 * again (useAuthSession's refresh()). When the read failed as unavailable
 * (`offline`), the connection coming back retries once on its own.
 *
 * @param {string} message  The plain copy useAuthSession's accountError carries.
 * @param {boolean} offline  The read failed as unavailable: retry on 'online'.
 * @param {boolean} busy  A retry is running.
 * @param {() => void} onRetry  Stable (useCallback): it is the 'online' listener too.
 */
export default function AccountRetry({ message, offline = false, busy = false, onRetry }) {
  useEffect(() => {
    if (!offline) return undefined;
    window.addEventListener('online', onRetry, { once: true });
    return () => window.removeEventListener('online', onRetry);
  }, [offline, onRetry]);
  return (
    <Banner
      tone="red"
      title={ACCOUNT_LOAD_TITLE}
      style={{ marginBottom: 18 }}
      action={
        <Button variant="outline" height={46} loading={busy} onClick={onRetry} style={{ font: `600 14px ${font.body}` }}>
          Try again
        </Button>
      }
    >
      {message}
    </Banner>
  );
}
