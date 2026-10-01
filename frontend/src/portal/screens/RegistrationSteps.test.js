import React from 'react';
import { format, parseISO } from 'date-fns';
import { renderScreen } from './testRender';
import { AthleteStep, ConsentInfoSheet, ConsentStep, ContractStep, PackageStep, WhoStep } from './RegistrationSteps';
import { CONSENT_TERMS, SELF_WORDING } from '../data/consentTerms';
import { CONSENTS } from '../data/seed';
import { emptyEmergencyContact, newAthleteEntry } from '../data/signup';
import { SEASON_BOUNDS } from '../data/season';
import { BOOKING_OPENS_AT } from '../data/calendar';

function Harness({ mode = 'parent', linkMode = false, athlete = {}, showErrors = true }) {
  const [athletes, setAthletes] = React.useState([{ ...newAthleteEntry(), ...athlete }]);
  const [ec, setEc] = React.useState(emptyEmergencyContact());
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  return (
    <AthleteStep mode={mode} linkMode={linkMode} athletes={athletes} onUpdate={onUpdate} onAdd={() => {}} onRemove={() => {}}
      emergencyContact={ec} onEmergencyContact={(p) => setEc((prev) => ({ ...prev, ...p }))} medical="" onMedical={() => {}}
      showErrors={showErrors} todayISO="2026-10-01" guardianEmail="dana@email.com" onSwitchToParent={() => {}} />
  );
}

test('who-are-you offers the two modes', async () => {
  const picked = [];
  const r = await renderScreen(<WhoStep mode={null} onChange={(m) => picked.push(m)} />);
  await r.click("I'm the athlete (18+)");
  await r.click('Parent or guardian');
  expect(picked).toEqual(['athlete', 'parent']);
  await r.unmount();
});

test('own login asks for a child email, shows the U13 helper, rejects the guardian email', async () => {
  const r = await renderScreen(<Harness athlete={{ name: 'Nico', dob: '2017-05-05' }} />);
  expect(r.container.querySelector('[aria-label="Login email"]')).toBeNull();
  await r.click('Own login?');
  expect(r.text()).toContain('Under 13? A Google account needs Family Link permission');
  await r.fill('Login email', 'dana@email.com');
  expect(r.text()).toContain("Use a different email from the guardian's.");
  await r.fill('Handicap', '60');
  expect(r.text()).toContain('Handicap is a whole number from 0 to 54');
  await r.unmount();
});

test('the medical box is 16px so iPhones do not zoom in on focus', async () => {
  const r = await renderScreen(<Harness athlete={{ name: 'Nico', dob: '2017-05-05' }} />);
  expect(r.container.querySelector('textarea').style.fontSize).toBe('16px');
  await r.unmount();
});

test('emergency contact: name, mobile and relationship fields; a name alone marks the mobile', async () => {
  const r = await renderScreen(<Harness athlete={{ name: 'Nico', dob: '2017-05-05' }} />);
  for (const label of ['Emergency contact name', 'Emergency contact mobile', 'Relationship to athlete']) {
    expect(r.container.querySelector(`[aria-label="${label}"]`)).not.toBeNull();
  }
  expect(r.container.querySelector('[aria-label="Emergency contact mobile"]').type).toBe('tel');
  expect(r.text()).toContain("A second adult we can call if we can't reach you.");
  expect(r.text()).not.toContain('Add a mobile number we can call.'); // all blank is fine
  await r.fill('Emergency contact name', 'Uncle Bo');
  const marked = [...r.container.querySelectorAll('[data-field-error]')].map((el) => el.textContent);
  expect(marked).toEqual(['!Add a mobile number we can call.']); // "!" is the field's alert glyph
  await r.fill('Emergency contact name', '');
  await r.fill('Relationship to athlete', 'Uncle');
  expect(r.text()).toContain('Add their name, or clear the other emergency fields.');
  await r.unmount();
});

test('emergency contact: no errors before Continue; athlete-mode and link-mode copy', async () => {
  const quiet = await renderScreen(<Harness athlete={{ name: 'Nico', dob: '2017-05-05' }} showErrors={false} />);
  await quiet.fill('Emergency contact name', 'Uncle Bo');
  expect(quiet.text()).not.toContain('Add a mobile number we can call.');
  await quiet.unmount();
  const self = await renderScreen(<Harness mode="athlete" athlete={{ name: 'Sam', dob: '2000-01-01' }} />);
  expect(self.container.querySelector('[aria-label="Relationship to you"]')).not.toBeNull();
  expect(self.text()).toContain('Someone we can call in an emergency.');
  await self.unmount();
  const link = await renderScreen(<Harness linkMode athlete={{ name: 'Nico', dob: '2017-05-05' }} />);
  expect(link.text()).toContain('Leave blank to use the contact from your sign-up.');
  await link.unmount();
});

test('athlete mode: a minor is told a guardian must complete it', async () => {
  const r = await renderScreen(<Harness mode="athlete" athlete={{ name: 'Sam', dob: '2010-01-01' }} />);
  expect(r.text()).toContain('Student sign-up is 18+.');
  expect(r.button("I'm a parent or guardian")).not.toBeNull();
  expect(r.button('Own login?')).toBeNull();
  await r.unmount();
});

test('consent copy switches to the adult variant', async () => {
  const props = { consents: { dataCollection: true, videoCapture: true }, onChange: () => {}, signatureName: '', onSignatureChange: () => {}, onOpenInfo: () => {}, showErrors: false };
  const p = await renderScreen(<ConsentStep mode="parent" {...props} />);
  expect(p.text()).toContain('Each athlete is a minor.');
  await p.unmount();
  const a = await renderScreen(<ConsentStep mode="athlete" {...props} />);
  expect(a.text()).toContain('You are signing for yourself.');
  await a.unmount();
});

test('the signature line claims only the consents ticked above, no injury waiver', async () => {
  const props = { consents: { dataCollection: true, videoCapture: true }, onChange: () => {}, signatureName: '', onSignatureChange: () => {}, onOpenInfo: () => {}, showErrors: false };
  const p = await renderScreen(<ConsentStep mode="parent" {...props} />);
  expect(p.text()).toContain('Typing your name signs the consents you ticked above, for every athlete listed. Re-confirmed each year.');
  expect(p.text()).not.toContain('injury');
  await p.unmount();
  const a = await renderScreen(<ConsentStep mode="athlete" {...props} />);
  expect(a.text()).toContain('Typing your name signs the consents you ticked above. Re-confirmed each year.');
  expect(a.text()).not.toContain('every athlete listed');
  await a.unmount();
});

test('consent errors are marked for the scroll-to-first-error', async () => {
  const r = await renderScreen(<ConsentStep mode="parent" consents={{ dataCollection: false, videoCapture: true }} onChange={() => {}}
    signatureName="" onSignatureChange={() => {}} onOpenInfo={() => {}} showErrors />);
  const marked = [...r.container.querySelectorAll('[data-field-error]')].map((el) => el.textContent);
  expect(marked).toHaveLength(2);
  expect(marked[0]).toBe('Data collection and video capture consent are required to enroll.');
  expect(marked[1]).toContain('A signature is required.');
  await r.unmount();
});

test('the single token card reads one-time, good through the season end; monthly cards are unchanged', async () => {
  // The card's date is the season's last day - fail here if the season moves.
  expect(format(parseISO(SEASON_BOUNDS.end), 'EEE, MMM d')).toBe('Sat, Feb 27');
  const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onUpdate={() => {}} showErrors={false} />);
  const single = r.button('Single token');
  expect(single).not.toBeNull();
  expect(single.textContent).toContain('1 session · good through Sat, Feb 27');
  expect(single.textContent).toContain('one-time');
  expect(single.textContent).not.toContain('/ month');
  const six = r.button('6 tokens');
  expect(six.textContent).toContain('6 tokens a month · $49.83 a token');
  expect(six.textContent).toContain('/ month');
  expect(six.textContent).not.toContain('one-time');
  expect(r.text()).not.toContain('period');
  await r.unmount();
});

test('prices read per month, Elite reads how far ahead it books, and tokens are explained under the label', async () => {
  const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onUpdate={() => {}} showErrors={false} />);
  expect(r.button('Elite').textContent).toContain('Unlimited · 24/7 access · book up to 45 days ahead');
  expect(r.button('Elite').textContent).toContain('$999/ month');
  expect(r.text()).toContain("Package — Nico1 token = 1 session: a training block, a Tour event, or a session with Phil or Yannick. Tokens refresh on the 1st of each month; unused tokens don't carry over. Elite is unlimited.");
  await r.unmount();
});

function PackageHarness({ athletes: initial, showErrors = false }) {
  const [athletes, setAthletes] = React.useState(initial);
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  return <PackageStep athletes={athletes} onUpdate={onUpdate} showErrors={showErrors} />;
}

/** Which cards look picked: the green outline and the filled dot, read separately (tester S4, 2026-09-30). */
const PICKABLE = ['6 tokens', '12 tokens', '16 tokens', 'Elite'];
function litCards(r) {
  // jsdom keeps a border colour as written (lowercased) but turns a background into rgb().
  const green = (value) => value === '#00af51' || value === 'rgb(0, 175, 81)';
  const lit = (name) => {
    const card = r.button(name);
    const dot = card.querySelector('[aria-hidden="true"]');
    return { box: green(card.style.borderColor), dot: green(dot.style.backgroundColor), pressed: card.getAttribute('aria-pressed') === 'true' };
  };
  const on = (key) => PICKABLE.filter((name) => lit(name)[key]);
  return { box: on('box'), dot: on('dot'), pressed: on('pressed') };
}

test('two athletes: a pick stays on screen with box and dot lit together; Next moves on', async () => {
  const nico = { ...newAthleteEntry(), name: 'Nico' };
  const reese = { ...newAthleteEntry(), name: 'Reese' };
  const r = await renderScreen(<PackageHarness athletes={[nico, reese]} />);
  expect(r.text()).toContain('Package — Nico');
  // Nothing picked: no box lit, Elite included (it used to be green always).
  expect(litCards(r)).toEqual({ box: [], dot: [], pressed: [] });
  expect(r.button('Next: Reese')).toBeNull();
  await r.click('12 tokens');
  expect(r.text()).toContain('Package — Nico');
  expect(litCards(r)).toEqual({ box: ['12 tokens'], dot: ['12 tokens'], pressed: ['12 tokens'] });
  expect(r.button('Nico ✓')).not.toBeNull();
  await r.click('Elite'); // changing the pick moves both marks
  expect(litCards(r)).toEqual({ box: ['Elite'], dot: ['Elite'], pressed: ['Elite'] });
  await r.click('Next: Reese');
  expect(r.text()).toContain('Package — Reese');
  expect(litCards(r)).toEqual({ box: [], dot: [], pressed: [] });
  await r.click('6 tokens');
  expect(litCards(r)).toEqual({ box: ['6 tokens'], dot: ['6 tokens'], pressed: ['6 tokens'] });
  expect(r.button('Reese ✓')).not.toBeNull();
  expect(r.button('Next: Nico')).toBeNull(); // nobody left without a package
  // Switching chips repaints to that athlete's own pick, and only that.
  await r.click('Nico ✓');
  expect(litCards(r)).toEqual({ box: ['Elite'], dot: ['Elite'], pressed: ['Elite'] });
  await r.unmount();
});

test('three athletes: Next goes to the next one still without a package, wrapping round', async () => {
  const [a, b, c] = ['Ava', 'Ben', 'Cy'].map((name) => ({ ...newAthleteEntry(), name }));
  const r = await renderScreen(<PackageHarness athletes={[a, { ...b, packageId: 't-6' }, c]} />);
  await r.click('Cy');
  await r.click('16 tokens');
  expect(r.button('Next: Ava')).not.toBeNull();
  await r.click('Next: Ava');
  expect(r.text()).toContain('Package — Ava');
  expect(litCards(r).dot).toEqual([]);
  await r.unmount();
});

test('two athletes: an invalid Continue names every athlete still missing and opens the first', async () => {
  const nico = { ...newAthleteEntry(), name: 'Nico', packageId: 't-12' };
  const reese = { ...newAthleteEntry(), name: 'Reese' };
  const r = await renderScreen(<PackageHarness athletes={[nico, reese]} showErrors />);
  expect(r.text()).toContain('Package — Reese');
  const error = r.container.querySelector('[data-field-error]');
  expect(error.textContent).toBe('Pick a package for Reese too - tap their name above.');
  await r.unmount();

  const none = await renderScreen(<PackageHarness athletes={[{ ...newAthleteEntry(), name: 'Nico' }, { ...newAthleteEntry(), name: '' }]} showErrors />);
  expect(none.container.querySelector('[data-field-error]').textContent).toBe('Pick a package for Nico and Athlete 2 - tap their name above.');
  await none.unmount();
});

// Owner ruling 2026-10-01: single tokens go on sale when booking opens (Sat,
// Oct 10 at 7 AM Chicago) - the booking-open gate, read off the clock.
describe('the single token and the booking-open gate', () => {
  afterEach(() => { jest.restoreAllMocks(); });

  test('before the gate the card says when it is available and cannot be picked', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT - 1);
    const picks = [];
    const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onUpdate={(key, p) => picks.push(p)} showErrors={false} />);
    const single = r.button('Single token');
    expect(single.getAttribute('aria-disabled')).toBe('true');
    expect(single.style.opacity).toBe(''); // the footnote explaining why must stay readable
    expect(single.textContent).toContain('Available Sat, Oct 10 at 7 AM. Pick a monthly package now, or come back then.');
    await r.click('Single token');
    expect(picks).toEqual([]);
    await r.click('6 tokens');
    expect(picks).toEqual([{ packageId: 't-6' }]);
    expect(r.button('6 tokens').getAttribute('aria-disabled')).toBeNull();
    await r.unmount();
  });

  test('a single token held before the gate still needs a pick', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT - 1);
    const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico', packageId: 'single' }]} onUpdate={() => {}} showErrors />);
    expect(r.button('Single token').getAttribute('aria-pressed')).toBe('false');
    expect(r.container.querySelector('[data-field-error]').textContent).toBe('Pick a package for Nico to continue.');
    await r.unmount();
  });

  test('from the gate on it is a pick like any other', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(BOOKING_OPENS_AT);
    const picks = [];
    const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onUpdate={(key, p) => picks.push(p)} showErrors={false} />);
    const single = r.button('Single token');
    expect(single.getAttribute('aria-disabled')).toBeNull();
    expect(single.textContent).not.toContain('Available Sat, Oct 10');
    await r.click('Single token');
    expect(picks).toEqual([{ packageId: 'single' }]);
    await r.unmount();
    // Picked: lit like any other card, and nothing left to pick.
    const held = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico', packageId: 'single' }]} onUpdate={() => {}} showErrors />);
    expect(held.button('Single token').getAttribute('aria-pressed')).toBe('true');
    expect(held.container.querySelector('[data-field-error]')).toBeNull();
    await held.unmount();
  });
});

test('the package step no longer carries the contract tier', async () => {
  const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onUpdate={() => {}} showErrors />);
  expect(r.text()).not.toContain('Commitment Contract');
  expect(r.text()).not.toContain('min / day');
  await r.unmount();
});

function ContractHarness({ athletes: initial, mode = 'parent', showErrors = false, todayISO = '2026-10-01' }) {
  const [athletes, setAthletes] = React.useState(initial);
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  return <ContractStep mode={mode} athletes={athletes} onUpdate={onUpdate} showErrors={showErrors} todayISO={todayISO} />;
}

test('contract step, parent copy: how it works, counted from the season start, Behind after 5 missed weekdays', async () => {
  expect(format(parseISO(SEASON_BOUNDS.start), 'EEE, MMM d')).toBe('Tue, Nov 3');
  const r = await renderScreen(<ContractHarness athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} />);
  expect(r.text()).toContain("You shouldn't have to nag about practice. That's our job, and the Commitment Contract is how we do it.");
  expect(r.text()).toContain('Each athlete picks a daily goal: 20, 45 or 90 minutes, Monday to Friday. Weekends are off.');
  expect(r.text()).toContain("It counts from Tue, Nov 3, or from the day it's picked if that's later.");
  expect(r.text()).toContain('Missed a day? They can log it late that month. They only show as Behind after more than 5 missed weekdays in a month.');
  expect(r.text()).toContain("It's a promise, not a payment.");
  expect(r.text()).toContain("Best chosen together. It's their promise to keep.");
  expect(r.text()).toContain('The standard commitment. Most athletes pick this.');
  expect(r.text()).not.toContain('flag 05');
  await r.unmount();
  const inSeason = await renderScreen(<ContractHarness athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} todayISO="2026-12-15" />);
  expect(inSeason.text()).toContain("It counts from the day it's picked.");
  await inSeason.unmount();
});

test('contract step, athlete copy: their own promise, no login warning', async () => {
  const r = await renderScreen(<ContractHarness mode="athlete" athletes={[{ ...newAthleteEntry(), name: 'Sam' }]} showErrors />);
  expect(r.text()).toContain('The Commitment Contract is your promise to put the work in. We hold you to it.');
  expect(r.text()).toContain('Pick your daily goal');
  expect(r.text()).toContain("It counts from Tue, Nov 3, or from the day you pick it if that's later.");
  expect(r.text()).not.toContain('Best chosen together');
  expect(r.container.querySelector('[data-field-error]').textContent).toBe('Pick your daily goal, or tap Not yet.');
  await r.click('45 min a day for Sam');
  expect(r.text()).not.toContain('own login');
  await r.click('Not yet for Sam');
  expect(r.text()).toContain('No contract for now. Start one any time from your Contract tab.');
  await r.unmount();
});

test('contract step, two athletes: each their own pick, Not yet is an answer, the missing are named', async () => {
  const nico = { ...newAthleteEntry(), name: 'Nico', ownLogin: true, loginEmail: 'nico@email.com' };
  const reese = { ...newAthleteEntry(), name: 'Reese' };
  const r = await renderScreen(<ContractHarness athletes={[nico, reese, { ...newAthleteEntry(), name: '' }]} showErrors />);
  expect(r.container.querySelector('[data-field-error]').textContent).toBe('Pick a daily goal for Nico, Reese and Athlete 3, or tap Not yet.');
  await r.click('45 min a day for Nico');
  expect(r.button('45 min a day for Nico').getAttribute('aria-checked')).toBe('true');
  expect(r.button('45 min a day for Reese').getAttribute('aria-checked')).toBe('false');
  await r.click('45 min a day for Nico'); // no tap-again-to-clear
  expect(r.button('45 min a day for Nico').getAttribute('aria-checked')).toBe('true');
  await r.click('Not yet for Reese');
  expect(r.text()).toContain("No contract for now. Start one any time from Reese's card on your family page.");
  expect(r.container.querySelector('[data-field-error]').textContent).toBe('Pick a daily goal for Athlete 3, or tap Not yet.');
  await r.click('20 min a day for Athlete 3');
  expect(r.container.querySelector('[data-field-error]')).toBeNull();
  // Only the athlete's own login can log: warn for a child the parent's account runs.
  expect(r.text()).toContain('Athlete 3 logs minutes from their own login. Go back to Athletes and turn on Own login.');
  expect(r.text()).not.toContain('Nico logs minutes');
  expect(r.text()).not.toContain('Reese logs minutes');
  await r.unmount();
});

// Owner request (Mike, 2026-09-30): the sheets behind the consent links
// carry the full terms, section by section.
test('the consent sheets show the full media terms and facility rules', async () => {
  for (const [id, first] of [['mediaRelease', 'What you are allowing'], ['facilityAccess', 'Who may enter'], ['videoCapture', 'What we record']]) {
    const r = await renderScreen(<ConsentInfoSheet id={id} onClose={() => {}} />);
    for (const section of CONSENT_TERMS[id]) {
      expect(r.text()).toContain(section.heading);
      for (const line of section.lines) expect(r.text()).toContain(line);
    }
    expect(r.text().indexOf(first)).toBeGreaterThan(-1);
    await r.unmount();
  }
  // The data sheet keeps its access matrix, says what research use covers
  // (owner 2026-10-01), and gains nothing it should not.
  const d = await renderScreen(<ConsentInfoSheet id="dataCollection" onClose={() => {}} />);
  expect(d.text()).toContain('Owner/Director');
  expect(d.text()).toContain('Training and performance numbers may also be used in research, with names removed.');
  expect(d.text()).toContain('Research use');
  for (const line of CONSENT_TERMS.dataCollection[0].lines) expect(d.text()).toContain(line);
  expect(d.text()).not.toContain('Who may enter');
  await d.unmount();
});

// Tester report 2026-09-30: an 18+ athlete signing for themselves read
// guardian wording ("your athlete's progress", "Signing as the guardian").
const GUARDIAN_WORDING = /your athlete|that athlete|an athlete’s|named athlete|parents or guardians|athlete you are responsible for|Signing as the guardian|guardian contact/;

test('consent rows: the adult athlete reads them about themselves; the guardian rows are unchanged', async () => {
  const props = { consents: { dataCollection: true, videoCapture: true }, onChange: () => {}, signatureName: '', onSignatureChange: () => {}, onOpenInfo: () => {}, showErrors: false };
  const a = await renderScreen(<ConsentStep mode="athlete" {...props} />);
  expect(a.text()).toContain('Your name, date of birth, contact details, emergency and medical info, and training records.');
  expect(a.text()).toContain('benchmarked against your own progress.');
  expect(a.text()).toContain('Permission to use photos or video of you in RYP marketing.');
  expect(a.text()).toContain('Signing as the athlete, you accept the facility rules for yourself.');
  expect(a.text()).not.toMatch(GUARDIAN_WORDING);
  await a.unmount();
  const p = await renderScreen(<ConsentStep mode="parent" {...props} />);
  for (const consent of CONSENTS) expect(p.text()).toContain(consent.body);
  await p.unmount();
});

test('consent sheets: the adult athlete reads every sheet about themselves; rules about minors stay', async () => {
  for (const id of ['dataCollection', 'videoCapture', 'mediaRelease', 'facilityAccess']) {
    const a = await renderScreen(<ConsentInfoSheet id={id} mode="athlete" onClose={() => {}} />);
    expect(a.text()).not.toMatch(GUARDIAN_WORDING);
    for (const section of CONSENT_TERMS[id] || []) expect(a.text()).toContain(section.heading);
    await a.unmount();
    // The guardian sheet keeps every line as written.
    const p = await renderScreen(<ConsentInfoSheet id={id} mode="parent" onClose={() => {}} />);
    for (const section of CONSENT_TERMS[id] || []) for (const line of section.lines) expect(p.text()).toContain(line);
    await p.unmount();
  }
  const video = await renderScreen(<ConsentInfoSheet id="videoCapture" mode="athlete" onClose={() => {}} />);
  expect(video.text()).toContain('Multi-angle video of you swinging, plus launch-monitor data');
  expect(video.text()).toContain('Clips are shared inside the portal with you and your coaches.');
  await video.unmount();
  const media = await renderScreen(<ConsentInfoSheet id="mediaRelease" mode="athlete" onClose={() => {}} />);
  expect(media.text()).toContain('or how coaches treat you.');
  expect(media.text()).toContain('We never publish a last name, school, or contact details of an athlete under 18.');
  await media.unmount();
  const facility = await renderScreen(<ConsentInfoSheet id="facilityAccess" mode="athlete" onClose={() => {}} />);
  // Family facility access (owner ruling 2026-09-30): the household's athletes, a code for the household, a parent or guardian may come along.
  expect(facility.text()).toContain('Access is for you and any other athlete in your household, and a parent or guardian may come along.');
  expect(facility.text()).toContain('The entry code or key is for your household and must not be shared or lent outside it, including to teammates.');
  expect(facility.text()).not.toContain('Access is for you only.');
  // Kept: the under-16 rule, one guest to watch, damage.
  expect(facility.text()).toContain('An athlete under 16 must be accompanied by a parent, guardian or an adult the guardian has named to the academy in writing.');
  expect(facility.text()).toContain('One guest may come along, but only to watch. Guests may not hit balls or use equipment.');
  expect(facility.text()).toContain('Damage caused by misuse, or by a guest you brought, is charged to the member.');
  await facility.unmount();
  const guardian = await renderScreen(<ConsentInfoSheet id="facilityAccess" mode="parent" onClose={() => {}} />);
  expect(guardian.text()).toContain('Access is for the athletes in your household, and a parent or guardian may come along.');
  expect(guardian.text()).toContain('The entry code or key is for your family and must not be shared or lent outside it, including to teammates.');
  expect(guardian.text()).not.toContain('named athlete only');
  expect(guardian.text()).toContain('An athlete under 16 must be accompanied by a parent, guardian or an adult the guardian has named to the academy in writing.');
  expect(guardian.text()).toContain('One guest may come along, but only to watch. Guests may not hit balls or use equipment.');
  expect(guardian.text()).toContain('Damage caused by misuse, or by a guest you brought, is charged to the member.');
  expect(guardian.text()).toContain('Facility access is one monthly add-on per household');
  await guardian.unmount();
});

test('every adult rewording still matches a guardian line, so editing one cannot silently drop it', () => {
  const guardian = [...CONSENTS.map((c) => c.body), ...Object.values(CONSENT_TERMS).flat().flatMap((s) => s.lines)];
  for (const [from, to] of Object.entries(SELF_WORDING)) {
    expect(guardian).toContain(from);
    expect(to).not.toMatch(GUARDIAN_WORDING);
  }
});
