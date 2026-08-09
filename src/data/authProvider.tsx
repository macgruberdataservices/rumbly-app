// Mirrors activityProvider.tsx's shape: one Supabase auth subscription at
// the root, exposed via context so any screen can read session state or
// call sign-in/up/out without touching the client directly.

import React, { createContext, useCallback, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  initializing: boolean;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  updateEmail: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setInitializing(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const updateEmail = useCallback(async (email: string) => {
    const { error } = await supabase.auth.updateUser({ email });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  // Apple App Store Guideline 5.1.1(v): an app that supports account
  // creation must let the user initiate account deletion from within the
  // app. Deleting the auth user has to happen server-side (it needs the
  // service-role key, which never ships in the client), so this just calls
  // the delete-account Edge Function, which verifies the caller's own JWT
  // and deletes exactly that account -- see supabase/functions/delete-account.
  // On success, sign out locally too so the client's session state matches
  // the now-deleted server-side account immediately rather than waiting on
  // its next failed refresh.
  const deleteAccount = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke<{ error?: string }>('delete-account');
    if (error) {
      return { error: error.message };
    }
    if (data?.error) {
      return { error: data.error };
    }
    await supabase.auth.signOut();
    return { error: null };
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        initializing,
        signUp,
        signIn,
        updateEmail,
        updatePassword,
        signOut,
        deleteAccount,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
