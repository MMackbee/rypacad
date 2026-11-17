import React from 'react';
import SkeletonCard, { SkeletonBar } from './Skeleton';

/** Billing's loading state (screens/Billing.js): the hero, then two meters. */
export default function BillingSkeleton() {
  return (
    <div role="status" aria-label="Loading billing" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <SkeletonCard large height={118} />
      {[0, 1].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SkeletonBar width={96} height={16} />
          <SkeletonCard large>
            <SkeletonBar tone="raised" width={110} height={10} />
            <SkeletonBar tone="raised" width={72} height={40} style={{ marginTop: 12 }} />
            <div style={{ marginTop: 14 }}>
              <SkeletonBar tone="raised" height={8} r={4} />
            </div>
          </SkeletonCard>
        </div>
      ))}
    </div>
  );
}
