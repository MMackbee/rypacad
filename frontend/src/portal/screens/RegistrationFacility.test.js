import React from 'react';
import { renderScreen } from './testRender';
import { ConsentStep, FacilityAddOn, PackageStep } from './RegistrationSteps';
import { newAthleteEntry } from '../data/signup';

// Owner request (Mike, 2026-09-30): present the facility add-on at sign-up,
// a tick below the package cards.
const TITLE = 'Add 24/7 facility access · $300/month';
const LINE = 'Come in and practice any time outside coached sessions. Billed monthly with the membership, starts once the membership is paid.';
const INCLUDED = '24/7 facility access · Included with Elite';

function PackageHarness({ athletes: initial, onChange }) {
  const [athletes, setAthletes] = React.useState(initial);
  const onUpdate = (key, patch) => setAthletes((prev) => {
    const next = prev.map((a) => (a.key === key ? { ...a, ...patch } : a));
    if (onChange) onChange(next);
    return next;
  });
  return <PackageStep athletes={athletes} onUpdate={onUpdate} showErrors={false} />;
}

const tick = (r, name) => r.button(`Add 24/7 facility access for ${name}`);

test('no package yet: no add-on; a token package: the tick and its line, under the cards; Elite: included; single: nothing', async () => {
  const seen = [];
  const r = await renderScreen(<PackageHarness athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onChange={(a) => seen.push(a)} />);
  expect(r.text()).not.toContain(TITLE);
  expect(tick(r, 'Nico')).toBeNull();
  await r.click('12 tokens');
  expect(r.text()).toContain(TITLE);
  expect(r.text()).toContain(LINE);
  // Below the package cards: after the last card's text.
  expect(r.text().indexOf(TITLE)).toBeGreaterThan(r.text().indexOf('Single token'));
  const box = tick(r, 'Nico');
  expect(box.getAttribute('role')).toBe('checkbox');
  expect(box.getAttribute('aria-checked')).toBe('false');
  await r.click('Add 24/7 facility access for Nico');
  expect(tick(r, 'Nico').getAttribute('aria-checked')).toBe('true');
  expect(seen[seen.length - 1][0].facilityRequested).toBe(true);
  // Elite includes 24/7 access: no tick, one line saying so.
  await r.click('Elite');
  expect(tick(r, 'Nico')).toBeNull();
  expect(r.text()).toContain(INCLUDED);
  expect(r.text()).not.toContain(TITLE);
  // Back to a token package: the tick the family made is still there.
  await r.click('6 tokens');
  expect(tick(r, 'Nico').getAttribute('aria-checked')).toBe('true');
  await r.click('Add 24/7 facility access for Nico');
  expect(seen[seen.length - 1][0].facilityRequested).toBe(false);
  await r.unmount();
});

test('the single token never has the add-on (even a restored pick)', async () => {
  const r = await renderScreen(<FacilityAddOn athlete={{ ...newAthleteEntry(), name: 'Nico', packageId: 'single', facilityRequested: true }} name="Nico" onUpdate={() => {}} />);
  expect(r.text()).toBe('');
  await r.unmount();
});

test('two athletes: each tab has its own tick, named for that athlete', async () => {
  const seen = [];
  const nico = { ...newAthleteEntry(), name: 'Nico', packageId: 't-12' };
  const reese = { ...newAthleteEntry(), name: 'Reese', packageId: 't-6' };
  const r = await renderScreen(<PackageHarness athletes={[nico, reese]} onChange={(a) => seen.push(a)} />);
  await r.click('Add 24/7 facility access for Nico');
  await r.click('Reese ✓');
  expect(tick(r, 'Nico')).toBeNull();
  expect(tick(r, 'Reese').getAttribute('aria-checked')).toBe('false');
  expect(seen[seen.length - 1].map((a) => [a.name, a.facilityRequested])).toEqual([['Nico', true], ['Reese', false]]);
  await r.unmount();
});

describe('consent step: the facility waiver', () => {
  const base = { mode: 'parent', onChange: () => {}, signatureName: 'Dana', onSignatureChange: () => {}, onOpenInfo: () => {} };
  const errors = (r) => [...r.container.querySelectorAll('[data-field-error]')].map((el) => el.textContent);
  const REQUIRED = 'Tick the facility access waiver to keep the add-on, or untick facility access on the package step.';

  test('optional and unchanged when nobody picked the add-on', async () => {
    const r = await renderScreen(<ConsentStep {...base} consents={{ dataCollection: true, videoCapture: true, facilityAccess: false }} showErrors />);
    expect(r.text()).toContain('Optional - needed only for the facility access add-on');
    expect(r.text()).not.toContain('Needed for the facility access you picked');
    expect(errors(r)).toEqual([]);
    await r.unmount();
  });

  test('required once picked: the footnote says why, and an unticked waiver is marked', async () => {
    const r = await renderScreen(<ConsentStep {...base} consents={{ dataCollection: true, videoCapture: true, facilityAccess: false }} showErrors facilityRequired />);
    expect(r.text()).toContain('Needed for the facility access you picked');
    expect(r.text()).not.toContain('Optional - needed only for the facility access add-on');
    // The media release keeps its own optional footnote.
    expect(r.text()).toContain('Optional - enrollment continues either way');
    expect(errors(r)).toEqual([REQUIRED]);
    await r.unmount();
    const quiet = await renderScreen(<ConsentStep {...base} consents={{ dataCollection: true, videoCapture: true, facilityAccess: false }} showErrors={false} facilityRequired />);
    expect(errors(quiet)).toEqual([]);
    await quiet.unmount();
    const ticked = await renderScreen(<ConsentStep {...base} consents={{ dataCollection: true, videoCapture: true, facilityAccess: true }} showErrors facilityRequired />);
    expect(errors(ticked)).toEqual([]);
    expect(ticked.button('Facility access waiver').getAttribute('aria-checked')).toBe('true');
    await ticked.unmount();
  });
});
