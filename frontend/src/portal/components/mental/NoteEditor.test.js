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

test('leaving without a blur saves what was typed (browser Back, a swipe, the app going to the background)', async () => {
  const onSave = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="Start." saveState="saved" savedAt={Date.now()} onSave={onSave} />, { path: '/x' });
  await r.fill('Note', 'Start. Hidden tail.');
  const vis = jest.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  try {
    await r.act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  } finally {
    vis.mockRestore();
  }
  expect(onSave).toHaveBeenCalledTimes(1);
  expect(onSave).toHaveBeenLastCalledWith('Start. Hidden tail.');
  await r.fill('Note', 'Start. Hidden tail. Back tail.');
  await r.unmount();
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave).toHaveBeenLastCalledWith('Start. Hidden tail. Back tail.');
});

test('unmounting with nothing new to save sends nothing', async () => {
  const onSave = jest.fn();
  const r = await renderScreen(<NoteEditor initialBody="Start." saveState="saved" savedAt={Date.now()} onSave={onSave} />, { path: '/x' });
  await r.unmount();
  expect(onSave).not.toHaveBeenCalled();
});

test('a failed save is retried on the next tick with the same text, no keystroke needed', async () => {
  const onSave = jest.fn();
  const el = (saveState) => <NoteEditor initialBody="A" saveState={saveState} savedAt={null} onSave={onSave} />;
  const r = await renderScreen(el('idle'), { path: '/x' });
  await r.fill('Note', 'A offline');
  await r.act(() => { jest.advanceTimersByTime(10000); });
  expect(onSave).toHaveBeenCalledTimes(1);
  await r.rerender(el('error'));
  expect(r.text()).toContain('Not saved. Check your connection');
  await r.act(() => { jest.advanceTimersByTime(10000); });
  expect(onSave).toHaveBeenCalledTimes(2);
  expect(onSave).toHaveBeenLastCalledWith('A offline');
  await r.rerender(el('saved'));
  await r.act(() => { jest.advanceTimersByTime(10000); });
  expect(onSave).toHaveBeenCalledTimes(2);
  await r.unmount();
  expect(onSave).toHaveBeenCalledTimes(2);
});

test('a confirmed delete is not undone by the unmount flush, even after a failed save', async () => {
  const onSave = jest.fn();
  const onDelete = jest.fn();
  const el = (saveState) => <NoteEditor initialBody="A" saveState={saveState} savedAt={null} onSave={onSave} onDelete={onDelete} canDelete />;
  const r = await renderScreen(el('saved'), { path: '/x' });
  await r.fill('Note', 'A B');
  await r.act(() => { jest.advanceTimersByTime(10000); });
  await r.rerender(el('error'));
  await r.click('Delete note');
  await r.click('Yes, delete');
  expect(onDelete).toHaveBeenCalledTimes(1);
  await r.unmount();
  expect(onSave).toHaveBeenCalledTimes(1);
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
