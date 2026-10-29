import React from 'react';
import { Route, Routes } from 'react-router-dom';
import { renderScreen } from './screens/testRender';
import PortalRoutes from './PortalRoutes';

// Mounted at /portal/* as App.js does: renderScreen's own splat route resolves
// PortalRoutes' relative paths against '/', where 'mental' never matches.
const portal = <Routes><Route path="/portal/*" element={<PortalRoutes />} /></Routes>;

// The real Athletes and board screens load as lazy chunks inside the test, so their
// first require counts against the test's budget. It failed once in a loaded full CI
// run (the suite took 27 s there) and passed alone and on reruns: an explicit 30 s.
test('/portal/mental renders the Athletes screen and its tab bar reaches the board', async () => {
  const r = await renderScreen(portal, { path: '/portal/mental' });
  await r.flush();
  expect(r.text()).toContain('Athletes');
  expect(r.text()).toContain('Jordan Whitfield');
  await r.click('Contract');
  await r.flush();
  expect(r.location().pathname).toBe('/portal/mental/contract');
  await r.unmount();
}, 30000);
