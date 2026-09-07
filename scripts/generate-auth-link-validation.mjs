import { runtimeEnv } from "./runtime-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { writeFile } from "node:fs/promises";

const origin = runtimeEnv.SAKENO_VALIDATION_ORIGIN;
const url = runtimeEnv.VITE_SUPABASE_URL;
const serviceKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!origin || !url || !serviceKey) throw new Error("Required validation configuration is unavailable");

const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const email = `sakeno-link-validation-${suffix}@gmail.com`;
const password = "SakenoLinkValidation!2026";
const signup = await admin.auth.admin.generateLink({ type: "signup", email, password, options: { redirectTo: `${origin}/login` } });
if (signup.error || !signup.data?.properties?.action_link || !signup.data.user?.id) throw signup.error ?? new Error("Unable to create confirmation validation link");
const recovery = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: `${origin}/reset-password` } });
if (recovery.error || !recovery.data?.properties?.action_link) throw recovery.error ?? new Error("Unable to create recovery validation link");
await writeFile("/home/ubuntu/audit_work/auth_link_validation.json", JSON.stringify({ email, userId: signup.data.user.id, confirmationLink: signup.data.properties.action_link, recoveryLink: recovery.data.properties.action_link }));
console.log(JSON.stringify({ created: true, emailDomain: email.split("@")[1] }));
