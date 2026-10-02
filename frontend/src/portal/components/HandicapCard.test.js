import React, { act } from 'react';
import { renderScreen } from '../screens/testRender';
import HandicapCard from './HandicapCard';

// Owner ruling 2026-10-02: a reserved block is booked on the handicap on
// file, so ops and owner can set or correct it - 0 to 54, or blank for none.
let mockWrite;
jest.mock('../hooks', () => ({ setAthleteHandicap: (...args) => mockWrite(...args) }));

const RANGE = 'Handicap is a whole number from 0 to 54, or leave it blank.';
const field = (r) => r.container.querySelector('[aria-label="Set handicap"]');
const card = (role, athlete) => renderScreen(<HandicapCard athleteId="a1" athlete={athlete} role={role} />);

beforeEach(() => {
  mockWrite = jest.fn(async ({ athleteId, handicap }) => ({ athleteId, handicap }));
});

test('ops and owner see the edit with the value on file; nobody else sees the card', async () => {
  for (const role of ['ops', 'owner']) {
    const r = await card(role, { name: 'Jordan', handicap: 14 });
    expect(r.text()).toContain('On file14');
    expect(field(r).value).toBe('14');
    expect(r.button('Save handicap')).not.toBeNull();
    await r.unmount();
  }
  for (const role of ['coach', 'mental', 'parent', 'athlete']) {
    const r = await card(role, { name: 'Jordan', handicap: 14 });
    expect(r.text()).toBe('');
    await r.unmount();
  }
});

test('none on file reads None, whether the field is null or missing; a plus handicap stored as 0 reads 0', async () => {
  for (const athlete of [{ name: 'Nico', handicap: null }, { name: 'Nico' }]) {
    const r = await card('ops', athlete);
    expect(r.text()).toContain('On fileNone');
    expect(field(r).value).toBe('');
    await r.unmount();
  }
  const zero = await card('ops', { name: 'Ava', handicap: 0 });
  expect(zero.text()).toContain('On file0');
  expect(field(zero).value).toBe('0');
  await zero.unmount();
});

test('nothing renders until the athlete record has loaded', async () => {
  const r = await card('owner', undefined);
  expect(r.text()).toBe('');
  await r.unmount();
});

test('Save is off until the value changes', async () => {
  const r = await card('ops', { name: 'Jordan', handicap: 14 });
  expect(r.button('Save handicap').disabled).toBe(true);
  await r.fill('Set handicap', '4');
  expect(r.button('Save handicap').disabled).toBe(false);
  await r.fill('Set handicap', '14');
  expect(r.button('Save handicap').disabled).toBe(true);
  await r.unmount();
});

test('validated like sign-up: out of range, a fraction and letters are refused before any write', async () => {
  const r = await card('ops', { name: 'Jordan', handicap: 14 });
  for (const bad of ['55', '-1', '4.5', 'scratch']) {
    await r.fill('Set handicap', bad);
    await r.click('Save handicap');
    expect(r.text()).toContain(RANGE);
    expect(r.text()).toContain('On file14');
  }
  expect(mockWrite).not.toHaveBeenCalled();
  // Typing again clears the message.
  await r.fill('Set handicap', '5');
  expect(r.text()).not.toContain(RANGE);
  await r.unmount();
});

// Number('+2') is 2: sign-up's check alone would file a plus-2 player as a 2.
test('a leading plus is refused with the line that says how to enter it, before any write', async () => {
  const r = await card('ops', { name: 'Jordan', handicap: 14 });
  for (const bad of ['+3', ' +0', '+6']) {
    await r.fill('Set handicap', bad);
    await r.click('Save handicap');
    expect(r.text()).toContain('Enter a plus handicap as 0.');
    expect(r.text()).not.toContain(RANGE);
    expect(r.text()).toContain('On file14');
  }
  expect(mockWrite).not.toHaveBeenCalled();
  // Entered as 0, it saves.
  await r.fill('Set handicap', '0');
  await r.click('Save handicap');
  expect(mockWrite).toHaveBeenCalledWith({ athleteId: 'a1', handicap: 0 });
  expect(r.text()).toContain('On file0');
  await r.unmount();
});

test('a valid handicap saves as an integer, and the card shows it on file', async () => {
  const r = await card('owner', { name: 'Jordan', handicap: 14 });
  await r.fill('Set handicap', '4');
  await r.click('Save handicap');
  expect(mockWrite).toHaveBeenCalledTimes(1);
  expect(mockWrite).toHaveBeenCalledWith({ athleteId: 'a1', handicap: 4 });
  expect(r.text()).toContain('Handicap saved');
  expect(r.text()).toContain('On file4');
  expect(r.button('Save handicap').disabled).toBe(true);
  await r.unmount();
});

test('the range ends save: 0 for a plus handicap, and 54', async () => {
  for (const [typed, handicap] of [['0', 0], ['54', 54]]) {
    const r = await card('ops', { name: 'Jordan', handicap: 14 });
    await r.fill('Set handicap', typed);
    await r.click('Save handicap');
    expect(mockWrite).toHaveBeenLastCalledWith({ athleteId: 'a1', handicap });
    expect(r.text()).toContain(`On file${handicap}`);
    await r.unmount();
  }
});

test('blank saves none (null), and the card reads None', async () => {
  const r = await card('ops', { name: 'Jordan', handicap: 14 });
  await r.fill('Set handicap', '');
  await r.click('Save handicap');
  expect(mockWrite).toHaveBeenCalledWith({ athleteId: 'a1', handicap: null });
  expect(r.text()).toContain('On fileNone');
  await r.unmount();
});

test('a failed save says so and leaves the value on file as it was', async () => {
  mockWrite = jest.fn(async () => { throw new Error('The handicap was not saved.'); });
  const r = await card('ops', { name: 'Jordan', handicap: 14 });
  await r.fill('Set handicap', '4');
  await r.click('Save handicap');
  expect(r.text()).toContain('The handicap was not saved.');
  expect(r.text()).not.toContain('Handicap saved');
  expect(r.text()).toContain('On file14');
  // What was typed is kept, so Save can be tapped again.
  expect(field(r).value).toBe('4');
  expect(r.button('Save handicap').disabled).toBe(false);
  await r.unmount();
  // An error with no message of its own still reads plainly.
  mockWrite = jest.fn(async () => { throw new Error(''); });
  const bare = await card('ops', { name: 'Jordan', handicap: 14 });
  await bare.fill('Set handicap', '4');
  await bare.click('Save handicap');
  expect(bare.text()).toContain('The handicap could not be saved. Try again.');
  await bare.unmount();
});

test('the card follows the record: a value the refetch brings back replaces what it shows', async () => {
  function Refetching() {
    const [athlete, setAthlete] = React.useState({ name: 'Jordan', handicap: null });
    return (
      <>
        <button type="button" onClick={() => setAthlete({ name: 'Jordan', handicap: 9 })}>refetch</button>
        <HandicapCard athleteId="a1" athlete={athlete} role="ops" />
      </>
    );
  }
  const r = await renderScreen(<Refetching />);
  expect(r.text()).toContain('On fileNone');
  await r.click('refetch');
  expect(r.text()).toContain('On file9');
  expect(field(r).value).toBe('9');
  await r.unmount();
});

// Live mode: the save bumps 'athletes', and the detail hook drops its data while it re-reads (useSeedResource), so
// the card is handed no athlete for a moment and then the saved value.
test('its own save reloads the record through "no athlete": the card stays up, with Handicap saved', async () => {
  let setAthlete;
  function Reloading() {
    const [athlete, set] = React.useState({ name: 'Jordan', handicap: 14 });
    setAthlete = set;
    return <HandicapCard athleteId="a1" athlete={athlete} role="ops" />;
  }
  mockWrite = jest.fn(async ({ athleteId, handicap }) => { setAthlete(undefined); return { athleteId, handicap }; });
  const r = await renderScreen(<Reloading />);
  await r.fill('Set handicap', '4');
  await r.click('Save handicap');
  expect(r.text()).toContain('Handicap saved');
  expect(r.text()).toContain('On file4');
  await act(async () => { setAthlete({ name: 'Jordan', handicap: 4 }); });
  expect(r.text()).toContain('Handicap saved');
  expect(r.text()).toContain('On file4');
  expect(field(r).value).toBe('4');
  expect(r.button('Save handicap').disabled).toBe(true);
  await r.unmount();
});

test("another athlete's page shows nothing until that athlete has loaded: never the last one's value", async () => {
  let show;
  function Switching() {
    const [props, set] = React.useState({ athleteId: 'a1', athlete: { name: 'Jordan', handicap: 14 } });
    show = set;
    return <HandicapCard {...props} role="owner" />;
  }
  const r = await renderScreen(<Switching />);
  expect(r.text()).toContain('On file14');
  await act(async () => { show({ athleteId: 'a2', athlete: undefined }); });
  expect(r.text()).toBe('');
  await act(async () => { show({ athleteId: 'a2', athlete: { name: 'Nico' } }); });
  expect(r.text()).toContain('On fileNone');
  expect(field(r).value).toBe('');
  await r.unmount();
});
