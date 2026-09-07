import { runtimeEnv } from "./runtime-env.mjs";
import { createClient } from "@supabase/supabase-js";

const origin = runtimeEnv.SAKENO_VALIDATION_ORIGIN;
const url = runtimeEnv.VITE_SUPABASE_URL;
const key = runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY;
const serviceKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!origin || !url || !key || !serviceKey) throw new Error("Required validation configuration is unavailable");

const publicClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
const adminClient = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `sakeno-redirect-validation-${token}@gmail.com`;
let userId;

try {
  const signup = await publicClient.auth.signUp({ email, password: "SakenoValidation!2026", options: { data: { full_name: "Redirect Validation" }, emailRedirectTo: `${origin}/login` } });
  userId = signup.data.user?.id;
  const reset = await publicClient.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
  const isRateLimit = (error) => Boolean(error?.message?.toLowerCase().includes("rate limit"));
  const invalidRedirect = (error) => Boolean(error?.message?.toLowerCase().includes("redirect"));
  const result = { origin, confirmationRedirectAccepted: !invalidRedirect(signup.error), resetRedirectAccepted: !invalidRedirect(reset.error), confirmationEmailAcceptedOrRateLimited: !signup.error || isRateLimit(signup.error), resetEmailAcceptedOrRateLimited: !reset.error || isRateLimit(reset.error), unexpectedErrors: [signup.error?.message, reset.error?.message].filter(Boolean).filter(message => !message.toLowerCase().includes("rate limit")) };
  console.log(JSON.stringify(result));
  if (!result.confirmationRedirectAccepted || !result.resetRedirectAccepted || result.unexpectedErrors.length) process.exitCode = 1;
} finally {
  if (userId) await adminClient.auth.admin.deleteUser(userId);
}
