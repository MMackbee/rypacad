/**
 * public/index.html (speed work 2026-11-17, F14): something shows at once -
 * an inline splash inside #root until React mounts - and the Google Fonts
 * stylesheet no longer blocks the first paint. Same fonts as before.
 */
const fs = require('fs');
const path = require('path');

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700&family=Work+Sans:wght@400;500;600;700&display=swap';

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const page = new DOMParser().parseFromString(html, 'text/html');

test('#root holds an inline splash with the name and the line, until React replaces it', () => {
  const splash = page.querySelector('#root [data-launch-splash]');
  expect(splash).not.toBeNull();
  expect(splash.textContent).toContain('RYP Academy');
  expect(splash.textContent).toContain('Reach Your Potential');
});

test('the splash fetches nothing: no image, no external URL, its style inline in the page', () => {
  const splash = page.querySelector('#root [data-launch-splash]');
  expect(splash.querySelectorAll('img, link, script, [src], [href]')).toHaveLength(0);
  expect(splash.outerHTML).not.toMatch(/url\(|https?:/);
  const css = [...page.querySelectorAll('head style')].map((s) => s.textContent).join('\n');
  expect(css).toMatch(/\[data-launch-splash\]/);
  expect(css).not.toMatch(/url\(|@import/);
});

test('the Google Fonts stylesheet is not render-blocking and still loads the same fonts', () => {
  const fontSheets = [...page.querySelectorAll('head link[rel="stylesheet"]')].filter((l) => l.getAttribute('href').includes('fonts.googleapis.com') && !l.closest('noscript'));
  expect(fontSheets).toHaveLength(1);
  const sheet = fontSheets[0];
  expect(sheet.getAttribute('href')).toBe(FONTS_URL);
  expect(sheet.getAttribute('media')).toBe('print');
  expect(sheet.getAttribute('onload')).toMatch(/this\.media\s*=\s*'all'/);
  const preload = page.querySelector(`head link[rel="preload"][as="style"][href="${FONTS_URL}"]`);
  expect(preload).not.toBeNull();
});

test('without JavaScript the fonts still load (noscript fallback)', () => {
  expect(html).toMatch(/<noscript>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Raleway:wght@400;500;600;700&family=Work\+Sans:wght@400;500;600;700&display=swap" \/>\s*<\/noscript>/);
});

test('the splash is in step with the React launch splash (components/LaunchSplash.js)', () => {
  const component = fs.readFileSync(path.join(__dirname, 'portal', 'components', 'LaunchSplash.js'), 'utf8');
  expect(component).toContain('RYP Academy');
  expect(component).toContain('Reach Your Potential');
  expect(component).toContain('data-launch-splash');
});
