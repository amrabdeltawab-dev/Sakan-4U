import { runtimeEnv } from "./runtime-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

const url = runtimeEnv.VITE_SUPABASE_URL;
const serviceRoleKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error("Supabase test environment is unavailable");

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const password = "TempMedia!2026";
const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const create = async (label, role) => {
  const email = `sakeno-browser-${label}-${suffix}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `SAKENO browser ${label}` } });
  if (error || !data.user) throw error ?? new Error("Could not create browser test user");
  const { error: roleError } = await admin.from("profiles").update({ role }).eq("id", data.user.id);
  if (roleError) throw roleError;
  return { id: data.user.id, email };
};
const fixture = { password, owner: await create("owner", "owner"), admin: await create("admin", "admin") };
writeFileSync("/tmp/sakeno-property-media-browser-fixture.json", JSON.stringify(fixture));
console.log("created");
