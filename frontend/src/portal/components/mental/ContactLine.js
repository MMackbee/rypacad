import React from 'react';
import { color } from '../../tokens';
import { Body } from '../Primitives';

const link = { color: color.textSecondary, textDecoration: 'underline' };

/**
 * The guardian contact line on an athlete's page (spec 3, 5.2): family,
 * guardian, email and phone, the only household fields Yannick reads.
 * `Whitfield family · Dana · dana@email.com · 612-555-0100`, email and
 * phone as links. Nothing when there is no contact.
 */
export default function ContactLine({ contact, style }) {
  if (!contact) return null;
  const parts = [];
  if (contact.familyName) parts.push(contact.familyName);
  if (contact.guardianName) parts.push(contact.guardianName);
  if (contact.email) parts.push(<a href={`mailto:${contact.email}`} style={link}>{contact.email}</a>);
  if (contact.phone) parts.push(<a href={`tel:${String(contact.phone).replace(/[^\d+]/g, '')}`} style={link}>{contact.phone}</a>);
  if (!parts.length) return null;
  return (
    <Body size={12} style={style}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i ? ' · ' : null}
          {p}
        </React.Fragment>
      ))}
    </Body>
  );
}
