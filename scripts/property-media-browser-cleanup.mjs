import { runtimeEnv } from "./runtime-env.mjs";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, unlinkSync } from "node:fs";

const path = "/tmp/sakeno-property-media-browser-fixture.json";
if (!existsSync(path)) process.exit(0);
const fixture = JSON.parse(readFileSync(path, "utf8"));
const admin = createClient(runtimeEnv.VITE_SUPABASE_URL, runtimeEnv.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const ownerIds = [fixture.owner.id, fixture.admin.id];
const { data: properties, error: propertiesError } = await admin.from("properties").select("id").in("owner_id", ownerIds);
if (propertiesError) throw propertiesError;
const propertyIds = (properties ?? []).map(property => property.id);
if (propertyIds.length) {
  const { data: media, error: mediaError } = await admin.from("property_media").select("storage_bucket, storage_path, public_storage_bucket, public_storage_path").in("property_id", propertyIds);
  if (mediaError) throw mediaError;
  const grouped = new Map();
  for (const item of media ?? []) {
    grouped.set(item.storage_bucket, [...(grouped.get(item.storage_bucket) ?? []), item.storage_path]);
    if (item.public_storage_bucket && item.public_storage_path) grouped.set(item.public_storage_bucket, [...(grouped.get(item.public_storage_bucket) ?? []), item.public_storage_path]);
  }
  for (const [bucket, paths] of grouped) {
    const { error } = await admin.storage.from(bucket).remove(paths);
    if (error) throw error;
  }
  const { error: deletePropertiesError } = await admin.from("properties").delete().in("id", propertyIds);
  if (deletePropertiesError) throw deletePropertiesError;
}
for (const user of [fixture.owner, fixture.admin]) await admin.auth.admin.deleteUser(user.id);
unlinkSync(path);
console.log("cleaned");
