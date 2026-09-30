import React from 'react';
import { format, parseISO } from 'date-fns';
import { renderScreen } from './testRender';
import { AthleteStep, ConsentStep, PackageStep, WhoStep } from './RegistrationSteps';
import { newAthleteEntry } from '../data/signup';
import { SEASON_BOUNDS } from '../data/season';
import { SINGLE_ON_SALE } from '../data/packages';

function Harness({ mode = 'parent', athlete = {} }) {
  const [athletes, setAthletes] = React.useState([{ ...newAthleteEntry(), ...athlete }]);
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  return (
    <AthleteStep mode={mode} athletes={athletes} onUpdate={onUpdate} onAdd={() => {}} onRemove={() => {}}
      emergencyContact="" onEmergencyContact={() => {}} medical="" onMedical={() => {}}
      showErrors todayISO="2026-10-01" guardianEmail="dana@email.com" onSwitchToParent={() => {}} />
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
  expect(r.text()).toContain("Package — Nico1 token = 1 session: a training block, a tournament, or a 1-on-1 with Phil or Yannick. Tokens refresh on the 1st of each month; unused tokens don't carry over. Elite is unlimited.");
  await r.unmount();
});

function PackageHarness({ athletes: initial, showErrors = false }) {
  const [athletes, setAthletes] = React.useState(initial);
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  return <PackageStep athletes={athletes} onUpdate={onUpdate} showErrors={showErrors} />;
}

test('two athletes: a pick moves on to the one still without a package', async () => {
  const nico = { ...newAthleteEntry(), name: 'Nico' };
  const reese = { ...newAthleteEntry(), name: 'Reese' };
  const r = await renderScreen(<PackageHarness athletes={[nico, reese]} />);
  expect(r.text()).toContain('Package — Nico');
  await r.click('12 tokens');
  expect(r.text()).toContain('Package — Reese');
  expect(r.button('Nico ✓')).not.toBeNull();
  await r.click('6 tokens');
  expect(r.text()).toContain('Package — Reese'); // nobody left to move to
  expect(r.button('Reese ✓')).not.toBeNull();
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

test('until one-time checkout ships, the single token is greyed out and cannot be picked', async () => {
  expect(SINGLE_ON_SALE).toBe(false);
  const picks = [];
  const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onUpdate={(key, p) => picks.push(p)} showErrors={false} />);
  const single = r.button('Single token');
  expect(single.getAttribute('aria-disabled')).toBe('true');
  expect(single.style.opacity).toBe('0.55');
  expect(single.textContent).toContain('On sale before booking opens Sat, Oct 10. Pick a monthly package now, or come back then.');
  await r.click('Single token');
  expect(picks).toEqual([]);
  await r.click('6 tokens');
  expect(picks).toEqual([{ packageId: 't-6' }]);
  expect(r.button('6 tokens').getAttribute('aria-disabled')).toBeNull();
  await r.unmount();
});
