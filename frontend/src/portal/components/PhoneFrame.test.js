/**
 * The bare frame's height on phones (UX review 2026-09-30): min-height beats
 * height, so a 100vh floor pushed the pinned footer under the browser toolbar.
 * SUPPORTS_DVH is read once at module load, so each case loads the module
 * fresh, with React from the same registry.
 */
function renderBareFrame(supportsDvh) {
  let html = '';
  const prev = global.CSS;
  global.CSS = supportsDvh === undefined ? undefined : { supports: (prop, value) => supportsDvh && prop === 'height' && value === '100dvh' };
  try {
    jest.isolateModules(() => {
      const React = require('react');
      const { renderToStaticMarkup } = require('react-dom/server');
      const PhoneFrame = require('./PhoneFrame').default;
      html = renderToStaticMarkup(React.createElement(PhoneFrame, { bare: true }, 'content'));
    });
  } finally {
    global.CSS = prev;
  }
  return html;
}

test('where dvh works, the bare frame is exactly the visible viewport (no 100vh floor)', () => {
  const html = renderBareFrame(true);
  expect(html).toContain('height:100dvh');
  expect(html).not.toContain('min-height');
});

test('without dvh support it keeps the 100vh floor it had before', () => {
  expect(renderBareFrame(false)).toContain('min-height:100vh');
  expect(renderBareFrame(undefined)).toContain('min-height:100vh');
});
