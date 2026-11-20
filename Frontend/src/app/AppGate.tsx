import { useEffect } from 'react';
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom';
import { isApiError } from '../lib/api';
import { useDevBypass } from '../lib/devBypass';
import { useMe } from '../lib/queries';
import { FullPageLoader, Door } from '../components/ui';
import { useAuthStore } from '../store/authStore';

export const ONBOARDING_PATH = '/onboarding';
const LOGIN_PATH = '/login';
const PATIENT_PATH = '/patient';
const CAREGIVER_PATH = '/caregiver';
const HEALTH_WORKER_PATH = '/healthworker';

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

const HOME_PATH = (role: string) => {
  switch (role) {
    case 'PATIENT':
      return PATIENT_PATH;
    case 'CAREGIVER':
      return CAREGIVER_PATH;
    case 'HEALTH_WORKER':
      return HEALTH_WORKER_PATH;
    default:
      return LOGIN_PATH;
  }
};

/**
 * Loads /api/me and routes on what the server says — the Hawkr pattern, adapted for OHARA's three roles.
 *  - Signed out → /login.
 *  - Signed in, onboarding incomplete → /onboarding.
 *  - PATIENT → /patient/* (full-screen, voice-first).
 *  - CAREGIVER → /caregiver/* (dashboard shell).
 *  - HEALTH_WORKER → /healthworker/* (dashboard shell).
 */
export const AppGate = () => {
  const location = useLocation();
  const demo = useDevBypass();
  const real = useMe(!demo);
  const me = demo ? { data: demo, isError: false as const, isPending: false as const, error: null } : real;
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    if (me.data) setAuth(me.data, useAuthStore.getState().token ?? '');
  }, [me.data, setAuth]);

  if (me.isPending) return <FullPageLoader />;

  if (me.isError) {
    const err = me.error;
    if (isApiError(err) && err.code === 'UNAUTHENTICATED') {
      const next = location.pathname + location.search;
      const query = next === '/' ? '' : `?next=${encodeURIComponent(next)}`;
      return <Navigate to={`${LOGIN_PATH}${query}`} replace />;
    }
    return (
      <Door>
        <h1>We couldn't load your account</h1>
        <p className="text-ohara-muted">{err?.message}</p>
        <a href="/login" className="btn-primary no-underline">Back to sign in</a>
      </Door>
    );
  }

  const { pathname } = location;
  const onPatient = isUnder(pathname, PATIENT_PATH);
  const onCaregiver = isUnder(pathname, CAREGIVER_PATH);
  const onHealthWorker = isUnder(pathname, HEALTH_WORKER_PATH);
  const onOnboarding = pathname === ONBOARDING_PATH;

  if (!me.data.onboardingCompleted && !onOnboarding) {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }
  if (me.data.onboardingCompleted && onOnboarding) {
    return <Navigate to={HOME_PATH(me.data.role)} replace />;
  }

  switch (me.data.role) {
    case 'PATIENT':
      if (!onPatient) return <Navigate to={PATIENT_PATH} replace />;
      return <Outlet context={me.data} />;
    case 'CAREGIVER':
      if (!onCaregiver) return <Navigate to={CAREGIVER_PATH} replace />;
      return <Outlet context={me.data} />;
    case 'HEALTH_WORKER':
      if (!onHealthWorker) return <Navigate to={HEALTH_WORKER_PATH} replace />;
      return <Outlet context={me.data} />;
    case 'ADMIN':
      return <Outlet context={me.data} />;
    default:
      return <Navigate to={LOGIN_PATH} replace />;
  }
};

/** The /api/me payload for pages rendered inside AppGate. */
export const useGateMe = () => useOutletContext<import('../types').MeResponse>();