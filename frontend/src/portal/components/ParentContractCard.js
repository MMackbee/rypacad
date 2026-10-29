import React, { useEffect, useRef, useState } from 'react';
import { color, font, tint } from '../tokens';
import Button from './Button';
import { RangeCalendarCard } from './CalendarCard';
import { DayGridLegend } from './DayGridCell';
import { DaySheet, LogSheet } from './ContractSheets';
import { Body, Card, ErrorNotice, SectionLabel, Tick } from './Primitives';
import SavedToast from './SavedToast';
import SkeletonCard from './Skeleton';
import { useParentContract } from '../hooks';
import { monthBounds, todayISO } from '../data/calendar';

const TOAST_MS = 1600;

/**
 * The parent's Commitment Contract for one child (owner, 2026-10-28; spec
 * 4.3: parents log for their kids). A kid without a login of their own could
 * not log at all; this card on AthleteDetail gives the parent the athlete
 * screen's own month grid, day sheet and log sheet for that child. The rule
 * is derived (20 min a day, 10 under 12, Monday to Friday) and the first
 * open stamps it once (useParentContract). AthleteDetail renders it only for
 * role 'parent' and only while the contract switch is on (contractEnabled).
 *
 * @param {string} athleteId    The child's athletes doc id.
 * @param {string} [athleteName]
 */
export default function ParentContractCard({ athleteId, athleteName }) {
  const { month, loading, error, logPractice, removeLog, loggedToday, todayMinutes, required } = useParentContract(athleteId);
  const [sheetDay, setSheetDay] = useState(null);
  // null: closed. { date: null }: today (the hook's own today). { date: iso }:
  // a late entry from the day sheet.
  const [logSheet, setLogSheet] = useState(null);
  const [toast, setToast] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const toastTimer = useRef(null);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const who = athleteName || 'This athlete';

  const handleSaveLog = async (minutes) => {
    const date = logSheet?.date ?? undefined;
    setLogSheet(null);
    setSaveError(null);
    try {
      await logPractice({ minutes, date });
      setToast(true);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(false), TOAST_MS);
    } catch (err) {
      setSaveError(`${who}'s practice didn't save. Check your connection and try again.`);
    }
  };

  if (loading || error || !month) {
    return (
      <Card large>
        <SectionLabel style={{ marginBottom: 12 }}>Commitment Contract</SectionLabel>
        {error ? (
          <ErrorNotice title="Contract didn't load">
            {who}'s contract didn't load. Check your connection and try again.
          </ErrorNotice>
        ) : (
          <SkeletonCard large height={280} />
        )}
      </Card>
    );
  }

  const stats = month.stats;
  return (
    <Card large>
      <SectionLabel>Commitment Contract</SectionLabel>
      <div style={{ font: `600 15px ${font.body}`, color: color.text, marginTop: 8 }}>
        {required} min a day · Monday to Friday
      </div>
      {month.state?.line ? (
        <Body size={12} style={{ marginTop: 6 }}>
          {month.state.line}
        </Body>
      ) : null}

      <div style={{ marginTop: 14 }}>
        {/* The same grid and props as the athlete's own screen
            (CommitmentContract.js): the month, its painted days, a tapped
            day opens the day sheet. */}
        <RangeCalendarCard
          rangeStart={month.month?.start}
          rangeEnd={month.month?.start ? monthBounds(month.month.start).end : undefined}
          dayStates={month.dayStates ?? {}}
          onSelectDay={setSheetDay}
          blankOutsideRange
          gridKey={stats?.logged ?? 0}
        >
          {month.caption ? (
            <Body size={11} tone={color.textTertiary} style={{ marginTop: 13 }}>
              {month.caption}
            </Body>
          ) : null}
          <div style={{ marginTop: 12 }}>
            <DayGridLegend />
          </div>
        </RangeCalendarCard>
      </div>

      <div style={{ marginTop: 14 }}>
        {loggedToday ? (
          <div
            style={{
              minHeight: 50,
              borderRadius: 10,
              background: tint.green,
              border: `1px solid ${color.primary}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexWrap: 'wrap',
              gap: 10,
              font: `600 15px ${font.body}`,
              color: color.primary,
            }}
          >
            <Tick size={13} color={color.primary} thickness={2.5} />
            <span>Logged today · {todayMinutes} min</span>
            <button
              type="button"
              onClick={() => setLogSheet({ date: null })}
              style={{
                background: 'none',
                border: 'none',
                padding: '4px 6px',
                font: `600 13px ${font.body}`,
                color: color.primary,
                textDecoration: 'underline',
                cursor: 'pointer',
              }}
            >
              + Add more
            </button>
          </div>
        ) : (
          <Button height={50} onClick={() => setLogSheet({ date: null })}>
            Log today · {required} min
          </Button>
        )}
        {saveError ? (
          <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
            {saveError}
          </Body>
        ) : null}
        {toast ? <SavedToast style={{ marginTop: 10 }} /> : null}
      </div>

      {sheetDay ? (
        <DaySheet
          day={sheetDay}
          onClose={() => setSheetDay(null)}
          onAddLate={(iso) => {
            setSheetDay(null);
            setLogSheet({ date: iso });
          }}
          onRemove={(iso) => removeLog({ date: iso })}
        />
      ) : null}
      {logSheet ? (
        <LogSheet
          contractMinutes={required}
          forDate={logSheet.date ?? todayISO()}
          onClose={() => setLogSheet(null)}
          onSave={handleSaveLog}
        />
      ) : null}
    </Card>
  );
}
