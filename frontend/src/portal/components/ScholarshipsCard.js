import React from 'react';
import { color } from '../tokens';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';
import { useScholarships } from '../hooks';

/**
 * "Scholarship applications" on the Admin dashboard (owner, 2026-10-01): how
 * many are waiting for a decision, and the way in to /portal/admin/scholarships.
 *
 * OWNER ONLY, and that is the caller's job: mounting this card IS the read
 * (useScholarships), and firestore.rules refuses that read to every role but
 * owner - the applications hold a child's date of birth and a family's
 * finances. AdminDashboard mounts it for an owner and for nobody else, so an
 * ops dashboard neither shows it nor asks for anything it would be refused.
 */
export default function ScholarshipsCard({ onOpen }) {
  const { data, loading, error } = useScholarships();
  const counts = data?.counts ?? {};
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>Scholarship applications · {loading ? '…' : error ? '—' : `${counts.new ?? 0} new`}</SectionLabel>
      {error ? (
        <Body size={12} tone={color.error}>Applications didn't load.</Body>
      ) : loading ? (
        <Body size={12}>Loading…</Body>
      ) : (
        <Body size={12}>{counts.all ?? 0} received · {counts.approved ?? 0} approved · {counts.declined ?? 0} declined.</Body>
      )}
      <Button variant="secondary" height={44} onClick={onOpen} style={{ marginTop: 12, boxShadow: 'none' }}>
        Open applications
      </Button>
    </Card>
  );
}
