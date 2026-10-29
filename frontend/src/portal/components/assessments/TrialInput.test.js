import React, { act, useState } from 'react';
import { renderScreen } from '../../screens/testRender';
import TrialInput, { TextEntry } from './TrialInput';
import Choice from './Choice';
import SaveState from './SaveState';

const field = (r, label) => r.container.querySelector(`[aria-label="${label}"]`);
const blur = (r, label) => act(async () => { field(r, label).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
const type = async (r, label, text) => { await r.fill(label, text); await blur(r, label); };

describe('a typed trial (Review Focus 3)', () => {
  test('"32,5" is 32.5 and is committed on blur', async () => {
    const commits = [];
    const r = await renderScreen(<TrialInput label="Grip right 1" value={null} rangeKey="grip" onCommit={(v) => commits.push(v)} />);
    await type(r, 'Grip right 1', '32,5');
    expect(commits).toEqual([32.5]);
    expect(r.container.querySelector('[role="alert"]')).toBeNull();
    await r.unmount();
  });
  test('a unit, a sign or an out-of-range typo is refused inline and never sent', async () => {
    const commits = [];
    const r = await renderScreen(<TrialInput label="Grip right 1" value={null} rangeKey="grip" onCommit={(v) => commits.push(v)} />);
    await type(r, 'Grip right 1', '32.5kg');
    expect(r.text()).toContain('Numbers only, like 32.5');
    expect(field(r, 'Grip right 1').getAttribute('aria-invalid')).toBe('true');
    await type(r, 'Grip right 1', '-3');
    expect(r.text()).toContain('Numbers only, like 32.5');
    await type(r, 'Grip right 1', '150');
    expect(r.text()).toContain('Grip is 0-100 kg');
    expect(commits).toEqual([]);
    await type(r, 'Grip right 1', '15.0');
    expect(commits).toEqual([15]);
    expect(r.text()).not.toContain('Grip is 0-100 kg');
    await r.unmount();
  });
  test('clearing a stored trial commits null; the same value commits nothing; Enter commits', async () => {
    const commits = [];
    const r = await renderScreen(<TrialInput label="Mass 1" value={41.2} rangeKey="mass" onCommit={(v) => commits.push(v)} />);
    expect(field(r, 'Mass 1').value).toBe('41.2');
    await type(r, 'Mass 1', '41.2');
    expect(commits).toEqual([]);
    await type(r, 'Mass 1', '');
    expect(commits).toEqual([null]);
    await r.fill('Mass 1', '40.9');
    await act(async () => {
      field(r, 'Mass 1').focus();
      field(r, 'Mass 1').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(commits).toEqual([null, 40.9]);
    await r.unmount();
  });
  test('a stored value that changes while the field is not being edited is shown', async () => {
    function Host() {
      const [v, setV] = useState(41.2);
      return (
        <>
          <TrialInput label="Mass 1" value={v} rangeKey="mass" onCommit={() => {}} />
          <button type="button" onClick={() => setV(39.8)}>Reload</button>
        </>
      );
    }
    const r = await renderScreen(<Host />);
    await r.click('Reload');
    expect(field(r, 'Mass 1').value).toBe('39.8');
    await r.unmount();
  });
});

test('text entry: trimmed, capped and committed on blur; blank is null', async () => {
  const commits = [];
  const r = await renderScreen(<TextEntry label="Driver" value={null} max={10} onCommit={(v) => commits.push(v)} />);
  await type(r, 'Driver', '  TSR3 10.5 degrees ');
  expect(commits).toEqual(['TSR3 10.5']);
  await r.unmount();
});

test('choices: each answer is its own labelled button; a clearable choice clears on a second tap', async () => {
  const picks = [];
  const r = await renderScreen(<Choice label="Ava readiness" value="pass" options={[['pass', 'Pass'], ['not-tested', 'Not tested']]} clearable onChange={(k) => picks.push(k)} />);
  expect(r.button('Ava readiness: Pass').getAttribute('aria-pressed')).toBe('true');
  await r.click('Ava readiness: Not tested');
  await r.click('Ava readiness: Pass');
  expect(picks).toEqual(['not-tested', null]);
  await r.unmount();
});

test('save state: saving, saved, the slow copy, and an error with a retry', async () => {
  let retried = 0;
  const show = async (entry) => {
    const r = await renderScreen(<SaveState entry={entry} onRetry={() => { retried += 1; }} />);
    const text = r.text();
    if (entry?.state === 'error') await r.click('Try again');
    await r.unmount();
    return text;
  };
  expect(await show(null)).toBe('');
  expect(await show({ state: 'saving' })).toBe('Saving…');
  expect(await show({ state: 'saved' })).toBe('Saved');
  expect(await show({ state: 'slow', message: 'Not saved yet.' })).toBe('Not saved yet.');
  expect(await show({ state: 'error', message: "Didn't save." })).toContain("Didn't save.");
  expect(retried).toBe(1);
});
