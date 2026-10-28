import React, { lazy } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import useAuthSession from './hooks/useAuthSession';
import { isLive } from './hooks/live';
import { SEED_VIEWER, assessmentAccess } from './data/assessmentAccess';

/*
 * The assessment routes' wrappers (spec 5), kept out of the grandfathered
 * PortalRoutes.js, which imports them and adds one <Route> per screen. Each
 * screen is its own chunk; the loaders are exported for the warm-up.
 */
export const loadAssessmentList = () => import('./screens/AssessmentList');
const AssessmentList = lazy(loadAssessmentList);

/** The signed-in user; in seed mode (the review scaffold), Phil. */
export function useViewer() {
  const live = isLive();
  const session = useAuthSession(live ? undefined : { variant: 'idle' });
  return { viewer: live ? session.user : SEED_VIEWER, loading: live && session.loading };
}

/**
 * The assessment guard, inside RequireRole (spec 3): 'staff' admits the
 * owner, ops, Phil and assessor staff; 'reader' every coach as well. Anyone
 * else goes to their own landing. Seed mode passes everyone, like
 * RequireRole. firestore.rules is the boundary; this is navigation.
 */
export function RequireAssessment({ level, landingFor, children }) {
  const { viewer, loading } = useViewer();
  if (!isLive()) return children;
  if (loading) return null;
  const access = assessmentAccess(viewer);
  const ok = level === 'reader' ? access != null : access === 'staff';
  return ok ? children : <Navigate to={landingFor(viewer)} replace />;
}

/** /portal/assessments - owners and ops arrive from Admin and go back there; Phil and assessors use the tab. */
export function AssessmentListRoute() {
  const { viewer } = useViewer();
  const navigate = useNavigate();
  const fromAdmin = viewer?.role === 'ops' || viewer?.role === 'owner';
  return (
    <AssessmentList
      bare
      viewer={viewer}
      onOpenWave={(waveId) => navigate(`/portal/assessments/wave/${waveId}`)}
      onOpenAthlete={(athleteId, name) => navigate(`/portal/assessments/athlete/${athleteId}`, { state: { name } })}
      onOpenSettings={() => navigate('/portal/assessments/settings')}
      onBack={fromAdmin ? () => navigate('/portal/admin') : undefined}
    />
  );
}
