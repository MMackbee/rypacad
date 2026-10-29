import React from 'react';
import Button from './Button';
import { Body, Card, SectionLabel } from './Primitives';

/** The way in to the assessment screens for owners and ops (spec 5: "owners reach it from the admin dashboard and athlete detail"). */
export default function AssessmentsEntryCard({
  onOpen,
  title = 'Assessments',
  body = "Phil's physical assessment program: who is due, start a wave, read every result.",
  label = 'Open assessments',
}) {
  return (
    <Card large>
      <SectionLabel style={{ marginBottom: 6 }}>{title}</SectionLabel>
      <Body size={12}>{body}</Body>
      <Button variant="secondary" height={44} onClick={onOpen} style={{ marginTop: 12, boxShadow: 'none' }}>
        {label}
      </Button>
    </Card>
  );
}
