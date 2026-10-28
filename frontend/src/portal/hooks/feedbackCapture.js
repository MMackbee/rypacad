/**
 * The Feedback button's screenshot (owner-approved design, 2026-10-15): the
 * page as the sender sees it - never the button, its panel or its toast -
 * as a JPEG whose long side is at most 1600 px and whose bytes stay under
 * ~1.5 MB (the function refuses anything over 2 MB).
 *
 * html-to-image draws a clone of #root (the button lives outside it, in a
 * portal on <body>; the filter drops anything marked FEEDBACK_UI_ATTR all
 * the same). Three things it does not do on its own:
 *
 *  - Scroll. A clone has no scroll position, so a screen scrolled halfway
 *    down would come out at its top. pinScroll moves every scrolled
 *    element to 0 and shifts its children by the same distance, which
 *    paints exactly what was on screen, then puts both back once the clone
 *    is taken.
 *  - Fonts, cheaply. Its own font embedding fetches every Google Fonts
 *    subset and inserts their rules into the page's stylesheet. Here only
 *    the latin faces are fetched (already in the browser's cache), once per
 *    page load, within FONT_BUDGET_MS; past that the shot uses the system
 *    font and a later shot picks the fonts up.
 *  - Size. encodeShot steps the JPEG quality down, then the size, until the
 *    bytes fit.
 *
 * The library is loaded on the first tap, so none of it is in the first
 * bundle.
 */
import { color } from '../tokens';
import { FEEDBACK_UI_ATTR } from './feedback';

export const SHOT_MAX_SIDE = 1600;
export const SHOT_MAX_BYTES = 1.5 * 1024 * 1024;
const QUALITIES = [0.8, 0.65, 0.5];
const SHRINK = 0.7;
export const FONT_BUDGET_MS = 2500;
/** A transparent pixel for any image the clone cannot fetch (cross-origin, gone). */
const BLANK_IMAGE = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const GOOGLE_FONTS = 'link[rel="stylesheet"][href^="https://fonts.googleapis.com/"]';

const loadLibrary = () => import('html-to-image');

/** The pixel ratio that keeps the long side at most SHOT_MAX_SIDE, and never above the screen's own. */
export function scaleFor(width, height, dpr) {
  const screen = Number(dpr) > 0 ? Number(dpr) : 1;
  return Math.min(screen, SHOT_MAX_SIDE / Math.max(width, height, 1));
}

/** Decoded bytes of a base64 data URL. */
export function dataUrlBytes(dataUrl) {
  const b64 = String(dataUrl || '').split(',')[1] || '';
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

const fits = (url) => /^data:image\/(jpeg|png);base64,/.test(url) && dataUrlBytes(url) <= SHOT_MAX_BYTES;

/**
 * The canvas as `{ dataUrl, width, height }`: JPEG at 0.8, then 0.65, then
 * 0.5, then 70% of the size at 0.5; null when even that is too big.
 */
export function encodeShot(canvas, doc = document) {
  if (!canvas || !canvas.width || !canvas.height) return null;
  for (const q of QUALITIES) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (fits(url)) return { dataUrl: url, width: canvas.width, height: canvas.height };
  }
  const small = doc.createElement('canvas');
  small.width = Math.max(1, Math.round(canvas.width * SHRINK));
  small.height = Math.max(1, Math.round(canvas.height * SHRINK));
  const ctx = typeof small.getContext === 'function' ? small.getContext('2d') : null;
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, small.width, small.height);
  const url = small.toDataURL('image/jpeg', QUALITIES[QUALITIES.length - 1]);
  return fits(url) ? { dataUrl: url, width: small.width, height: small.height } : null;
}

/**
 * Every scrolled element under `root` to 0, its children shifted by the
 * distance, so a clone paints what is on screen. Returns the undo.
 * Visually nothing moves: the scroll and the shift cancel out.
 */
export function pinScroll(root) {
  const pinned = [];
  root.querySelectorAll('*').forEach((el) => {
    const top = el.scrollTop || 0;
    const left = el.scrollLeft || 0;
    if (top || left) pinned.push({ el, top, left, kids: Array.from(el.children, (kid) => [kid, kid.style.transform]) });
  });
  pinned.forEach(({ el, top, left, kids }) => {
    el.scrollTop = 0;
    el.scrollLeft = 0;
    kids.forEach(([kid, before]) => {
      kid.style.transform = `translate(${-left}px, ${-top}px)${before ? ` ${before}` : ''}`;
    });
  });
  return () => {
    pinned.slice().reverse().forEach(({ el, top, left, kids }) => {
      kids.forEach(([kid, before]) => {
        kid.style.transform = before;
      });
      el.scrollTop = top;
      el.scrollLeft = left;
    });
  };
}

/** The latin @font-face blocks of a Google Fonts stylesheet (labelled `latin`, or covering U+0000-00FF). */
export function latinFontFaces(cssText) {
  const out = [];
  const re = /(?:\/\*\s*([\w-]+)\s*\*\/\s*)?(@font-face\s*\{[^}]*\})/g;
  let m = re.exec(cssText);
  while (m) {
    const [, label, block] = m;
    const range = /unicode-range:\s*([^;]+);/.exec(block);
    if (label ? label === 'latin' : !range || /U\+0000-00FF/i.test(range[1])) out.push(block);
    m = re.exec(cssText);
  }
  return out;
}

function readAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function buildFontCss(doc, fetchFn) {
  const link = doc.querySelector(GOOGLE_FONTS);
  if (!link) return '';
  const res = await fetchFn(link.href, { mode: 'cors', credentials: 'omit' });
  if (!res.ok) return '';
  const files = new Map();
  const file = (url) => {
    if (!files.has(url)) {
      files.set(url, fetchFn(url, { mode: 'cors', credentials: 'omit' }).then((r) => {
        if (!r.ok) throw new Error(`font ${r.status}`);
        return r.blob();
      }).then(readAsDataUrl));
    }
    return files.get(url);
  };
  const blocks = await Promise.all(latinFontFaces(await res.text()).map(async (block) => {
    let out = block;
    for (const [, , url] of block.matchAll(/url\((['"]?)(https:\/\/fonts\.gstatic\.com\/[^'")\s]+)\1\)/g)) {
      out = out.split(url).join(await file(url));
    }
    return out;
  }));
  return blocks.join('\n');
}

let fontFlight = null;
/** The embedded-font CSS, built once per page load; '' when it cannot be built. */
export function fontEmbedCss(doc = document, fetchFn = (...args) => window.fetch(...args)) {
  if (!fontFlight) fontFlight = buildFontCss(doc, fetchFn).catch(() => '');
  return fontFlight;
}
/** Tests only: forget the cached font CSS. */
export function resetFontCache() {
  fontFlight = null;
}

const withinBudget = (promise, ms) =>
  Promise.race([promise, new Promise((resolve) => { setTimeout(() => resolve(null), ms); })]);

const keepNode = (node) => !(node && node.nodeType === 1 && node.hasAttribute(FEEDBACK_UI_ATTR));

/**
 * The visible page as `{ dataUrl, width, height }`. Rejects when the page
 * cannot be drawn or will not fit; the button then opens the panel without
 * a screenshot and says so.
 */
export async function captureScreenshot({ doc = document, win = window, load = loadLibrary, fetchFn } = {}) {
  const root = doc.getElementById('root') || doc.body;
  const width = Math.round(doc.documentElement.clientWidth || win.innerWidth || 0);
  const height = Math.round(win.innerHeight || 0);
  if (!width || !height) throw new Error('There is no page to capture.');
  const lib = await load();
  const fonts = await withinBudget(fontEmbedCss(doc, fetchFn), FONT_BUDGET_MS);
  const scrollX = win.scrollX || 0;
  const scrollY = win.scrollY || 0;
  const restore = pinScroll(root);
  let canvas;
  try {
    canvas = await lib.toCanvas(root, {
      width,
      height,
      pixelRatio: scaleFor(width, height, win.devicePixelRatio),
      backgroundColor: color.bg,
      cacheBust: false,
      imagePlaceholder: BLANK_IMAGE,
      filter: keepNode,
      ...(fonts == null ? { skipFonts: true } : { fontEmbedCSS: fonts }),
      ...(scrollX || scrollY ? { style: { transform: `translate(${-scrollX}px, ${-scrollY}px)` } } : {}),
    });
  } finally {
    restore();
  }
  const shot = encodeShot(canvas, doc);
  if (!shot) throw new Error('The screenshot is too large to send.');
  return shot;
}
