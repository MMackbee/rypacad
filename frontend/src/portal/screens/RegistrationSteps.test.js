import React from 'react';
import { format, parseISO } from 'date-fns';
import { renderScreen } from './testRender';
import { AthleteStep, ConsentStep, PackageStep, WhoStep } from './RegistrationSteps';
import { newAthleteEntry } from '../data/signup';
import { SEASON_BOUNDS } from '../data/season';

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

test('the single token card reads one-time, good through the season end; monthly cards are unchanged', async () => {
  // The card's date is the season's last day - fail here if the season moves.
  expect(format(parseISO(SEASON_BOUNDS.end), 'EEE, MMM d')).toBe('Sat, Feb 27');
  const r = await renderScreen(<PackageStep athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onUpdate={() => {}} showErrors={false} />);
  const single = r.button('Single token');
  expect(single).not.toBeNull();
  expect(single.textContent).toContain('1 session · good through Sat, Feb 27');
  expect(single.textContent).toContain('one-time');
  expect(single.textContent).not.toContain('/ period');
  const six = r.button('6 tokens');
  expect(six.textContent).toContain('6 tokens a period · $49.83 a token');
  expect(six.textContent).toContain('/ period');
  expect(six.textContent).not.toContain('one-time');
  await r.unmount();
});
