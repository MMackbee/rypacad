import {
  SEND_FAILED,
  appVersionOf,
  canSendFeedback,
  cleanPage,
  feedbackPayload,
  measureLayout,
  sendErrorMessage,
  shouldShowFeedback,
  viewportOf,
} from './feedback';

/* The Feedback button's plain helpers (2026-10-15). */

const signedIn = { live: true, loading: false, user: { uid: 'u1', role: 'coach' }, provisioned: true };

describe('shouldShowFeedback', () => {
  test('every signed-in, provisioned screen', () => {
    for (const pathname of ['/portal/family', '/portal/home', '/portal/admin/scholarships', '/portal/athlete/a1', '/portal/register', '/portal/welcome']) {
      expect(shouldShowFeedback({ ...signedIn, pathname })).toBe(true);
    }
  });
  test('never before sign-in, on not-provisioned, on the index, or without a provisioned session', () => {
    for (const pathname of ['/portal', '/portal/', '/portal/signin', '/portal/signup', '/portal/not-provisioned']) {
      expect(shouldShowFeedback({ ...signedIn, pathname })).toBe(false);
    }
    expect(shouldShowFeedback({ ...signedIn, live: false, pathname: '/portal/family' })).toBe(false);
    expect(shouldShowFeedback({ ...signedIn, loading: true, pathname: '/portal/family' })).toBe(false);
    expect(shouldShowFeedback({ ...signedIn, user: null, pathname: '/portal/family' })).toBe(false);
    expect(shouldShowFeedback({ ...signedIn, provisioned: false, pathname: '/portal/register' })).toBe(false);
  });
});

describe('cleanPage', () => {
  test('path and query; secret values dropped, whatever their case', () => {
    expect(cleanPage('/portal/signin', '?mode=verifyEmail&oobCode=X&apiKey=Y&TOKEN=Z&code=C&session=S&lang=en'))
      .toBe('/portal/signin?mode=verifyEmail&lang=en');
    expect(cleanPage('/portal/family', '')).toBe('/portal/family');
    expect(cleanPage('', '')).toBe('/');
  });
  test('300 characters at most', () => {
    expect(cleanPage(`/portal/${'a'.repeat(400)}`, '')).toHaveLength(300);
  });
});

test('viewportOf names the pixel ratio only when it is not 1', () => {
  expect(viewportOf({ innerWidth: 390, innerHeight: 844, devicePixelRatio: 3 })).toBe('390x844 @3x');
  expect(viewportOf({ innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1 })).toBe('1440x900');
  expect(viewportOf({ innerWidth: 412, innerHeight: 915, devicePixelRatio: 2.625 })).toBe('412x915 @2.63x');
});

test('appVersionOf: the env, else the bundle hash, else dev', () => {
  const doc = (srcs) => ({ scripts: srcs.map((src) => ({ src })) });
  expect(appVersionOf(doc([]), { REACT_APP_VERSION: '2026.10.15' })).toBe('2026.10.15');
  expect(appVersionOf(doc(['https://portal.rypacademy.com/static/js/main.3f2a1b9c.js']), {})).toBe('build 3f2a1b9c');
  expect(appVersionOf(doc(['http://localhost:3000/static/js/bundle.js']), {})).toBe('dev');
});

test('canSendFeedback', () => {
  const shot = { dataUrl: 'data:image/jpeg;base64,AA' };
  expect(canSendFeedback('', true, shot)).toBe(true);
  expect(canSendFeedback('', false, shot)).toBe(false);
  expect(canSendFeedback('  ', true, null)).toBe(false);
  expect(canSendFeedback('note', false, null)).toBe(true);
});

describe('feedbackPayload', () => {
  const win = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 3, navigator: { userAgent: 'UA/1' } };
  const doc = { scripts: [] };
  const shot = { dataUrl: 'data:image/jpeg;base64,AA', width: 1170, height: 2532 };
  test('the image only while it is included', () => {
    expect(feedbackPayload({ note: ' hi ', page: '/portal/tour', shot, includeShot: true, win, doc })).toEqual({
      note: 'hi', page: '/portal/tour', viewport: '390x844 @3x', userAgent: 'UA/1', appVersion: 'dev', image: shot,
    });
    expect(feedbackPayload({ note: 'hi', page: '/portal/tour', shot, includeShot: false, win, doc })).not.toHaveProperty('image');
  });
  test('the note is capped at 2000', () => {
    expect(feedbackPayload({ note: 'x'.repeat(2500), page: '/', shot: null, includeShot: false, win, doc }).note).toHaveLength(2000);
  });
});

test('sendErrorMessage keeps a sentence and replaces a bare code', () => {
  expect(sendErrorMessage(new Error('Feedback is not set up yet.'))).toBe('Feedback is not set up yet.');
  expect(sendErrorMessage(new Error('internal'))).toBe(SEND_FAILED);
  expect(sendErrorMessage(new Error('submitFeedback failed.'))).toBe(SEND_FAILED);
  expect(sendErrorMessage(null)).toBe(SEND_FAILED);
});

describe('measureLayout', () => {
  const el = (rect) => ({ getBoundingClientRect: () => rect });
  const doc = (footers, overlay = false) => ({
    querySelectorAll: () => footers,
    querySelector: () => (overlay ? {} : null),
  });
  const win = { innerHeight: 800 };
  test('clears the tallest visible footer, ignores hidden ones, and caps at 60%', () => {
    expect(measureLayout(doc([el({ top: 722, bottom: 800, height: 78 })]), win)).toEqual({ bottom: 78, covered: false });
    expect(measureLayout(doc([el({ top: 722, bottom: 800, height: 78 }), el({ top: 900, bottom: 980, height: 80 }),
      el({ top: 0, bottom: 0, height: 0 })]), win).bottom).toBe(78);
    expect(measureLayout(doc([el({ top: 100, bottom: 800, height: 700 })]), win).bottom).toBe(480);
    expect(measureLayout(doc([]), win)).toEqual({ bottom: 0, covered: false });
  });
  test('covered while a sheet is open', () => {
    expect(measureLayout(doc([], true), win).covered).toBe(true);
  });
});
