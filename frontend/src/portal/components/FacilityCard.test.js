import React from 'react';
import { renderScreen } from '../screens/testRender';
import FacilityCard from './FacilityCard';

jest.mock('./PayButton', () => ({ __esModule: true, default: ({ athleteId, product, label }) => <button type="button">{label}|{athleteId}|{product}</button> }));
const member = (over) => ({ athleteId: 'a1', name: 'Jordan', package: { kind: 'tokens' }, billing: { status: 'active', facility: null }, facilityAccess: false, ...over });

test('offer, paid-waiver-pending, active, elite', async () => {
  const o = await renderScreen(<FacilityCard member={member()} />);
  expect(o.text()).toContain('$300');
  expect(o.button('Add facility access|a1|facility')).not.toBeNull();
  await o.unmount();
  const p = await renderScreen(<FacilityCard member={member({ billing: { status: 'active', facility: 'active' } })} />);
  expect(p.text()).toContain('Facility access: paid - waiver pending');
  await p.unmount();
  const e = await renderScreen(<FacilityCard member={member({ package: { kind: 'elite' } })} />);
  expect(e.text()).toBe('');
  await e.unmount();
  const ro = await renderScreen(<FacilityCard member={member()} readOnly />);
  expect(ro.button('Add facility access|a1|facility')).toBeNull();
  expect(ro.text()).toContain('No facility access');
  await ro.unmount();
});
