import React from 'react';
import { renderScreen } from '../../screens/testRender';
import NoteEditor from './NoteEditor';
import SaveState from './SaveState';

beforeEach(() => { jest.useFakeTimers('modern'); jest.setSystemTime(new Date('2026-11-11T10:42:00')); });
afterEach(() => jest.useRealTimers());

test('autosaves on blur and every 10 s while dirty; never with an unchanged body', async () => {
  const onSave = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="Start." saveState="idle" savedAt={null} onSave={onSave} />, { path: '/x' });
  const ta = r.container.querySelector('textarea[aria-label="Note"]');
  await r.fill('Note', 'Start. More.');
  await r.flush();
  await r.act(() => { jest.advanceTimersByTime(10000); });
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenLastCalledWith('Start. More.');
  await r.act(() => { jest.advanceTimersByTime(10000); });
  expect(onSave).toHaveBeenCalledTimes(1);
  await r.fill('Note', 'Start. More. Again.');
  // react-dom 18 wires onBlur to the native `focusout` event (registerSimpleEvent('focusout', 'onBlur'));
  // a dispatched 'blur' never reaches React's root listener and onSave would stay at one call.
  await r.act(() => { ta.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave).toHaveBeenLastCalledWith('Start. More. Again.');
  r.unmount();
});

test('text typed after a save stays in the textarea when new props arrive', async () => {
  const onSave = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="A" saveState="saving" savedAt={null} onSave={onSave} />, { path: '/x' });
  await r.fill('Note', 'A B');
  await r.rerender(<NoteEditor initialBody="A" saveState="saved" savedAt={Date.now()} onSave={onSave} />);
  expect(r.container.querySelector('textarea').value).toBe('A B');
  expect(r.text()).toContain('Saved · 10:42');
  r.unmount();
});

test('delete confirms inline', async () => {
  const onDelete = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="A" saveState="saved" savedAt={Date.now()} onSave={jest.fn()} onDelete={onDelete} canDelete />, { path: '/x' });
  await r.click('Delete note');
  expect(r.text()).toContain('Delete this note?');
  await r.click('Keep');
  expect(onDelete).not.toHaveBeenCalled();
  await r.click('Delete note');
  await r.click('Yes, delete');
  expect(onDelete).toHaveBeenCalledTimes(1);
  r.unmount();
});

test('SaveState copy for every state', async () => {
  for (const [state, text] of [['idle', 'Not saved yet'], ['saving', 'Saving…'], ['slow', 'still trying'], ['error', 'Not saved. Check your connection']]) {
    const r = await renderScreen(<SaveState state={state} savedAt={null} />, { path: '/x' });
    expect(r.text()).toContain(text);
    // Awaited: an un-awaited unmount overlaps the next iteration's act and leaves React
    // flushing after jsdom is torn down, which crashes the jest worker.
    await r.unmount();
  }
});
