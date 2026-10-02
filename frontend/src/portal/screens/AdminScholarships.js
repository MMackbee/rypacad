import React, { useEffect, useRef, useState } from 'react';
import { TOUCH_MIN, color, font } from '../tokens';
import { useScholarships } from '../hooks';
import { decideScholarship, deleteScholarship } from '../hooks/scholarships';
import BottomTabBar from '../components/BottomTabBar';
import Button from '../components/Button';
import CancelSheet from '../components/CancelSheet';
import PhoneFrame from '../components/PhoneFrame';
import Segmented from '../components/Segmented';
import StatusBadge from '../components/StatusBadge';
import { BackLink, Banner, Body, Card, ErrorNotice, ScreenTitle, SectionLabel } from '../components/Primitives';
import { todayISO } from '../data/calendar';
import {
  SCHOLARSHIP_FILTERS, SCHOLARSHIP_STATUS, ageOn, athleteLine, decisionActions, deleteWarnings, emailStatusLabel, emptyCopy, filterScholarships, guardianLine,
  mailtoHref, requestLine, scholarshipCounts, sentLine, sentMs, statusOf, submissionsLabel, submittedLabel, telHref, updatedSinceDecision,
} from '../data/scholarships';

/**
 * 22 · Scholarships (owner, 2026-10-01: "build that into the admin screen of
 * the portal") - OWNER ONLY, by route and by firestore.rules. Every
 * application the website's form has stored, newest first, under New /
 * Approved / Declined / All. A row opens the whole application in this same
 * screen (a view of the list, not a second route), where the owner approves,
 * declines or reopens it. The route keeps WHICH application is open in its
 * history entry (openId / onOpen / onClose), so the phone's Back closes the
 * application and returns to the list with its filter; with no route (the
 * harness, a bare mount) the same thing is local state.
 *
 * A decision is a label and nothing else: it writes status, decidedBy and
 * decidedAt (hooks/scholarships.js decideScholarship) and moves no billing,
 * package or Stripe object and sends no email. The screen claims no more.
 *
 * Everything on an application was typed into a public form, so it is
 * rendered as text and only as text; the two contact links come from
 * data/scholarships.js mailtoHref / telHref, which fix the scheme and pass
 * nothing through but the address or the digits.
 *
 * The list reads again after every decision. While it does, the rows already
 * on screen stay there with the decision applied (`decided`), so the open
 * application never flashes back to "Loading"; the fresh read then replaces
 * both. If that read fails, the open application stays open as it was saved
 * and the load error waits on the list. A decision that fails changes
 * nothing and says so - including one refused because the family sent the
 * form again while the owner had the earlier answers open.
 *
 * Delete (owner, 2026-10-01: the website's privacy page tells a family "Ask
 * us to delete yours at any time"). On an open application only - never a
 * list row, never in bulk - in a card of its own under the decision, and
 * behind the app's confirm sheet (components/CancelSheet.js): the first tap
 * writes nothing and says that it cannot be undone and that the copies
 * emailed to the director are NOT deleted with it. Confirmed, the
 * application leaves the rows on screen at once - every filter and count -
 * and the screen goes back to the list the way Back does. A delete that
 * fails changes nothing and says so in the sheet, which stays open. It is
 * also kept on the screen (`failed`), because the phone's Back can close the
 * application - and the sheet with it - while the delete is still being
 * written: the application's row and its Delete card then say it did not
 * delete, until the next write is tried. A decision on an application that
 * was deleted somewhere else (another tab) has nothing left to decide: the
 * application leaves the screen the same way.
 *
 * @param {() => void} [onRetry]  Reads again after a load error; the button
 *   is hidden when the route supplies none.
 * @param {string|null} [openId]  The open application's id, from the route.
 *   Read only when `onOpen` is supplied.
 * @param {(id: string) => void} [onOpen]  Opens an application as a history
 *   entry of its own. Omitted: the screen keeps the open id itself.
 * @param {() => void} [onClose]  Leaves that entry (back to the list).
 */
export default function AdminScholarships({ bare = false, role = 'owner', onBack, onRetry, openId: routedId = null, onOpen, onClose }) {
  const { data, loading, error } = useScholarships();
  const [filter, setFilter] = useState('new');
  const [localId, setLocalId] = useState(null);
  const [held, setHeld] = useState(null);
  const [decided, setDecided] = useState({});
  const [deleted, setDeleted] = useState({});
  const [saving, setSaving] = useState(null);
  const [failed, setFailed] = useState(null);
  const routed = typeof onOpen === 'function';
  const openId = routed ? routedId : localId;
  const openApp = routed ? onOpen : setLocalId;
  const closeApp = routed ? onClose : () => setLocalId(null);
  // The open id as it is NOW, for a delete that lands after the render that started it.
  const nowOpen = useRef(openId);
  nowOpen.current = openId;

  // A fresh read is the truth: it replaces the held rows and every local decision and delete laid over them.
  useEffect(() => {
    if (!data) return;
    setHeld(data.rows ?? []);
    setDecided({});
    setDeleted({});
  }, [data]);

  const loaded = data?.rows ?? held;
  const rows = (loaded ?? []).filter((row) => !deleted[row.id]).map((row) => (decided[row.id] ? { ...row, ...decided[row.id] } : row));
  const counts = scholarshipCounts(rows);
  const today = todayISO();
  // Not gated on `error`: a reload that fails after a decision saved must not close the application the owner is reading.
  const open = rows.find((row) => row.id === openId) ?? null;

  const decide = async (app, status) => {
    if (saving) return;
    setSaving({ id: app.id, status });
    setFailed(null);
    try {
      // updatedAtMs is the version on screen: the write is refused if the family has sent the form again since.
      await decideScholarship({ id: app.id, status, updatedAtMs: app.updatedAtMs });
      // Reopening drops the decision; the server's own decidedAt arrives with the next read.
      setDecided((d) => ({ ...d, [app.id]: { status, decidedAtMs: status === 'new' ? null : Date.now() } }));
    } catch (err) {
      // Deleted somewhere else (another tab) since this list was read: nothing is left to decide, so it goes as a delete does.
      if (err?.reason === 'gone') removed(app);
      else setFailed({ id: app.id, resubmitted: err?.reason === 'resubmitted' });
    } finally {
      setSaving(null);
    }
  };

  // The confirmed delete. It rejects with the screen's own words, never the raw error: the confirm sheet shows a
  // rejection's message as it is. One already deleted elsewhere (another tab) resolves in the hook, so it is done here too.
  const remove = async (app) => {
    if (saving) throw new Error(NOT_DELETED);
    setSaving({ id: app.id, status: 'deleting' });
    setFailed(null);
    try {
      await deleteScholarship({ id: app.id });
    } catch (err) {
      // Kept as well as thrown: the owner may have gone back while it was being written, and then no sheet is left to say it.
      setFailed({ id: app.id, deleting: true });
      throw new Error(NOT_DELETED);
    } finally {
      setSaving(null);
    }
  };
  // Gone: off the rows on screen at once, so no filter or count waits for the fresh read, and back to the list -
  // unless the owner went back while it was being written, when a second step back would leave the screen.
  const removed = (app) => {
    setDeleted((d) => ({ ...d, [app.id]: true }));
    if (nowOpen.current === app.id) closeApp();
  };

  if (open) {
    // `busy` is any decision or delete still being written, this application's or another's: one write at a time, and
    // no button that looks live while it would do nothing. Keyed by the application, so one's open confirmation is
    // never another's.
    return (
      <ApplicationDetail key={open.id} bare={bare} role={role} app={open} today={today} saving={saving?.id === open.id ? saving.status : null}
        busy={Boolean(saving)} failed={failed?.id === open.id ? failed : null} onBack={closeApp} onDecide={(status) => decide(open, status)}
        onDelete={() => remove(open)} onDeleted={() => removed(open)} />
    );
  }

  const ready = !error && loaded != null;
  const shown = filterScholarships(rows, filter);
  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          {onBack ? <BackLink onClick={onBack}>‹ Admin</BackLink> : null}
          <ScreenTitle size={22} style={{ marginTop: onBack ? 8 : 0 }}>Scholarships</ScreenTitle>
          <div style={{ marginTop: 12 }}>
            <Segmented value={filter} onChange={setFilter} options={SCHOLARSHIP_FILTERS.map(([k, l]) => [k, ready ? <FilterPill label={l} count={counts[k]} /> : l])} />
          </div>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {error ? (
          <ErrorNotice title="Applications didn't load" onRetry={onRetry}>Check your connection and try again.</ErrorNotice>
        ) : !ready ? (
          <Body size={12}>{loading ? 'Loading applications…' : emptyCopy(filter, 0)}</Body>
        ) : shown.length === 0 ? (
          <Body size={12} tone={color.textTertiary}>{emptyCopy(filter, rows.length)}</Body>
        ) : (
          shown.map((app) => <ApplicationRow key={app.id} app={app} today={today} failed={failed?.id === app.id ? failed : null} onOpen={() => openApp(app.id)} />)
        )}
      </div>
    </PhoneFrame>
  );
}

/**
 * A filter's name with its count on a line of its own beneath it. Four pills
 * share a phone's width, and "Approved · 12" on one line does not reliably
 * fit a quarter of it: it would break mid-label in some pills and not in
 * others. Two short lines fit at every count and every pill reads the same.
 */
function FilterPill({ label, count }) {
  return <>{label} <span style={{ display: 'block', fontSize: 11, lineHeight: '12px' }}>{count}</span></>;
}

/** Long typed values wrap inside the card instead of pushing it wider than the phone. */
const WRAP = { overflowWrap: 'anywhere' };
const typed = (v) => (typeof v === 'string' ? v.trim() : '');

function ApplicationRow({ app, today, failed, onOpen }) {
  const badge = SCHOLARSHIP_STATUS[statusOf(app)];
  const onKeyDown = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onOpen();
  };
  return (
    <div role="button" tabIndex={0} aria-label={typed(app.athlete) || 'Application'} onClick={onOpen} onKeyDown={onKeyDown} style={{ cursor: 'pointer' }}>
      <Card large>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: `600 14px ${font.body}`, color: color.text, ...WRAP }}>{athleteLine(app, today)}</div>
            <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginTop: 2 }}>{sentLine(app)}</div>
          </div>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>
        <Body size={12} style={{ marginTop: 8 }}>{requestLine(app)}</Body>
        <Body size={12} style={WRAP}>{guardianLine(app)}</Body>
        {updatedSinceDecision(app) ? (
          <div style={{ marginTop: 10 }}><StatusBadge tone="yellow">Updated since your decision</StatusBadge></div>
        ) : null}
        {failed ? <Body size={12} tone={color.error} style={{ marginTop: 8 }}>{failed.deleting ? "That didn't delete." : "Your decision didn't save."}</Body> : null}
      </Card>
    </div>
  );
}

/**
 * One answer, under its label when it has one (the two long answers sit under
 * their card's own heading). The family's line breaks are kept; a blank
 * optional answer reads "Not given" rather than leaving a gap.
 */
function Fact({ label, children, first = false }) {
  const blank = children == null || children === '';
  return (
    <div style={{ padding: label ? '8px 0' : 0, borderTop: first || !label ? 'none' : `1px solid ${color.ruleSoft}` }}>
      {label ? <div style={{ font: `400 11px ${font.body}`, color: color.textTertiary, marginBottom: 2 }}>{label}</div> : null}
      <div style={{ font: `400 13px/1.5 ${font.body}`, color: blank ? color.textTertiary : color.text, whiteSpace: 'pre-wrap', ...WRAP }}>
        {blank ? 'Not given' : children}
      </div>
    </div>
  );
}

/** The value's own line: 13px at 1.5. The link's touch target is measured against it. */
const VALUE_LINE = 13 * 1.5;

/**
 * The typed value as a link when it is a plain address or number, as text
 * when it is not. The link gets BackLink's treatment: a 44px touch target
 * whose extra height the negative margins take back out of the layout, so
 * the email and the phone number are each a full target and the rows sit
 * where they did.
 */
function Contact({ href, children }) {
  if (!href) return children;
  const bleed = -(TOUCH_MIN - VALUE_LINE) / 2;
  return (
    <a href={href} style={{ display: 'inline-flex', alignItems: 'center', maxWidth: '100%', minHeight: TOUCH_MIN, marginTop: bleed, marginBottom: bleed,
      color: color.primary, textDecoration: 'underline' }}>
      {children}
    </a>
  );
}

const ACTION_VARIANT = { approved: 'primary', declined: 'dangerOutline', new: 'outline' };
const ACTION_BUSY = { approved: 'Approving', declined: 'Declining', new: 'Reopening' };
/** What the confirm sheet says when a delete is refused or fails. The cause is not known here, so it names none. */
const NOT_DELETED = "That didn't delete. This application is still here. Try again.";

function ApplicationDetail({ bare, role, app, today, saving, busy, failed, onBack, onDecide, onDelete, onDeleted }) {
  // The delete confirmation, and the button that opened it: keeping the application hands the focus back to that button.
  const [confirming, setConfirming] = useState(false);
  const opener = useRef(null);
  const ask = (e) => {
    opener.current = e.currentTarget;
    setConfirming(true);
  };
  const keep = () => {
    setConfirming(false);
    opener.current?.focus();
  };
  const status = statusOf(app);
  const badge = SCHOLARSHIP_STATUS[status];
  const age = ageOn(app.dob, today);
  const dob = typed(app.dob);
  const times = Number(app.submissions) > 1 ? `${submissionsLabel(app)}, first on ${submittedLabel(app.createdAtMs)}` : submissionsLabel(app);
  const still = badge.label.toLowerCase();
  // Three buttons that never move or change meaning (data/scholarships.js decisionActions): Approve and Decline side by
  // side, Reopen beneath, each ALWAYS rendered. The one the application already is is disabled rather than removed - a
  // button that left would let the others shift into its place, under a second tap. All three are off while the delete
  // confirmation is open: it covers them, but a keyboard still reaches them.
  const action = ([next, label, current]) => (
    <Button key={next} variant={ACTION_VARIANT[next]} height={48} loading={saving === next} disabled={current || confirming || (busy && saving !== next)}
      onClick={() => onDecide(next)} style={{ boxShadow: 'none', font: `600 14px ${font.body}` }}>
      {saving === next ? ACTION_BUSY[next] : label}
    </Button>
  );
  const [approve, decline, reopen] = decisionActions(app);
  return (
    <PhoneFrame
      bare={bare}
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <BackLink onClick={onBack}>‹ Scholarships</BackLink>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <ScreenTitle size={22} style={{ flex: 1, minWidth: 0, ...WRAP }}>{typed(app.athlete) || 'No name given'}</ScreenTitle>
            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
          </div>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {updatedSinceDecision(app) ? (
          <Banner tone="yellow" title="Updated since your decision">
            The family sent this again on {submittedLabel(sentMs(app))}. It is still {still}.
          </Banner>
        ) : null}

        <Card large>
          <SectionLabel style={{ marginBottom: 6 }}>Request</SectionLabel>
          <Fact label="Package" first>{typed(app.package)}</Fact>
          <Fact label="Assistance requested">{typed(app.level)}</Fact>
          <Fact label="Season">{typed(app.season)}</Fact>
          <Fact label="Submitted">{submittedLabel(sentMs(app))}</Fact>
          <Fact label="Times sent">{times}</Fact>
          <Fact label="Email to the director">{emailStatusLabel(app)}</Fact>
        </Card>

        <Card large>
          <SectionLabel style={{ marginBottom: 6 }}>Athlete</SectionLabel>
          <Fact label="Date of birth" first>{dob ? `${dob}${age != null ? ` · age ${age}` : ''}` : ''}</Fact>
          <Fact label="School">{typed(app.school)}</Fact>
          <Fact label="Grade">{typed(app.grade)}</Fact>
          <Fact label="Scoring average">{typed(app.average)}</Fact>
          <Fact label="Handicap">{typed(app.handicap)}</Fact>
          <Fact label="Events played in the last 12 months">{typed(app.events)}</Fact>
        </Card>

        <Card large>
          <SectionLabel style={{ marginBottom: 6 }}>Parent or guardian</SectionLabel>
          <Fact label="Name" first>{guardianLine(app)}</Fact>
          <Fact label="Email">{typed(app.email) ? <Contact href={mailtoHref(app.email)}>{typed(app.email)}</Contact> : ''}</Fact>
          <Fact label="Phone">{typed(app.phone) ? <Contact href={telHref(app.phone)}>{typed(app.phone)}</Contact> : ''}</Fact>
        </Card>

        <Card large>
          <SectionLabel style={{ marginBottom: 8 }}>Family situation</SectionLabel>
          <Fact>{typed(app.need)}</Fact>
        </Card>

        <Card large>
          <SectionLabel style={{ marginBottom: 8 }}>Personal statement</SectionLabel>
          <Fact>{typed(app.statement)}</Fact>
        </Card>

        <Card large>
          <SectionLabel style={{ marginBottom: 6 }}>Decision</SectionLabel>
          <Body size={12}>A label for your records. It sends no email and changes no billing.</Body>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>{[approve, decline].map(action)}</div>
          <div style={{ marginTop: 10 }}>{action(reopen)}</div>
          {failed && !failed.deleting ? (
            <Body size={12} tone={color.error} style={{ marginTop: 10 }}>
              {failed.resubmitted
                ? `That decision didn't save. The family sent this again while you had it open, and it is still ${still}. Read it again, then decide.`
                : `That decision didn't save. This application is still ${still}. Try again.`}
            </Body>
          ) : null}
        </Card>

        {/* A card of its own, last on the page, with its button under its sentence. A decision can remove the "Updated
            since your decision" banner, which moves the page up by that banner's height; the gap, this label and this
            sentence are taller than the banner, so the button never arrives under a tap meant for a decision. A delete
            that failed says so under the button, where it moves nothing - and not while the confirmation is up again:
            that one is a new question, and the sheet says it if it fails too. */}
        <Card large style={{ marginTop: 12 }}>
          <SectionLabel style={{ marginBottom: 6 }}>Delete</SectionLabel>
          <Body size={12}>
            For when a family asks you to delete their application. It cannot be undone, and copies emailed to the director are not deleted with it.
          </Body>
          <Button variant="dangerOutline" height={48} disabled={busy} onClick={ask} style={{ marginTop: 12, boxShadow: 'none', font: `600 14px ${font.body}` }}>
            Delete application
          </Button>
          {failed?.deleting && !confirming ? <Body size={12} tone={color.error} style={{ marginTop: 10 }}>{NOT_DELETED}</Body> : null}
        </Card>
      </div>

      {confirming ? (
        <CancelSheet
          keepFirst
          title="Delete this application?"
          summary={deleteWarnings(app).map((line, i) => <div key={line} style={{ marginTop: i ? 8 : 0 }}>{line}</div>)}
          confirmLabel="Delete for good"
          busyLabel="Deleting"
          keepLabel="Keep application"
          onClose={keep}
          onConfirm={onDelete}
          onCancelled={onDeleted}
        />
      ) : null}
    </PhoneFrame>
  );
}
