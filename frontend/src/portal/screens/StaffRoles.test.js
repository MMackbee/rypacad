import React from 'react';
import { renderScreen } from './testRender';
import StaffRoles from './StaffRoles';

let mockStaff;
jest.mock('../hooks', () => ({
  useStaff: () => ({ data: { staff: mockStaff, pendingInvites: [], roles: [], auditNote: '', screeningNote: '' }, loading: false, error: null, invite: async () => ({}) }),
}));
jest.mock('../hooks/assessmentsLive', () => ({ __esModule: true, setStaffAssessor: async (args) => args }));

test('the Assessments switch sits on coach and mental rows, never on owner or ops (assessments spec 3)', async () => {
  mockStaff = [
    { id: 'o', name: 'Owner One', role: 'owner', mfa: true },
    { id: 'c', name: 'Data Coach', role: 'coach', assessor: true, mfa: true },
    { id: 'm', name: 'Yannick', role: 'mental', mfa: true },
    { id: 'x', name: 'Ops Person', role: 'ops', mfa: true },
  ];
  const r = await renderScreen(<StaffRoles bare />);
  expect(r.button('Assessments for Data Coach').getAttribute('aria-checked')).toBe('true');
  expect(r.button('Assessments for Yannick').getAttribute('aria-checked')).toBe('false');
  expect(r.button('Assessments for Owner One')).toBeNull();
  expect(r.button('Assessments for Ops Person')).toBeNull();
  await r.unmount();
});
