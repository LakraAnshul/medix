/**
 * Authentication state for the whole app.
 *
 * SCOPE — this component answers "who is this user?" and nothing more. It also
 * caches the user's role for *navigation* purposes. That cached role is a UI
 * convenience and is never a security control: every read and write is
 * re-authorised by Row Level Security against the verified JWT. Tampering with
 * the value in memory changes what buttons appear and nothing else.
 *
 * Handled failure modes:
 *   - no session (anonymous)
 *   - expired access token        -> supabase-js refreshes automatically
 *   - invalid/absent refresh token -> TOKEN_REFRESHED fails, we sign out locally
 *   - the auth user was deleted or disabled -> profile fetch returns no row, we
 *     sign out rather than leaving a half-authenticated shell
 *   - network failure during the profile fetch -> surfaced, session preserved
 *   - a profile row that was never created -> one bounded self-heal attempt
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {Session, User} from '@supabase/supabase-js';
import {supabase, isSupabaseConfigured} from '../lib/supabase';
import {toSafeError, type SafeError} from '../lib/errors';
import type {AppRole, ProfileRow} from '../lib/database.types';

/** Roles a client may request at signup. `admin` is intentionally not here. */
export type SignupRole = 'patient' | 'doctor';

export interface SignUpInput {
  email: string;
  password: string;
  fullName: string;
  role: SignupRole;
  phone?: string;
  /** Only used when role === 'doctor'. */
  specialization?: string;
  qualification?: string;
  registrationNumber?: string;
}

interface AuthContextValue {
  /** undefined while the initial session is being restored. */
  session: Session | null | undefined;
  user: User | null;
  profile: ProfileRow | null;
  role: AppRole | null;
  /** True until the first session restoration settles. */
  initialising: boolean;
  /** True while a sign-in/sign-up/sign-out request is in flight. */
  busy: boolean;
  error: SafeError | null;
  signIn: (email: string, password: string) => Promise<{ok: boolean; error?: SafeError}>;
  signUp: (input: SignUpInput) => Promise<{ok: boolean; needsEmailConfirmation: boolean; error?: SafeError}>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({children}: {children: React.ReactNode}) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [initialising, setInitialising] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<SafeError | null>(null);

  const mounted = useRef(true);
  /** Guards the self-heal path so a persistent failure cannot loop. */
  const healAttempted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadProfile = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      if (mounted.current) setProfile(null);
      return;
    }

    const {data, error: fetchError} = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .maybeSingle();

    if (!mounted.current) return;

    if (fetchError) {
      const safe = toSafeError(fetchError);
      // A dead session should not leave the user in a half-signed-in state.
      if (safe.code === 'session_expired' || safe.code === 'user_missing') {
        await supabase.auth.signOut({scope: 'local'}).catch(() => {});
        if (mounted.current) {
          setSession(null);
          setProfile(null);
          setError(safe);
        }
        return;
      }
      setError(safe);
      return;
    }

    if (data) {
      setProfile(data as ProfileRow);
      return;
    }

    // No row. Either handle_new_user() has not committed yet, or the auth user
    // was deleted underneath us. Try exactly one self-heal, which the RLS policy
    // constrains to id = auth.uid() AND role = 'patient'.
    if (healAttempted.current) {
      setProfile(null);
      return;
    }
    healAttempted.current = true;

    const fallbackName =
      (activeSession.user.user_metadata?.full_name as string | undefined)?.trim() ||
      activeSession.user.email?.split('@')[0] ||
      'New User';

    const {error: insertError} = await supabase.from('profiles').insert({
      id: activeSession.user.id,
      full_name: fallbackName.slice(0, 120),
    });

    if (!mounted.current) return;

    if (insertError) {
      setError(toSafeError(insertError));
      setProfile(null);
      return;
    }

    const {data: healed} = await supabase
      .from('profiles')
      .select('*')
      .eq('id', activeSession.user.id)
      .maybeSingle();
    if (mounted.current) setProfile((healed as ProfileRow) ?? null);
  }, []);

  // Restore any persisted session, then track changes.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setSession(null);
      setInitialising(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const {data, error: sessionError} = await supabase.auth.getSession();
        if (cancelled) return;
        if (sessionError) setError(toSafeError(sessionError));
        setSession(data.session ?? null);
        await loadProfile(data.session ?? null);
      } catch (caught) {
        if (!cancelled) {
          setError(toSafeError(caught));
          setSession(null);
        }
      } finally {
        if (!cancelled && mounted.current) setInitialising(false);
      }
    })();

    const {data: subscription} = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (cancelled) return;

      setSession(nextSession ?? null);

      if (event === 'SIGNED_OUT' || !nextSession) {
        setProfile(null);
        healAttempted.current = false;
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        void loadProfile(nextSession);
      }
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    setBusy(true);
    setError(null);
    try {
      const {data, error: signInError} = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signInError) {
        const safe = toSafeError(signInError);
        setError(safe);
        return {ok: false, error: safe};
      }
      healAttempted.current = false;
      setSession(data.session);
      await loadProfile(data.session);
      return {ok: true};
    } catch (caught) {
      const safe = toSafeError(caught);
      setError(safe);
      return {ok: false, error: safe};
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [loadProfile]);

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (input) => {
      setBusy(true);
      setError(null);
      try {
        /**
         * Everything in `data` is client-controlled and is treated as a hint.
         * handle_new_user() maps `role` through an allowlist, so sending
         * role:'admin' here would still produce a patient. It is sent at all only
         * so a genuine doctor signup creates the right profile shape.
         */
        const {data, error: signUpError} = await supabase.auth.signUp({
          email: input.email.trim().toLowerCase(),
          password: input.password,
          options: {
            data: {
              full_name: input.fullName.trim().slice(0, 120),
              role: input.role,
              ...(input.phone ? {phone: input.phone.trim()} : {}),
              ...(input.role === 'doctor'
                ? {
                    specialization: (input.specialization ?? '').trim().slice(0, 120),
                    qualification: (input.qualification ?? '').trim().slice(0, 200),
                    registration_number: (input.registrationNumber ?? '').trim().slice(0, 64),
                  }
                : {}),
            },
            emailRedirectTo: `${window.location.origin}/login`,
          },
        });

        if (signUpError) {
          const safe = toSafeError(signUpError);
          setError(safe);
          return {ok: false, needsEmailConfirmation: false, error: safe};
        }

        // No session returned => the project requires email confirmation.
        const needsEmailConfirmation = !data.session;
        if (data.session) {
          healAttempted.current = false;
          setSession(data.session);
          await loadProfile(data.session);
        }
        return {ok: true, needsEmailConfirmation};
      } catch (caught) {
        const safe = toSafeError(caught);
        setError(safe);
        return {ok: false, needsEmailConfirmation: false, error: safe};
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [loadProfile],
  );

  const signOut = useCallback(async () => {
    setBusy(true);
    try {
      // Revoke server-side where possible, but always clear local state: if the
      // network call fails we must not leave tokens sitting in storage.
      const {error: signOutError} = await supabase.auth.signOut();
      if (signOutError) await supabase.auth.signOut({scope: 'local'}).catch(() => {});
    } catch {
      await supabase.auth.signOut({scope: 'local'}).catch(() => {});
    } finally {
      if (mounted.current) {
        setSession(null);
        setProfile(null);
        setError(null);
        setBusy(false);
      }
      healAttempted.current = false;
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const {data} = await supabase.auth.getSession();
    await loadProfile(data.session ?? null);
  }, [loadProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      role: profile?.role ?? null,
      initialising,
      busy,
      error,
      signIn,
      signUp,
      signOut,
      refreshProfile,
      clearError: () => setError(null),
    }),
    [session, profile, initialising, busy, error, signIn, signUp, signOut, refreshProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>.');
  return ctx;
}
