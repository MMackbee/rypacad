import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { color } from '../tokens';
import PhoneFrame from '../components/PhoneFrame';
import NoteEditor from '../components/mental/NoteEditor';
import { BackLink, Body, ErrorNotice, ScreenTitle } from '../components/Primitives';
import { useMentalNote } from '../hooks';
import { kindOf } from '../data/mentalNotes';

function titleFor(entryId, sessionDate) {
  const kind = kindOf(entryId);
  if (kind === 'intake') return 'Intake note';
  if (kind === 'free') return 'Note';
  return sessionDate ? `Session note · ${format(parseISO(sessionDate), 'MMM d')}` : 'Session note';
}

/**
 * One private note (2026-10-28, spec 5.3): the intake note, a session's
 * note or a free note, for role 'mental' only. The page always says whose
 * note it is - the name from the page that opened it, or the hook's own
 * lookup on a refresh or deep link.
 *
 * The editor is keyed on the route params, NEVER on `entry`: the first save
 * of a new note sets `entry`, and a key that flipped then would remount the
 * editor and drop what was typed while that save was in flight (Review
 * Focus 5). A failed delete keeps the page open and says so.
 */
export default function MentalNote({ bare = false, athleteId, entryId, sessionDate = null, athleteName = null, onBack }) {
  const { entry, athleteName: hookName, save, remove, saveState, savedAt, loading, error } = useMentalNote({
    athleteId, entryId, sessionDate, athleteName,
  });
  const [deleteFailed, setDeleteFailed] = useState(false);
  const name = athleteName ?? hookName;
  const title = titleFor(entryId, sessionDate ?? entry?.sessionDate ?? null);

  const onDelete = async () => {
    setDeleteFailed(false);
    try {
      await remove();
    } catch (err) {
      setDeleteFailed(true);
      return;
    }
    if (onBack) onBack();
  };

  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <BackLink onClick={onBack}>‹ {name ?? 'Athlete'}</BackLink>
          <ScreenTitle size={22} style={{ marginTop: 8 }}>{title}</ScreenTitle>
          {name ? <Body size={12} style={{ marginTop: 4 }}>{name}</Body> : null}
        </div>
      }
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {loading ? (
          <Body size={12}>Loading the note…</Body>
        ) : error ? (
          <ErrorNotice title="This note didn't load" />
        ) : (
          <NoteEditor
            key={`${athleteId}/${entryId}`}
            initialBody={entry?.body ?? ''}
            saveState={saveState}
            savedAt={savedAt}
            onSave={save}
            onDelete={onDelete}
            canDelete={Boolean(entry)}
          />
        )}
        {deleteFailed ? (
          <Body size={12} tone={color.error}>Not deleted. Check your connection and try again.</Body>
        ) : null}
      </div>
    </PhoneFrame>
  );
}
