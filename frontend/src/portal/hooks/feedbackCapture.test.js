import {
  FONT_BUDGET_MS,
  SHOT_MAX_BYTES,
  captureScreenshot,
  dataUrlBytes,
  encodeShot,
  fontEmbedCss,
  latinFontFaces,
  pinScroll,
  resetFontCache,
  scaleFor,
} from './feedbackCapture';

/*
 * The Feedback screenshot (2026-10-15). html-to-image is a stand-in: jsdom
 * cannot draw, so these pin what is asked of it and what is done with its
 * canvas.
 */

const jpegOf = (bytes) => `data:image/jpeg;base64,${'A'.repeat(Math.ceil((bytes * 4) / 3))}`;
const fakeCanvas = (width, height, sizes) => ({
  width,
  height,
  qualities: [],
  toDataURL(type, q) {
    this.qualities.push(q);
    return jpegOf(sizes[q] ?? sizes.default);
  },
});

afterEach(() => resetFontCache());

test('scaleFor keeps the long side at 1600 and never upsamples', () => {
  expect(scaleFor(390, 844, 3) * 844).toBeCloseTo(1600);
  expect(scaleFor(1440, 900, 2) * 1440).toBeCloseTo(1600);
  expect(scaleFor(390, 600, 2)).toBe(2);
  expect(scaleFor(390, 844, undefined)).toBe(1);
});

test('dataUrlBytes counts decoded bytes', () => {
  expect(dataUrlBytes('data:image/jpeg;base64,AAAA')).toBe(3);
  expect(dataUrlBytes('data:image/jpeg;base64,AAA=')).toBe(2);
  expect(dataUrlBytes('data:image/jpeg;base64,AA==')).toBe(1);
});

describe('encodeShot', () => {
  test('JPEG at 0.8 when it fits', () => {
    const canvas = fakeCanvas(738, 1600, { default: 400000 });
    const shot = encodeShot(canvas);
    expect(canvas.qualities).toEqual([0.8]);
    expect(shot).toMatchObject({ width: 738, height: 1600 });
    expect(shot.dataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
    expect(dataUrlBytes(shot.dataUrl)).toBeLessThanOrEqual(SHOT_MAX_BYTES);
  });
  test('steps the quality down until it fits', () => {
    const canvas = fakeCanvas(738, 1600, { 0.8: 2e6, 0.65: 1.6e6, 0.5: 1e6 });
    expect(encodeShot(canvas)).not.toBeNull();
    expect(canvas.qualities).toEqual([0.8, 0.65, 0.5]);
  });
  test('then the size; null when even that is too big or cannot be drawn', () => {
    const small = fakeCanvas(0, 0, { default: 900000 });
    const doc = { createElement: () => Object.assign(small, { getContext: () => ({ drawImage: jest.fn() }) }) };
    const shot = encodeShot(fakeCanvas(1000, 1600, { default: 3e6 }), doc);
    expect(shot).toMatchObject({ width: 700, height: 1120 });
    const huge = { createElement: () => Object.assign(fakeCanvas(0, 0, { default: 3e6 }), { getContext: () => ({ drawImage: jest.fn() }) }) };
    expect(encodeShot(fakeCanvas(1000, 1600, { default: 3e6 }), huge)).toBeNull();
    const noCanvas = { createElement: () => ({ getContext: () => null }) };
    expect(encodeShot(fakeCanvas(1000, 1600, { default: 3e6 }), noCanvas)).toBeNull();
    expect(encodeShot(null)).toBeNull();
  });
});

test('pinScroll shows what is on screen, then puts everything back', () => {
  const root = document.createElement('div');
  const scroller = document.createElement('div');
  const a = document.createElement('div');
  const b = document.createElement('div');
  b.style.transform = 'scale(2)';
  scroller.append(a, b);
  root.append(scroller);
  let top = 300;
  Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
  const restore = pinScroll(root);
  expect(top).toBe(0);
  expect(a.style.transform).toBe('translate(0px, -300px)');
  expect(b.style.transform).toBe('translate(0px, -300px) scale(2)');
  restore();
  expect(top).toBe(300);
  expect(a.style.transform).toBe('');
  expect(b.style.transform).toBe('scale(2)');
});

test('latinFontFaces keeps only the latin faces', () => {
  const css = [
    "/* cyrillic */\n@font-face {\n  font-family: 'Raleway';\n  src: url(https://fonts.gstatic.com/s/raleway/cyr.woff2) format('woff2');\n  unicode-range: U+0301, U+0400-045F;\n}",
    "/* latin-ext */\n@font-face {\n  font-family: 'Raleway';\n  src: url(https://fonts.gstatic.com/s/raleway/ext.woff2) format('woff2');\n  unicode-range: U+0100-02BA;\n}",
    "/* latin */\n@font-face {\n  font-family: 'Raleway';\n  src: url(https://fonts.gstatic.com/s/raleway/latin.woff2) format('woff2');\n  unicode-range: U+0000-00FF, U+0131;\n}",
    "@font-face {\n  font-family: 'Work Sans';\n  src: url(https://fonts.gstatic.com/s/worksans/all.woff2) format('woff2');\n}",
  ].join('\n');
  const faces = latinFontFaces(css);
  expect(faces).toHaveLength(2);
  expect(faces[0]).toContain('latin.woff2');
  expect(faces[1]).toContain('all.woff2');
});

test('fontEmbedCss embeds the latin files once, and gives up quietly', async () => {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Raleway';
  document.head.appendChild(link);
  const css = "/* latin */\n@font-face {\n  font-family: 'Raleway';\n  src: url(https://fonts.gstatic.com/s/raleway/latin.woff2) format('woff2');\n  unicode-range: U+0000-00FF;\n}";
  const fetchFn = jest.fn(async (url) => (url.includes('googleapis')
    ? { ok: true, text: async () => css }
    : { ok: true, blob: async () => new Blob(['font-bytes'], { type: 'font/woff2' }) }));
  const out = await fontEmbedCss(document, fetchFn);
  expect(out).toContain('url(data:font/woff2;base64,');
  expect(out).not.toContain('fonts.gstatic.com');
  await fontEmbedCss(document, fetchFn);
  expect(fetchFn).toHaveBeenCalledTimes(2); // the stylesheet and one font file, once per page load
  resetFontCache();
  expect(await fontEmbedCss(document, async () => { throw new Error('offline'); })).toBe('');
  link.remove();
});

describe('captureScreenshot', () => {
  const lib = (canvas) => ({ toCanvas: jest.fn(async () => canvas) });

  test('draws #root at the viewport size, without the feedback UI, and encodes it', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    document.body.appendChild(root);
    const fake = lib(fakeCanvas(738, 1600, { default: 300000 }));
    const shot = await captureScreenshot({ load: async () => fake, fetchFn: async () => ({ ok: false }) });
    expect(shot).toMatchObject({ width: 738, height: 1600 });
    const [node, options] = fake.toCanvas.mock.calls[0];
    expect(node).toBe(root);
    expect(options).toMatchObject({ width: document.documentElement.clientWidth || window.innerWidth, height: window.innerHeight,
      backgroundColor: '#000000', cacheBust: false, fontEmbedCSS: '' });
    expect(options.pixelRatio * Math.max(options.width, options.height)).toBeLessThanOrEqual(1600.0001);
    const ui = document.createElement('button');
    ui.setAttribute('data-feedback-ui', '');
    expect(options.filter(ui)).toBe(false);
    expect(options.filter(document.createElement('div'))).toBe(true);
    expect(options.filter(document.createTextNode('x'))).toBe(true);
    root.remove();
  });

  test('fonts that take too long are skipped for this shot', async () => {
    jest.useFakeTimers();
    try {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Raleway';
      document.head.appendChild(link);
      const fake = lib(fakeCanvas(738, 1600, { default: 300000 }));
      const pending = captureScreenshot({ load: async () => fake, fetchFn: () => new Promise(() => {}) });
      for (let i = 0; i < 10; i += 1) await Promise.resolve(); // up to the budget's timer
      jest.advanceTimersByTime(FONT_BUDGET_MS + 1);
      await pending;
      expect(fake.toCanvas.mock.calls[0][1]).toMatchObject({ skipFonts: true });
      expect(fake.toCanvas.mock.calls[0][1]).not.toHaveProperty('fontEmbedCSS');
      link.remove();
    } finally {
      jest.useRealTimers();
    }
  });

  test('a failed draw rejects and still restores the scroll', async () => {
    const root = document.createElement('div');
    root.id = 'root';
    const scroller = document.createElement('div');
    scroller.append(document.createElement('div'));
    root.append(scroller);
    document.body.appendChild(root);
    let top = 120;
    Object.defineProperty(scroller, 'scrollTop', { configurable: true, get: () => top, set: (v) => { top = v; } });
    const broken = { toCanvas: jest.fn(async () => { expect(top).toBe(0); throw new Error('tainted'); }) };
    await expect(captureScreenshot({ load: async () => broken, fetchFn: async () => ({ ok: false }) })).rejects.toThrow('tainted');
    expect(top).toBe(120);
    expect(broken.toCanvas).toHaveBeenCalled();
    root.remove();
  });
});
