/**
 * The launch splash's height (review 2026-11-17, F6). On phones 100vh is the
 * tall viewport with the browser toolbar hidden, so a 100vh splash in the
 * browser is taller than the screen: it scrolls, and the name sits below the
 * visual centre. Like PhoneFrame (UX review 2026-09-30): 100dvh where the
 * browser has it, 100vh where it does not.
 */
const realCSS = global.CSS;

afterEach(() => {
  global.CSS = realCSS;
});

function loadWith(supportsDvh) {
  global.CSS = { supports: (prop, value) => supportsDvh && /dvh/.test(String(value)) };
  let mod;
  jest.isolateModules(() => {
    mod = require('./LaunchSplash');
  });
  return mod;
}

test('100dvh where the browser supports it', () => {
  expect(loadWith(true).LAUNCH_MIN_HEIGHT).toBe('100dvh');
});

test('100vh where it does not', () => {
  expect(loadWith(false).LAUNCH_MIN_HEIGHT).toBe('100vh');
});
