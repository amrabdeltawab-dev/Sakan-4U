import { runtimeEnv } from "./runtime-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFile, writeFile } from "node:fs/promises";

const origin = runtimeEnv.SAKENO_VALIDATION_ORIGIN;
const url = runtimeEnv.VITE_SUPABASE_URL;
const serviceKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!origin || !url || !serviceKey) throw new Error("Required validation configuration is unavailable");
const validation = JSON.parse(await readFile("/home/ubuntu/audit_work/auth_link_validation.json", "utf8"));
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const recovery = await admin.auth.admin.generateLink({ type: "recovery", email: validation.email, options: { redirectTo: `${origin}/reset-password` } });
if (recovery.error || !recovery.data?.properties?.action_link) throw recovery.error ?? new Error("Unable to create confirmed recovery validation link");
await writeFile("/home/ubuntu/audit_work/auth_link_validation.json", JSON.stringify({ ...validation, recoveryLink: recovery.data.properties.action_link }));
console.log(JSON.stringify({ created: true }));
