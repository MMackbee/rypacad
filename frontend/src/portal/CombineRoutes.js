import React, { lazy } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';
import { SEED_COMBINE_ATHLETE_ID } from './data/combine';

/*
 * The Combine route wrapper (docs/portal/plans/2026-11-11-parallax-combine
 * spec 4), kept out of the grandfathered PortalRoutes.js, which imports it
 * and adds one <Route> per path (the AssessmentRoutes.js pattern). The
 * screen is its own chunk; the loader is exported for the warm-up.
 */
export const loadCombine = () => import('./screens/Combine');
const Combine = lazy(loadCombine);

/**
 * /portal/combine (an athlete login: their own athlete) and
 * /portal/combine/:athleteId (parents and staff). Navigation state `name`
 * is the caller's name for the athlete, shown when the record cannot be
 * read. With no athlete (an athlete login with none on file) the index
 * lands the account on its own home.
 *
 * Back: opened from inside the app (the attendance row, a card) it goes
 * back one entry, to the same session block; from a deep link (the
 * location's key is 'default') to a fixed place: the athlete home, a
 * parent's athlete page, else the portal index.
 */
export function CombineRoute() {
  const { athleteId: param } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const live = isLive();
  const { user, loading } = useAuthSession(live ? undefined : { variant: 'idle' });
  if (live && loading) return null;
  const athleteId = param ?? (live ? user?.athleteId ?? null : SEED_COMBINE_ATHLETE_ID);
  if (!athleteId) return <Navigate to="/portal" replace />;
  const fixedBack = !param ? '/portal/home' : live && user?.role === 'parent' ? `/portal/athlete/${athleteId}` : '/portal';
  const onBack = () => (location.key !== 'default' ? navigate(-1) : navigate(fixedBack));
  return <Combine bare athleteId={athleteId} fallbackName={location.state?.name ?? null} onBack={onBack} />;
}
