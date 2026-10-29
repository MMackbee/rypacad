import React, { lazy } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
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
export const loadAssessmentWave = () => import('./screens/AssessmentWave');
const AssessmentWave = lazy(loadAssessmentWave);
export const loadAssessmentResults = () => import('./screens/AssessmentResults');
const AssessmentResults = lazy(loadAssessmentResults);
export const loadAssessmentGolf = () => import('./screens/AssessmentGolf');
const AssessmentGolf = lazy(loadAssessmentGolf);
export const loadAssessmentSettings = () => import('./screens/AssessmentSettings');
const AssessmentSettings = lazy(loadAssessmentSettings);

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

/** /portal/assessments/wave/:waveId - navigation state `station` reopens one station (a McGill block run later). */
export function AssessmentWaveRoute() {
  const { waveId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  return <AssessmentWave bare waveId={waveId} initialStation={state?.station ?? null} onBack={() => navigate('/portal/assessments')} />;
}

/**
 * /portal/assessments/athlete/:athleteId - every coach, ops and owner
 * (reader level). Navigation state `name` is the athlete's name from the
 * list or athlete detail, shown when the record itself is not readable.
 * "Run McGill block" reopens the window's wave on its McGill station.
 */
export function AssessmentResultsRoute() {
  const { athleteId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { viewer } = useViewer();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return (
    <AssessmentResults
      bare
      athleteId={athleteId}
      viewer={viewer}
      fallbackName={state?.name ?? null}
      onBack={() => (canGoBack ? navigate(-1) : navigate('/portal'))}
      onRunMcgill={(waveId) => navigate(`/portal/assessments/wave/${waveId}`, { state: { station: 'mcgill' } })}
    />
  );
}

/** /portal/assessments/golf/:athleteId - every coach, from the session roster; navigation state `name` is the roster's name for the athlete. */
export function AssessmentGolfRoute() {
  const { athleteId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const canGoBack = (window.history.state?.idx ?? 0) > 0;
  return <AssessmentGolf bare athleteId={athleteId} fallbackName={state?.name ?? null} onBack={() => (canGoBack ? navigate(-1) : navigate('/portal'))} />;
}

/** /portal/assessments/settings - assessment staff read; the screen lets only Phil and the owner edit (spec 4.6). */
export function AssessmentSettingsRoute() {
  const { viewer } = useViewer();
  const navigate = useNavigate();
  return <AssessmentSettings bare viewer={viewer} onBack={() => navigate('/portal/assessments')} />;
}
