import React from 'react';
import { renderScreen } from './testRender';
import { ConsentStep, FacilityAddOn, PackageStep } from './RegistrationSteps';
import { newAthleteEntry } from '../data/signup';

// Owner request (Mike, 2026-09-30): present the facility add-on at sign-up,
// a tick below the package cards. Owner ruling 2026-09-30: it is a FAMILY
// add-on - one tick for the family, whichever athlete's cards are open.
const TITLE = 'Add 24/7 family facility access · $300/month';
const LINE = 'One add-on covers every athlete in your household, and a parent or guardian may come along. Billed monthly, starts once a membership is paid.';
const INCLUDED = '24/7 facility access · Included for your whole family with Elite';
const TICK = 'Add 24/7 family facility access';

function PackageHarness({ athletes: initial, onChange, ...rest }) {
  const [athletes, setAthletes] = React.useState(initial);
  const [facility, setFacility] = React.useState(false);
  const onUpdate = (key, patch) => setAthletes((prev) => prev.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  const onFacility = (v) => { setFacility(v); if (onChange) onChange(v); };
  return <PackageStep athletes={athletes} onUpdate={onUpdate} showErrors={false} facility={facility} onFacility={onFacility} {...rest} />;
}

const tick = (r) => r.button(TICK);

test('no package yet: no add-on; a token package: the tick and its line, under the cards; Elite: included; single: nothing', async () => {
  const seen = [];
  const r = await renderScreen(<PackageHarness athletes={[{ ...newAthleteEntry(), name: 'Nico' }]} onChange={(v) => seen.push(v)} />);
  expect(r.text()).not.toContain(TITLE);
  expect(tick(r)).toBeNull();
  await r.click('12 tokens');
  expect(r.text()).toContain(TITLE);
  expect(r.text()).toContain(LINE);
  // Below the package cards: after the last card's text.
  expect(r.text().indexOf(TITLE)).toBeGreaterThan(r.text().indexOf('Single token'));
  const box = tick(r);
  expect(box.getAttribute('role')).toBe('checkbox');
  expect(box.getAttribute('aria-checked')).toBe('false');
  await r.click(TICK);
  expect(tick(r).getAttribute('aria-checked')).toBe('true');
  expect(seen).toEqual([true]);
  // Elite covers the family: no tick, one line saying so.
  await r.click('Elite');
  expect(tick(r)).toBeNull();
  expect(r.text()).toContain(INCLUDED);
  expect(r.text()).not.toContain(TITLE);
  // Back to a token package: the tick the family made is still there.
  await r.click('6 tokens');
  expect(tick(r).getAttribute('aria-checked')).toBe('true');
  await r.click(TICK);
  expect(seen).toEqual([true, false]);
  await r.unmount();
});

test('the single token alone never has the add-on (even with a restored tick)', async () => {
  const r = await renderScreen(<FacilityAddOn athletes={[{ ...newAthleteEntry(), name: 'Nico', packageId: 'single' }]} checked onChange={() => {}} />);
  expect(r.text()).toBe('');
  await r.unmount();
});

test('two athletes: ONE family tick, the same on every athlete\'s tab, never named for a child', async () => {
  const seen = [];
  const nico = { ...newAthleteEntry(), name: 'Nico', packageId: 't-12' };
  const reese = { ...newAthleteEntry(), name: 'Reese', packageId: 't-6' };
  const r = await renderScreen(<PackageHarness athletes={[nico, reese]} onChange={(v) => seen.push(v)} />);
  await r.click(TICK);
  await r.click('Reese ✓');
  expect(tick(r).getAttribute('aria-checked')).toBe('true');
  expect(r.text().split(TITLE)).toHaveLength(2);
  expect(r.text()).not.toContain('facility access for');
  // Unticked from Reese's tab, it is unticked on Nico's too.
  await r.click(TICK);
  await r.click('Nico ✓');
  expect(tick(r).getAttribute('aria-checked')).toBe('false');
  expect(seen).toEqual([true, false]);
  await r.unmount();
});

test('any athlete on Elite covers the family: no tick on anyone\'s tab; nobody on 6, 12 or 16 tokens: not offered', async () => {
  const nico = { ...newAthleteEntry(), name: 'Nico', packageId: 't-12' };
  const max = { ...newAthleteEntry(), name: 'Max', packageId: 'elite' };
  const r = await renderScreen(<PackageHarness athletes={[nico, max]} />);
  expect(tick(r)).toBeNull(); // Nico's tab, on 12 tokens
  expect(r.text()).toContain(INCLUDED);
  await r.click('Max ✓');
  expect(tick(r)).toBeNull();
  expect(r.text().split(INCLUDED)).toHaveLength(2);
  await r.unmount();
  // One athlete has no package yet, the other is on 16 tokens: offered, on either tab.
  const pending = await renderScreen(<PackageHarness athletes={[{ ...newAthleteEntry(), name: 'Pia' }, { ...newAthleteEntry(), name: 'Sol', packageId: 't-16' }]} />);
  expect(tick(pending)).not.toBeNull();
  await pending.unmount();
});

test('the adult signing up for themselves reads it without "family"', async () => {
  const sam = { ...newAthleteEntry(), name: 'Sam', packageId: 't-12' };
  const r = await renderScreen(<PackageHarness athletes={[sam]} mode="athlete" />);
  expect(r.text()).toContain('Add 24/7 facility access · $300/month');
  expect(r.text()).toContain('Come in and practice any time outside coached sessions. Billed monthly, starts once your membership is paid.');
  expect(r.button('Add 24/7 facility access')).not.toBeNull();
  await r.click('Elite');
  expect(r.text()).toContain('24/7 facility access · Included with Elite');
  expect(r.text()).not.toMatch(/family|household/i);
  await r.unmount();
});

test('adding to a family that is already covered, or already asked: not offered again (link mode)', async () => {
  const nico = { ...newAthleteEntry(), name: 'Nico', packageId: 't-12' };
  const elite = await renderScreen(<PackageHarness athletes={[nico]} household={[{ id: 'm', packageId: 'elite', billing: { status: 'active' } }]} />);
  expect(tick(elite)).toBeNull();
  expect(elite.text()).toContain(INCLUDED);
  await elite.unmount();
  const asked = await renderScreen(<PackageHarness athletes={[nico]} household={[{ id: 'r', packageId: 't-6', facilityRequested: true }]} />);
  expect(asked.text()).not.toMatch(/facility/i);
  await asked.unmount();
  const open = await renderScreen(<PackageHarness athletes={[nico]} household={[{ id: 'r', packageId: 't-6', billing: { status: 'active' } }]} />);
  expect(tick(open)).not.toBeNull();
  await open.unmount();
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
