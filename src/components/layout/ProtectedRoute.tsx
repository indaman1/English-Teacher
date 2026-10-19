import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LoadingState } from '@/components/ui/States';
import { ConfigMissing } from './ConfigMissing';

interface ProtectedRouteProps {
  /** When true (default) users who have not finished onboarding are sent to /onboarding. */
  requireOnboarding?: boolean;
  requireAdmin?: boolean;
}

/**
 * Client-side route guard for good UX. Real security is enforced by Row Level Security and the
 * Edge Functions; a user who bypasses this component still cannot read or write anyone's data.
 */
export function ProtectedRoute({ requireOnboarding = true, requireAdmin = false }: ProtectedRouteProps) {
  const { user, profile, loading, isAdmin, configured } = useAuth();
  const location = useLocation();

  if (!configured) return <ConfigMissing />;
  if (loading) return <LoadingState label="Loading your account…" />;
  if (!user) return <Navigate to="/auth/login" replace state={{ from: location.pathname }} />;
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;
  if (requireOnboarding && profile && !profile.onboarding_completed) return <Navigate to="/onboarding" replace />;

  return <Outlet />;
}

/** Keeps signed-in users away from login/register screens. */
export function PublicOnlyRoute() {
  const { user, loading, configured } = useAuth();
  if (!configured) return <ConfigMissing />;
  if (loading) return <LoadingState />;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
