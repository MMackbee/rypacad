import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PortalRoutes from './PortalRoutes';

jest.mock('./StatesHarness', () => ({ __esModule: true, default: () => 'HARNESS' }));

function Spy({ onLoc }) { onLoc(useLocation()); return null; }

test('an unknown portal path lands on the index (K18)', async () => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  let loc = null;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/portal/does-not-exist']}>
        <Spy onLoc={(l) => { loc = l; }} />
        <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>
      </MemoryRouter>
    );
  });
  expect(loc.pathname).toBe('/portal');
  expect(container.textContent).toContain('HARNESS');
  await act(async () => { root.unmount(); });
});
