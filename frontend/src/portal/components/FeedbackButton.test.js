import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FeedbackButton, { THANKS } from './FeedbackButton';
import { NOTE_LABEL, NO_SHOT } from './FeedbackSheet';
import { captureScreenshot } from '../hooks/feedbackCapture';
import { callSubmitFeedback } from '../hooks/callables';

/*
 * The Feedback button (owner-approved design, 2026-10-15): who sees it, where
 * it sits, the panel, and what it sends. Capture and the callable are
 * stand-ins - no canvas, no network.
 */
const mockLive = { value: true };
const mockSession = { value: { user: { uid: 'u1', role: 'parent' }, provisioned: true, loading: false } };
jest.mock('../hooks/live', () => ({ ...jest.requireActual('../hooks/live'), isLive: () => mockLive.value }));
jest.mock('../hooks/useAuthSession', () => ({ __esModule: true, default: () => mockSession.value }));
jest.mock('../hooks/feedbackCapture', () => ({ captureScreenshot: jest.fn() }));
jest.mock('../hooks/callables', () => ({ callSubmitFeedback: jest.fn() }));

const SHOT = { dataUrl: 'data:image/jpeg;base64,/9j/AAAA', width: 1170, height: 2532 };
const tick = () => act(async () => { await new Promise((resolve) => { setTimeout(resolve, 30); }); });

async function mount(path = '/portal/family') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <FeedbackButton />
      </MemoryRouter>
    );
  });
  const q = (sel) => document.body.querySelector(sel);
  const byText = (label) => [...document.body.querySelectorAll('button')].find((b) => b.textContent.trim() === label) || null;
  return {
    container,
    feedback: () => q('button[aria-label="Send feedback"]'),
    dialog: () => q('[role="dialog"]'),
    toggle: () => q('[role="switch"]'),
    note: () => q('textarea'),
    byText,
    click: async (el) => {
      if (!el) throw new Error('nothing to click');
      await act(async () => { el.click(); });
    },
    type: async (value) => {
      const el = q('textarea');
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set.call(el, value);
      await act(async () => { el.dispatchEvent(new Event('input', { bubbles: true })); });
    },
    key: async (key) => {
      await act(async () => {
        q('[role="dialog"]').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      });
    },
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}

beforeEach(() => {
  captureScreenshot.mockReset();
  callSubmitFeedback.mockReset();
  captureScreenshot.mockResolvedValue(SHOT);
  callSubmitFeedback.mockResolvedValue({ ok: true });
});

afterEach(() => {
  mockLive.value = true;
  mockSession.value = { user: { uid: 'u1', role: 'parent' }, provisioned: true, loading: false };
  document.body.querySelectorAll('[data-portal-frame-footer], [data-portal-overlay]').forEach((el) => el.remove());
});

describe('who sees the button', () => {
  test.each(['parent', 'athlete', 'coach', 'mental', 'ops', 'owner'])('a signed-in %s does, outside the screen', async (role) => {
    mockSession.value = { user: { uid: 'u1', role }, provisioned: true, loading: false };
    const r = await mount('/portal/tour');
    expect(r.feedback()).not.toBeNull();
    expect(r.feedback().textContent).toBe('Feedback');
    // Portalled to <body>: never inside #root, so never in a screenshot of it.
    expect(r.container.contains(r.feedback())).toBe(false);
    expect(r.feedback().hasAttribute('data-feedback-ui')).toBe(true);
    await r.unmount();
    expect(r.feedback()).toBeNull();
  });

  test.each([
    ['seed mode (the review harness)', { live: false }],
    ['the session still resolving', { session: { user: null, provisioned: false, loading: true } }],
    ['signed out', { session: { user: null, provisioned: false, loading: false } }],
    ['signed in, not provisioned', { session: { user: { uid: 'u1', role: null }, provisioned: false, loading: false } }],
  ])('nobody in %s', async (_, { live = true, session }) => {
    mockLive.value = live;
    if (session) mockSession.value = session;
    const r = await mount('/portal/family');
    expect(r.feedback()).toBeNull();
    await r.unmount();
  });

  test.each(['/portal/signin', '/portal/signup', '/portal/not-provisioned', '/portal'])('not on %s, even signed in', async (path) => {
    const r = await mount(path);
    expect(r.feedback()).toBeNull();
    await r.unmount();
  });

  test('hidden when printing', async () => {
    const r = await mount();
    const css = [...document.body.querySelectorAll('style[data-feedback-ui]')].map((s) => s.textContent).join('');
    expect(css).toContain('@media print');
    expect(css).toContain('[data-feedback-ui]');
    expect(css).toContain('display: none');
    await r.unmount();
  });
});

describe('where it sits', () => {
  const footer = (top, height) => {
    const el = document.createElement('div');
    el.setAttribute('data-portal-frame-footer', '');
    el.getBoundingClientRect = () => ({ top, bottom: top + height, height, left: 0, right: 390, width: 390 });
    document.body.appendChild(el);
    return el;
  };

  test('above the tab bar, however tall the footer is', async () => {
    footer(window.innerHeight - 78, 78);
    const r = await mount();
    expect(r.feedback().style.bottom).toBe('90px');
    await r.unmount();
    footer(window.innerHeight - 150, 150);
    const r2 = await mount();
    expect(r2.feedback().style.bottom).toBe('162px');
    await r2.unmount();
  });

  test("steps aside while one of the screen's own sheets is open, and comes back", async () => {
    const r = await mount();
    expect(r.feedback()).not.toBeNull();
    const sheet = document.createElement('div');
    sheet.setAttribute('data-portal-overlay', '');
    await act(async () => { document.body.appendChild(sheet); });
    await tick();
    expect(r.feedback()).toBeNull();
    await act(async () => { sheet.remove(); });
    await tick();
    expect(r.feedback()).not.toBeNull();
    await r.unmount();
  });
});

describe('the panel', () => {
  test('the screenshot is taken BEFORE the panel opens, then shown with the switch on', async () => {
    let dialogWhenCaptured = 'not called';
    captureScreenshot.mockImplementation(async () => {
      dialogWhenCaptured = document.body.querySelector('[role="dialog"]');
      return SHOT;
    });
    const r = await mount();
    await r.click(r.feedback());
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    expect(dialogWhenCaptured).toBeNull();
    expect(r.dialog()).not.toBeNull();
    expect(r.dialog().getAttribute('aria-modal')).toBe('true');
    expect(r.dialog().textContent).toContain(NOTE_LABEL);
    expect(document.body.querySelector('label').getAttribute('for')).toBe(r.note().id);
    expect(r.note().maxLength).toBe(2000);
    expect(r.dialog().querySelector('img').getAttribute('src')).toBe(SHOT.dataUrl);
    expect(r.toggle().getAttribute('aria-label')).toBe('Include screenshot');
    expect(r.toggle().getAttribute('aria-checked')).toBe('true');
    // The floating button gives way to the panel.
    expect(r.feedback()).toBeNull();
    await r.unmount();
  });

  test('busy while the screenshot is being taken', async () => {
    let finish;
    captureScreenshot.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const r = await mount();
    await r.click(r.feedback());
    expect(r.feedback().getAttribute('aria-busy')).toBe('true');
    expect(r.dialog()).toBeNull();
    await r.click(r.feedback()); // a second tap while busy does nothing
    expect(captureScreenshot).toHaveBeenCalledTimes(1);
    await act(async () => { finish(SHOT); });
    expect(r.dialog()).not.toBeNull();
    await r.unmount();
  });

  test('a failed capture opens the panel without one and says so', async () => {
    captureScreenshot.mockRejectedValue(new Error('canvas tainted'));
    const r = await mount();
    await r.click(r.feedback());
    expect(r.dialog().textContent).toContain(NO_SHOT);
    expect(r.dialog().querySelector('img')).toBeNull();
    expect(r.toggle()).toBeNull();
    // Nothing to send until there is a note.
    expect(r.byText('Send').disabled).toBe(true);
    await r.type('The calendar is blank.');
    expect(r.byText('Send').disabled).toBe(false);
    await r.click(r.byText('Send'));
    expect(callSubmitFeedback.mock.calls[0][0]).not.toHaveProperty('image');
    expect(callSubmitFeedback.mock.calls[0][0].note).toBe('The calendar is blank.');
    await r.unmount();
  });

  test('Send needs a note or an included screenshot', async () => {
    const r = await mount();
    await r.click(r.feedback());
    expect(r.byText('Send').disabled).toBe(false); // the screenshot alone
    await r.click(r.toggle());
    expect(r.toggle().getAttribute('aria-checked')).toBe('false');
    expect(r.byText('Send').disabled).toBe(true); // nothing at all
    await r.type('   ');
    expect(r.byText('Send').disabled).toBe(true);
    await r.type('Hi');
    expect(r.byText('Send').disabled).toBe(false);
    await r.unmount();
  });

  test('Cancel and Escape close it, and focus returns to the button', async () => {
    const r = await mount();
    await r.click(r.feedback());
    await r.click(r.byText('Cancel'));
    expect(r.dialog()).toBeNull();
    expect(document.activeElement).toBe(r.feedback());
    await r.click(r.feedback());
    await r.key('Escape');
    expect(r.dialog()).toBeNull();
    expect(callSubmitFeedback).not.toHaveBeenCalled();
    await r.unmount();
  });
});

describe('what it sends', () => {
  test('with the screenshot: the image, the note, the page and the device - never who the sender is', async () => {
    const r = await mount('/portal/billing?paid=1&session_id=cs_1&token=abc');
    await r.click(r.feedback());
    await r.type('  The Pay button spun forever.  ');
    await r.click(r.byText('Send'));
    expect(callSubmitFeedback).toHaveBeenCalledTimes(1);
    const payload = callSubmitFeedback.mock.calls[0][0];
    expect(payload).toEqual({
      note: 'The Pay button spun forever.',
      page: '/portal/billing?paid=1&session_id=cs_1',
      viewport: expect.stringMatching(/^\d+x\d+/),
      userAgent: expect.any(String),
      appVersion: 'dev',
      image: SHOT,
    });
    expect(Object.keys(payload)).not.toEqual(expect.arrayContaining(['uid', 'email', 'role', 'displayName']));
    // Sent: the panel closes and the thanks shows.
    expect(r.dialog()).toBeNull();
    expect(document.body.textContent).toContain(THANKS);
    expect(document.body.querySelector('[role="status"]').textContent).toBe(THANKS);
    await r.unmount();
  });

  test('with the switch off: no image', async () => {
    const r = await mount();
    await r.click(r.feedback());
    await r.click(r.toggle());
    await r.type('No screenshot, please.');
    await r.click(r.byText('Send'));
    const payload = callSubmitFeedback.mock.calls[0][0];
    expect(payload).not.toHaveProperty('image');
    expect(payload.note).toBe('No screenshot, please.');
    expect(payload.page).toBe('/portal/family');
    await r.unmount();
  });

  test('busy while sending; a failure keeps the panel open with a plain error, and Send tries again', async () => {
    let fail;
    callSubmitFeedback.mockImplementationOnce(() => new Promise((_, reject) => { fail = reject; }));
    const r = await mount();
    await r.click(r.feedback());
    await r.type('Second try should work.');
    await r.click(r.byText('Send'));
    expect(r.byText('Sending')).not.toBeNull();
    expect(r.byText('Sending').disabled).toBe(true);
    expect(r.byText('Cancel').disabled).toBe(true);
    await act(async () => {
      fail(new Error('That is a lot of feedback in one hour - thank you. Try again a little later.'));
    });
    expect(r.dialog()).not.toBeNull();
    expect(r.dialog().querySelector('[role="alert"]').textContent)
      .toBe('That is a lot of feedback in one hour - thank you. Try again a little later.');
    expect(r.note().value).toBe('Second try should work.');
    expect(r.byText('Send').disabled).toBe(false);
    await r.click(r.byText('Send'));
    expect(callSubmitFeedback).toHaveBeenCalledTimes(2);
    expect(callSubmitFeedback.mock.calls[1][0]).toEqual(callSubmitFeedback.mock.calls[0][0]);
    expect(r.dialog()).toBeNull();
    expect(document.body.textContent).toContain(THANKS);
    await r.unmount();
  });

  test('a bare SDK error code becomes one plain line', async () => {
    callSubmitFeedback.mockRejectedValueOnce(Object.assign(new Error('internal'), { code: 'functions/internal' }));
    const r = await mount();
    await r.click(r.feedback());
    await r.type('x');
    await r.click(r.byText('Send'));
    expect(r.dialog().querySelector('[role="alert"]').textContent)
      .toBe('Your feedback did not send. Check your connection and try again.');
    await r.unmount();
  });
});
