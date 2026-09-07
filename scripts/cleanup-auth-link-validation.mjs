import { runtimeEnv } from "./runtime-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFile, unlink } from "node:fs/promises";

const serviceKey = runtimeEnv.SUPABASE_SERVICE_ROLE_KEY;
const url = runtimeEnv.VITE_SUPABASE_URL;
if (!serviceKey || !url) throw new Error("Required validation configuration is unavailable");
const validation = JSON.parse(await readFile("/home/ubuntu/audit_work/auth_link_validation.json", "utf8"));
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const { error } = await admin.auth.admin.deleteUser(validation.userId);
if (error) throw error;
await unlink("/home/ubuntu/audit_work/auth_link_validation.json");
console.log(JSON.stringify({ cleaned: true }));
