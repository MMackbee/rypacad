import React, { Suspense, lazy } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';

/*
 * The staff booking route wrapper (spec 01-spec-admin-booking.md 10.2, plan
 * 04-plan-admin-booking.md Task E4), kept out of the grandfathered
 * PortalRoutes.js, which imports it and adds one <Route> behind RequireRole
 * ops/owner (the CombineRoutes.js pattern). The screen is its own chunk; the
 * loader is exported for a warm-up.
 */
export const loadStaffAthleteBookings = () => import('./screens/StaffAthleteBookings');
const StaffAthleteBookings = lazy(loadStaffAthleteBookings);

/**
 * /portal/admin/athletes/:athleteId/bookings: one athlete's bookings for the
 * owner or ops, opened from the Admin screen's Manage bookings card. The
 * role is the signed-in account's, waited for while a live session
 * resolves, so the screen never sees a guessed one; practice mode reads as
 * the owner. Back goes to Admin; Family billing opens the household's staff
 * Billing view.
 */
export function StaffAthleteBookingsRoute() {
  const { athleteId } = useParams();
  const navigate = useNavigate();
  const live = isLive();
  const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  if (live && loading) return null;
  const role = (live && user?.role) || 'owner';
  return (
    <Suspense fallback={null}>
      <StaffAthleteBookings
        bare
        athleteId={athleteId}
        role={role}
        onBack={() => navigate('/portal/admin')}
        onOpenHousehold={(id) => navigate(`/portal/admin/households/${id}`)}
      />
    </Suspense>
  );
}
