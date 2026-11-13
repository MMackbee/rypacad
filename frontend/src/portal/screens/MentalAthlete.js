import React from 'react';
import { format, parseISO } from 'date-fns';
import { color, font, radius } from '../tokens';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import PhoneFrame from '../components/PhoneFrame';
import SkeletonCard from '../components/Skeleton';
import ContactLine from '../components/mental/ContactLine';
import ConsentCard from '../components/consent/ConsentCard';
import SessionNoteChip from '../components/mental/SessionNoteChip';
import { BackLink, Body, Card, ErrorNotice, ScreenTitle, SectionLabel, SignOutButton } from '../components/Primitives';
import { useMentalAthlete } from '../hooks';
import { PARENT_ATTENDING_NOTE } from '../data/specialists';
import { dateOf } from '../data/contractBoard';
import { noteEntryId } from '../data/mentalNotes';

const day = (iso) => format(parseISO(iso), 'MMM d');
const STATUS = { confirmed: 'Booked', attended: 'Attended', noshow: 'No-show', cancelled: 'Cancelled' };

/** `Nov 10 · 4:30 PM · Attended · Parent attending`. */
function sessionLine(s) {
  return [
    day(s.date),
    s.time || null,
    STATUS[s.status] ?? s.status ?? null,
    s.attendee === 'parent' ? PARENT_ATTENDING_NOTE : null,
  ].filter(Boolean).join(' · ');
}

/** `free-` plus 8 base-36 characters (Decided here #12). */
const freeNoteId = () => noteEntryId({ kind: 'free', random: Math.random().toString(36).slice(2, 10).padEnd(8, '0') });

const ROW = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: `1px solid ${color.rowRule}` };

/**
 * One athlete's page for Yannick (2026-10-28, spec 5.2): who they are and
 * how to reach the family, the intake note, a note per mental 1:1 and his
 * other notes. No contract (owner 2026-11-12/13: it runs on a paper
 * calendar). Role 'mental' only; the notes are readable by nobody else
 * (firestore.rules mentalNotes). Every note it opens carries the athlete's
 * name, so the note page says whose it is. `demoUtcToday` and `demoRecord`
 * are the review harness's (seed only).
 */
export default function MentalAthlete({ bare = false, athleteId, onBack, onOpenNote, onSignOut, demoUtcToday = null, demoRecord = null }) {
  const { data, loading, error } = useMentalAthlete(athleteId, { demoUtcToday, demoRecord });
  const athlete = data?.athlete ?? null;
  const open = (entryId, sessionDate = null) => {
    if (onOpenNote && athlete) onOpenNote({ entryId, sessionDate, athleteName: athlete.name });
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {onBack ? <BackLink onClick={onBack}>‹ Athletes</BackLink> : null}
            </div>
            <SignOutButton onSignOut={onSignOut} />
          </div>
          {athlete ? (
            <div style={{ marginTop: 8 }}>
              <ScreenTitle size={22}>{athlete.name}</ScreenTitle>
              <Body size={12} style={{ marginTop: 4 }}>
                {athlete.age != null ? `Age ${athlete.age}` : null}
              </Body>
              <ContactLine contact={data.contact} style={{ marginTop: 4 }} />
              {data.contact?.emergency ? <Body size={12} style={{ marginTop: 2 }}>{emergencyLine(data.contact.emergency)}</Body> : null}
            </div>
          ) : null}
        </div>
      }
      footer={<BottomTabBar role="mental" active="athletes" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          <>
            <SkeletonCard large height={96} />
            <SkeletonCard large height={140} />
          </>
        ) : error ? (
          <ErrorNotice title="This athlete didn't load" />
        ) : !athlete ? (
          <div style={{ border: `1px dashed ${color.border}`, borderRadius: radius.cardLarge, padding: '24px 22px', textAlign: 'center' }}>
            <Body size={12}>This athlete was not found.</Body>
          </div>
        ) : (
          <AthleteCards data={data} open={open} />
        )}
      </div>
    </PhoneFrame>
  );
}

/** An 18+ athlete's emergency contact from the consent: `Emergency: Sam Parker, test-phone (parent)`. */
function emergencyLine(ec) {
  return `Emergency: ${ec.name}${ec.phone ? `, ${ec.phone}` : ''}${ec.relationship ? ` (${ec.relationship})` : ''}`;
}

function AthleteCards({ data, open }) {
  const { notes, sessions } = data;
  const intake = notes?.intake ?? null;
  const free = notes?.free ?? [];
  return (
    <>
      <Card large>
        <SectionLabel style={{ marginBottom: 8 }}>Intake</SectionLabel>
        <Body size={12} style={{ marginBottom: 10 }}>
          {intake ? `Last edited ${noteDay(intake)}` : 'No intake note yet.'}
        </Body>
        <Button variant="outline" height={44} style={{ font: `600 14px ${font.body}` }} onClick={() => open('intake')}>
          {intake ? 'Open intake note' : 'Write intake note'}
        </Button>
      </Card>

      {/* Yannick's consent (2026-10-30 spec 5), between Intake and Sessions. */}
      <ConsentCard
        athleteId={data.athlete.id}
        firstName={String(data.athlete.name || '').trim().split(/\s+/)[0]}
        familyLabel={data.contact?.guardianName ?? null}
        consent={data.consent}
      />

      <Card large>
        <SectionLabel style={{ marginBottom: 2 }}>Sessions</SectionLabel>
        {sessions.length === 0 ? (
          <Body size={12} style={{ marginTop: 6 }}>No mental 1:1s booked yet.</Body>
        ) : (
          sessions.map((s, i) => (
            <div key={s.sessionId} style={{ ...ROW, borderBottom: i < sessions.length - 1 ? ROW.borderBottom : 'none' }}>
              <Body size={13} tone={color.text} style={{ flex: 1, minWidth: 0 }}>{sessionLine(s)}</Body>
              <SessionNoteChip hasNote={s.hasNote} onClick={() => open(s.sessionId, s.date)} />
            </div>
          ))
        )}
      </Card>

      <Card large>
        <SectionLabel style={{ marginBottom: 2 }}>Other notes</SectionLabel>
        {free.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => open(n.id)}
            style={{ ...ROW, width: '100%', background: 'none', border: 'none', borderBottom: ROW.borderBottom, textAlign: 'left', cursor: 'pointer' }}
          >
            <span style={{ flex: 'none', font: `600 12px ${font.body}`, color: color.text }}>{noteDay(n)}</span>
            <span style={{ flex: 1, minWidth: 0, font: `400 12px ${font.body}`, color: color.textTertiary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {n.body || ''}
            </span>
          </button>
        ))}
        <Button variant="outline" height={44} style={{ marginTop: 10, font: `600 14px ${font.body}` }} onClick={() => open(freeNoteId())}>
          New note
        </Button>
      </Card>
    </>
  );
}

/** A note's last-edited day, as the academy (America/Chicago) date. */
function noteDay(n) {
  const iso = n?.updatedAtMs ? dateOf(new Date(n.updatedAtMs)) : null;
  return iso ? day(iso) : '';
}
