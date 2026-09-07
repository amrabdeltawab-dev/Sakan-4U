import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type AppRole = "student" | "owner" | "admin" | "super_admin";
export type SakenoProfile = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  appRole: AppRole;
  role: "user" | "admin";
  marketplaceRole: "student" | "owner";
};

export type SupabaseRuntimeEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_BOOTSTRAP_SUPER_ADMIN_EMAIL?: string;
  RESEND_API_KEY?: string;
};

export type SupabaseClients = {
  url: string;
  publishableKey: string;
  admin: SupabaseClient;
  public: SupabaseClient;
};

let activeClients: SupabaseClients | undefined;

/**
 * Creates the server clients only when a request context supplies its runtime
 * bindings. This function is intentionally never called during module import.
 */
export function createSupabaseClients(env: SupabaseRuntimeEnv): SupabaseClients {
  if (!env) throw new Error("Supabase env bindings are missing in context");
  const url = env.VITE_SUPABASE_URL?.trim();
  const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) throw new Error("Supabase env bindings are missing in context");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceRoleKey) throw new Error("Supabase runtime configuration is missing");

  const globalFetch = (...args: Parameters<typeof fetch>) => fetch(...args);

  return {
    url,
    publishableKey,
    admin: createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: globalFetch } }),
    public: createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false }, global: { fetch: globalFetch } }),
  };
}

/** Sets the request’s clients for legacy database helpers that use the shared facade. */
export function setSupabaseRuntime(clients: SupabaseClients) {
  activeClients = clients;
  return clients;
}

function runtimeClients(): SupabaseClients {
  if (!activeClients) throw new Error("Supabase runtime must be configured by the request context");
  return activeClients;
}

// Lazy facades preserve the established db helper API. They do not create a
// client or read environment variables until a request has entered the context.
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    return Reflect.get(runtimeClients().admin, property, receiver);
  },
});

export const supabasePublic = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    return Reflect.get(runtimeClients().public, property, receiver);
  },
});

export function supabaseForAccessToken(accessToken: string, clients?: SupabaseClients) {
  const runtime = clients ?? runtimeClients();
  return createClient(runtime.url, runtime.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      fetch: (...args) => fetch(...args),
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  });
}

export async function attemptOneTimeSuperAdminBootstrap(
  profile: Pick<SakenoProfile, "id" | "email">,
  bootstrapEmail: string | undefined,
  invokeBootstrap: (userId: string) => Promise<boolean>,
) {
  if (!bootstrapEmail || profile.email.toLowerCase() !== bootstrapEmail.trim().toLowerCase()) return false;
  return invokeBootstrap(profile.id);
}

export async function resolveAuthenticatedProfile(accessToken: string, clients?: SupabaseClients, env?: SupabaseRuntimeEnv): Promise<SakenoProfile | null> {
  const runtime = clients ?? runtimeClients();
  const { data: userData, error: userError } = await runtime.admin.auth.getUser(accessToken);
  const email = userData.user?.email;
  if (userError || !userData.user || !email) return null;
  const user = userData.user;
  const bootstrapEmail = env?.SUPABASE_BOOTSTRAP_SUPER_ADMIN_EMAIL;
  await attemptOneTimeSuperAdminBootstrap({ id: user.id, email }, bootstrapEmail, async userId => {
    const { data, error } = await runtime.admin.rpc("bootstrap_super_admin_once", { target_user_id: userId });
    if (error) throw error;
    return data === true;
  }).catch(error => console.error("[Supabase] One-time Super Admin bootstrap failed:", error));
  const { data, error } = await runtime.admin.from("profiles").select("id, full_name, email, phone, role").eq("id", user.id).maybeSingle();
  if (error || !data) return null;
  const appRole = data.role as AppRole;
  return {
    id: data.id,
    name: data.full_name,
    email: data.email,
    phone: data.phone,
    appRole,
    role: appRole === "admin" || appRole === "super_admin" ? "admin" : "user",
    marketplaceRole: appRole === "owner" ? "owner" : "student",
  };
}
