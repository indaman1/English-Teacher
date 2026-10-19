import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { isSupabaseConfigured } from '@/lib/env';
import { ensureProfile, fetchProfile, updateProfile, type ProfileUpdate } from '@/services/supabase/profile';
import { amIAdmin } from '@/services/supabase/admin';
import type { Profile } from '@/types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  /** true until the first session check and profile load have finished */
  loading: boolean;
  configured: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  saveProfile: (patch: ProfileUpdate) => Promise<Profile>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  const loadProfile = useCallback(async (user: User | null) => {
    if (!user) {
      setProfile(null);
      setIsAdmin(false);
      return;
    }
    try {
      const name = (user.user_metadata?.display_name as string | undefined) ?? '';
      const [p, admin] = await Promise.all([ensureProfile(user.id, user.email, name), amIAdmin(user.id)]);
      setProfile(p);
      setIsAdmin(admin);
    } catch {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      await loadProfile(data.session?.user ?? null);
      if (active) setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') {
        setProfile(null);
        setIsAdmin(false);
        return;
      }
      // Defer to avoid calling Supabase inside the auth callback (prevents deadlocks).
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => void loadProfile(next?.user ?? null), 0);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setIsAdmin(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) return;
    const p = await fetchProfile(session.user.id);
    if (p) setProfile(p);
  }, [session]);

  const saveProfile = useCallback(
    async (patch: ProfileUpdate) => {
      if (!session?.user) throw new Error('Not signed in.');
      const p = await updateProfile(session.user.id, patch);
      setProfile(p);
      return p;
    },
    [session],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      isAdmin,
      loading,
      configured: isSupabaseConfigured,
      signOut,
      refreshProfile,
      saveProfile,
    }),
    [session, profile, isAdmin, loading, signOut, refreshProfile, saveProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
