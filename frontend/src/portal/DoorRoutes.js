import React, { Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';

/*
 * The Facility door staff route (docs/portal/plans/2026-11-17-door-button/
 * 00-spec.md 7), kept out of the grandfathered PortalRoutes.js, which imports
 * it and adds one <Route> behind RequireRole ops/owner (the
 * StaffBookingRoutes.js pattern). The screen is its own chunk.
 */
export const loadAdminDoor = () => import('./screens/AdminDoor');
const AdminDoor = lazy(loadAdminDoor);

/**
 * /portal/admin/door: the owner's or ops' Facility door screen, from the
 * Admin screen's Facility door card. The role is the signed-in account's,
 * waited for while a live session resolves; seed mode reads as the owner.
 * Back goes to Admin.
 */
export function AdminDoorRoute() {
  const navigate = useNavigate();
  const live = isLive();
  const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  if (live && loading) return null;
  const role = (live && user?.role) || 'owner';
  return (
    <Suspense fallback={null}>
      <AdminDoor bare role={role} onBack={() => navigate('/portal/admin')} />
    </Suspense>
  );
}
