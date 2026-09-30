import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ErrorBoundary, { CHUNK_RELOAD_KEY, isChunkError } from './ErrorBoundary';

const NOW = 1_000_000_000;
const realLocation = window.location;

function chunkError(message = 'Loading chunk 246 failed.\n(missing: http://localhost/static/js/246.abc.chunk.js)') {
  const e = new Error(message);
  e.name = 'ChunkLoadError';
  return e;
}

function Boom({ error }) {
  throw error;
}

let container;
let root;
let reload;

async function renderThrowing(error) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ErrorBoundary>
        <Boom error={error} />
      </ErrorBoundary>
    );
  });
  return container;
}

beforeEach(() => {
  window.sessionStorage.clear();
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  // React and jsdom both report the thrown render error; keep the output quiet.
  jest.spyOn(console, 'error').mockImplementation(() => {});
  reload = jest.fn();
  delete window.location;
  window.location = { href: realLocation.href, reload };
});

afterEach(async () => {
  if (root) await act(async () => { root.unmount(); });
  if (container) container.remove();
  root = null;
  container = null;
  window.location = realLocation;
  jest.restoreAllMocks();
});

describe('isChunkError', () => {
  test('matches webpack JS and CSS chunk failures by name or message', () => {
    expect(isChunkError(chunkError())).toBe(true);
    expect(isChunkError(new Error('Loading chunk 246 failed.'))).toBe(true);
    expect(isChunkError(new Error('Loading CSS chunk 830 failed.\n(/static/css/830.css)'))).toBe(true);
    expect(isChunkError(new Error('Loading chunk vendors-main failed.'))).toBe(true);
  });

  test('ignores other errors and non-errors', () => {
    expect(isChunkError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isChunkError(new TypeError('x is not a function'))).toBe(false);
    expect(isChunkError(null)).toBe(false);
    expect(isChunkError(undefined)).toBe(false);
  });
});

describe('ErrorBoundary stale-chunk reload', () => {
  test('a ChunkLoadError reloads once, records the time and shows no error card', async () => {
    const el = await renderThrowing(chunkError());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe(String(NOW));
    expect(el.textContent).toBe('');
  });

  test('a chunk failure recognised only by its message also reloads', async () => {
    await renderThrowing(new Error('Loading CSS chunk 146 failed.\n(/static/css/146.css)'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  test('a second chunk error within 10 s of the last reload shows the card instead', async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(NOW - 5000));
    const el = await renderThrowing(chunkError());
    expect(reload).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Something went wrong');
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe(String(NOW - 5000));
  });

  test('a reload recorded more than 10 s ago allows another one', async () => {
    window.sessionStorage.setItem(CHUNK_RELOAD_KEY, String(NOW - 10001));
    await renderThrowing(chunkError());
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBe(String(NOW));
  });

  test('offline shows the card and does not reload', async () => {
    jest.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const el = await renderThrowing(chunkError());
    expect(reload).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Something went wrong');
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });

  test('unreadable storage shows the card and does not reload', async () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    const el = await renderThrowing(chunkError());
    expect(reload).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Something went wrong');
  });

  test('a refused storage write shows the card rather than reloading unguarded', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const el = await renderThrowing(chunkError());
    expect(reload).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Something went wrong');
  });

  test('any other error shows the card as before', async () => {
    const el = await renderThrowing(new Error('Cannot read properties of undefined'));
    expect(reload).not.toHaveBeenCalled();
    expect(el.textContent).toContain('Something went wrong');
    expect(el.textContent).toContain('Refresh Page');
    expect(window.sessionStorage.getItem(CHUNK_RELOAD_KEY)).toBeNull();
  });
});
