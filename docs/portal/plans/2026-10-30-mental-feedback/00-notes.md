# Yannick's staging notes, 2026-10-30 — what changed and why

Yannick ran the staging test guide for his tools (every step a pass, four
skipped) and left notes. The owner asked for the fixes to be loaded. This file
records each note, the decision, and where it landed, so the next person does
not re-derive it. Branch `mental/feedback` (worktree `wt-mental`), cut from
develop 053caad. The design it extends is
`docs/portal/plans/2026-10-28-mental-tools/00-spec.md`.

## Notes that became changes

| Step | Yannick wrote | Decision | Where |
|---|---|---|---|
| 6.5 | "instead of switch could it be a tick box?" | The Checked in control is a round tick box (`role="checkbox"`, 26 px tick in a 44 px hit area), not a switch. | `components/mental/CheckinToggle.js` |
| 6.5 | "would be useful if it prompted with a note for the check in" | Ticking a row opens a two-line note prompt under it ("What did you talk about? (optional)"), Save or Skip. The note is stored on the same check-in document as `note` (string, at most 500 characters), written as a partial update after the tick lands, so `at` stays the check-in time. A blank note removes the field. Un-ticking deletes the check-in and its note (unchanged rule: unchecking is a delete). The note shows on the row ("Note: …" with Edit for Yannick, plain for owner and ops) and on the athlete page under the Contract line (the latest check-in's note). | `data/contractBoard.js` (`noteOf`, `latestCheckin`, `CHECKIN_NOTE_MAX`), `hooks/mentalLive.js` `setCheckinNote`, `hooks/mental.js` `useContractBoard().setCheckinNote`, `components/mental/BoardRow.js`, `screens/MentalContract.js`, `screens/MentalAthlete.js`, `firestore.rules` contractCheckins, `scripts/verify-rules.mjs` |
| 6.8 | "useful to see athletes schedule coming into ryp academy … athlete x is coming in days z this week" | Each board row carries an "At RYP:" line: that week's bookings for the athlete (any type, cancelled left out), as day and time, with "1:1" for a Yannick session, "Phil" for a Phil session and "Tour" for a Tour event; "At RYP: not booked" otherwise. Two more reads per board load (the week's bookings and sessions; both are staff-readable today, no rules change). | `data/contractBoard.js` (`visitsByAthlete`, `visitText`), `hooks/mentalLive.js` `fetchBookingsBetween`, `hooks/mental.js` `liveBoardInputs`, `components/mental/BoardRow.js` |
| 6.1 | "should be able to skip to future weeks?" | Yes, now that a week shows who is coming in: the forward arrow goes up to four weeks ahead (`WEEKS_AHEAD`). A future week is read-only (no tick), its header says "· ahead", and its groups read "Due for a check-in, as of today", "That week", "Checked in that week" (empty: "Check-ins open when the week starts"). | `screens/MentalContract.js`, `data/contractBoard.js` |
| 3.1 | "One Addie and one Addie Schinka. Two Brooks of different ages. Lucas and a Lucas Rossow. Sebastian (no last name)." | Six production athletes carry a first name only (Brooks Erickson, Brooks Krebsbach, Sebastian Rocha, Lucas Rollwagen, Addie Loney, and "Jenna" of the "Jenna family"). The data is the owner's to fix; until then Yannick's list and the board show the family name beside a first-name-only athlete ("Erickson family · Age 10 · …"). Full names are left alone. | `data/athleteLabel.js` (`familyHint`), `data/mentalNotes.js` (`familyName` on list rows), `screens/MentalAthletes.js`, `components/mental/BoardRow.js` |

### Behaviour settled by the review (wf_1bd74a2f-6e9, 12 findings, all fixed)

- The note prompt opens under the row where it was ticked: a ticked row keeps
  its group and place while its prompt is open (`pinOpenRows` in
  `screens/MentalContract.js`) and moves to "Checked in" when the prompt
  closes. The prompt takes focus and scrolls itself into view.
- Each row's prompt is its own: ticking a second athlete leaves the first
  prompt open; un-ticking a row closes only that row's prompt; switching weeks
  closes them all.
- The composer seeds its draft once, when it opens. A refused save keeps the
  typed words on screen under "That note didn't save…".
- The hook waits for the row's own tick write before writing the note, then
  re-checks the row: a note typed on a tick that was refused, or on a row
  un-ticked while waiting, is dropped without a write (`{ dropped: true }`,
  no second banner). A settled tick write is cleared, so a refused un-tick
  never blocks a later note save. The first note on a row snapshots the
  on-screen state before the optimistic note, so a later refused tap never
  puts an unconfirmed note back.
- Rules probes also pin: the unchanged client re-ticking an existing week
  (full replace, `at` re-stamped) passes; a forged `at` on update or create is
  refused; a 500-character note passes and 501 is refused.

## Notes that are not changes

- **1.3** "Nothing on the board yet, the RYP Tour starts with the first Tour
  event" is the Tour standings' empty state before Nov 3; correct as is.
- **3.4** The owner's own test athlete (ZZMakel ZZMackbee) appears in
  Yannick's list and search. Test households are hidden from the contract
  board on purpose and shown in the Athletes list on purpose (the staging
  guide writes notes against Ava Test). No change.
- **6.8, second half** "a priority system based on how often they come in,
  checking in at least once a week with every student": a later item. The
  visits line is the raw material for it.

## Skipped steps

5.11 (no test athlete had a session row), 6.10 and 7.3 (the owner was not
with him), and 7.1 (the admin/staff/roster addresses should bounce him; a
ten-second check he can run alone next time).

## Release

Rules first, then the push: the `note` field is refused by the rules
production runs today, and staging shares that backend. The rules change is
additive (every write the board made before still passes), so it can go
before the frontend. Deploy order: `firestore:rules`, then `develop:main`
after Yannick's staging pass on the new section of his test guide.
