import React from 'react';
import { renderScreen } from '../screens/testRender';
import ResearchSheet from './ResearchSheet';

test('the Read more sheet reads the approved sections and closes', async () => {
  const closed = [];
  const r = await renderScreen(<ResearchSheet name="Jordan" onClose={() => closed.push(1)} />);
  for (const heading of ['What it covers', 'How it is used', 'Your choice']) expect(r.text()).toContain(heading);
  expect(r.text()).toContain("we include Jordan's results in that research");
  expect(r.text()).toContain('by emailing makel@rypgolf.com');
  await r.click('Close');
  expect(closed).toEqual([1]);
  await r.unmount();
});
