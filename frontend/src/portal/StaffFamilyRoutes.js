import React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import BottomTabBar from './components/BottomTabBar';
import PhoneFrame from './components/PhoneFrame';
import { BackLink, Body, Card, ErrorNotice } from './components/Primitives';
import { ATHLETE_NOT_ON_FILE, BACK_TO_ADMIN } from './data/staffBookingCopy';
import { familyPagePath } from './data/staffFamily';
import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';
import { useStaffAthlete } from './hooks/staffBooking';

/*
 * The single staff family page's route helpers (owner 2026-11-16), kept out
 * of the grandfathered PortalRoutes.js, which imports them (the
 * CombineRoutes.js pattern).
 */

/**
 * /portal/admin/athletes/:athleteId (and the old .../bookings link): a click
 * on an ATHLETE by the owner or ops. It finds the athlete's family and lands
 * on the family page, opened on that athlete - there is no separate staff
 * screen per athlete any more. An athlete with no family on file goes to
 * the athlete page (there is no family page to show); one that is gone gets
 * a line saying so and the way back to Admin.
 */
export function StaffAthleteRedirect() {
  const { athleteId } = useParams();
  const navigate = useNavigate();
  const live = isLive();
  const { user } = useAuthSession(live ? undefined : { variant: 'idle' });
  const { data, loading, error } = useStaffAthlete(athleteId);
  if (data?.householdId) return <Navigate replace to={familyPagePath(data.householdId, athleteId)} />;
  if (data) return <Navigate replace to={`/portal/athlete/${encodeURIComponent(athleteId)}`} />;
  if (loading && !error) return null;
  const role = (live && user?.role) || 'owner';
  const missing = error?.code === 'not-found';
  return (
    <PhoneFrame
      bare
      header={
        <div style={{ padding: '8px 22px 14px' }}>
          <BackLink onClick={() => navigate('/portal/admin')}>{BACK_TO_ADMIN}</BackLink>
        </div>
      }
      footer={<BottomTabBar role={role} active="admin" />}
    >
      <div style={{ padding: '0 22px 24px' }}>
        {missing ? (
          <Card>
            <Body size={13}>{ATHLETE_NOT_ON_FILE}</Body>
          </Card>
        ) : (
          <ErrorNotice />
        )}
      </div>
    </PhoneFrame>
  );
}
