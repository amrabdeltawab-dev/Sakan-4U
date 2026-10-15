import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { toast } from "@/lib/appToast";
import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";

const SESSION_EXPIRED_TOAST = "انتهت جلستك — سجّل دخول مجددًا";

export type SakenoUser = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  appRole: "student" | "owner" | "admin" | "super_admin";
  role: "user" | "admin";
  marketplaceRole: "student" | "owner";
};

type AuthState = {
  user: SakenoUser | null;
  session: Session | null;
  loading: boolean;
  error: Error | null;
  isAuthenticated: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function SupabaseAuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const me = trpc.auth.me.useQuery(undefined, { enabled: Boolean(session), retry: false, refetchOnWindowFocus: false });
  const sessionClearedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setSessionLoading(false);
    }).catch(() => {
      if (mounted) setSessionLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) utils.auth.me.setData(undefined, null);
      else void utils.auth.me.invalidate();
      setSessionLoading(false);
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, [utils]);

  useEffect(() => {
    if (sessionClearedRef.current || !me.error || !session) return;
    const httpStatus = (me.error as { data?: { httpStatus?: number } }).data?.httpStatus;
    if (httpStatus !== 401 && httpStatus !== 403) return;
    sessionClearedRef.current = true;
    void supabase.auth.signOut();
    setSession(null);
    utils.auth.me.setData(undefined, null);
    toast.error(SESSION_EXPIRED_TOAST);
    navigate("/login");
  }, [me.error, session, utils, navigate]);

  const refresh = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    setSession(data.session);
    if (data.session) await me.refetch();
  }, [me]);

  const logout = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
    utils.auth.me.setData(undefined, null);
    await utils.auth.me.invalidate();
  }, [utils]);

  const value = useMemo<AuthState>(() => ({
    user: me.data ?? null,
    session,
    loading: sessionLoading || (Boolean(session) && me.isLoading),
    error: (me.error as Error | null) ?? null,
    isAuthenticated: Boolean(session && me.data),
    refresh,
    logout,
  }), [me.data, me.error, me.isLoading, session, sessionLoading, refresh, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useSupabaseAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useSupabaseAuth must be used inside SupabaseAuthProvider");
  return context;
}
