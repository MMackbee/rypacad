import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

function LocationSpy({ onChange }) {
  const loc = useLocation();
  onChange(loc);
  return null;
}

/** Mounts a screen under a MemoryRouter; every action is wrapped in act(). */
export async function renderScreen(element, { path = '/' } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const loc = { current: null };
  // The same tree every time, so a rerender keeps the router (and its
  // location) and gives the screen new props instead of remounting it.
  const tree = (el) => (
    <MemoryRouter initialEntries={[path]}>
      <LocationSpy onChange={(l) => { loc.current = l; }} />
      <Routes>
        <Route path="*" element={el} />
      </Routes>
    </MemoryRouter>
  );
  await act(async () => {
    root.render(tree(element));
  });
  // A real <button> by its visible text, or ANY button-like element by its
  // aria-label: Toggle (role="switch", no text), PackageCard and the
  // AdminSignups row (role="button" divs) are all tap targets the screens
  // tests click by name.
  const button = (label) =>
    [...container.querySelectorAll('button, [role="button"], [role="switch"]')].find(
      (b) => b.textContent.trim() === label || b.getAttribute('aria-label') === label
    ) || null;
  const valueSetter = (el) => {
    const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    return Object.getOwnPropertyDescriptor(proto, 'value').set;
  };
  return {
    container,
    text: () => container.textContent,
    button,
    click: async (label) => {
      const b = button(label);
      if (!b) throw new Error(`no button "${label}"`);
      await act(async () => { b.click(); });
    },
    fill: async (ariaLabel, value) => {
      const el = container.querySelector(`[aria-label="${ariaLabel}"]`);
      if (!el) throw new Error(`no field "${ariaLabel}"`);
      valueSetter(el).call(el, value);
      await act(async () => {
        el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
    },
    flush: () => act(async () => {}),
    /** Re-renders the same root with a new element (new props, same mounted tree). */
    rerender: async (el) => { await act(async () => { root.render(tree(el)); }); },
    /** Runs `fn` inside React's act, e.g. advancing fake timers. */
    act: async (fn) => { await act(async () => { await fn(); }); },
    location: () => loc.current,
    unmount: async () => { await act(async () => { root.unmount(); }); container.remove(); },
  };
}
