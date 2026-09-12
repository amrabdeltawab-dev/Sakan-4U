import { supabaseAdmin, supabasePublic, type AppRole } from "./supabase";
import { assertProcessablePropertyImage } from "./watermark";
import { createWatermarkDerivativeViaService } from "./watermark-service/client";

// Compatibility exports retained only while unused legacy integration shims remain in the source tree.
// The active Express context no longer calls these functions.
export async function upsertUser(_user: unknown): Promise<void> { return; }
export async function getUserByOpenId(_openId: string): Promise<any | undefined> { return undefined; }

type Filters = { query?: string; area?: string; propertyType?: string; rentType?: "full" | "bed"; genderSuitability?: string; minPrice?: number; maxPrice?: number; minBedrooms?: number; amenities?: string[] };
type GenderPreference = "male" | "female" | "anyone";
type PropertyInput = { title: string; propertyType: string; governorate: string; city: string; area: string; street?: string; approximateLocation?: string; latitude?: number; longitude?: number; exactLat: number; exactLng: number; description: string; monthlyPrice: number; bedrooms: number; bathrooms: number; capacity: number; rentType: "full" | "bed"; totalBeds?: number | null; genderPreference?: GenderPreference; genderSuitability?: string; furnished: boolean; amenities: string[]; availabilityStatus?: string; distanceToCampus?: string; utilitiesIncluded?: string[]; videoUrl?: string | null };
type PropertyPhotoInput = { name: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string; description?: string; tag?: string };
type VerificationDocumentKind = "national_id" | "ownership_evidence";
type PropertyVerificationDocumentInput = { name: string; mimeType: "application/pdf" | "image/jpeg" | "image/png"; dataBase64: string; kind: VerificationDocumentKind };

export const MIN_PROPERTY_PHOTO_COUNT = 3;
export const MAX_PROPERTY_PHOTO_COUNT = 12;
export const MAX_PROPERTY_PHOTO_BYTES = 5 * 1024 * 1024;
export const MIN_PROPERTY_DESCRIPTION_LENGTH = 20;
export const PROPERTY_DESCRIPTION_VALIDATION_MESSAGE = "وصف العقار مطلوب ويجب أن يحتوي على 20 حرفاً واضحاً على الأقل بعد تجاهل المسافات.";
export const MAX_OWNER_VERIFICATION_DOCUMENT_BYTES = 5 * 1024 * 1024;

const fieldMap: Record<string, string> = { propertyType: "property_type", rentType: "rent_type", totalBeds: "total_beds", monthlyPrice: "monthly_price", genderPreference: "gender_preference", genderSuitability: "gender_suitability", approximateLocation: "approximate_location", availabilityStatus: "availability_status", verificationStatus: "verification_status", ownerIdentityVerified: "owner_identity_verified", propertyVideoVerified: "property_video_verified", locationVerified: "location_verified", availabilityVerified: "availability_verified", reviewReason: "review_reason", ownerId: "owner_id", createdAt: "created_at", updatedAt: "updated_at", distanceToCampus: "distance_to_campus", utilitiesIncluded: "utilities_included", videoUrl: "video_url" };

function camelize<T>(value: T): T {
  if (Array.isArray(value)) return value.map(camelize) as T;
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()), camelize(item)])) as T;
}

export function normalizePropertyDescription(description: string) {
  const normalized = description.trim();
  if (normalized.length < MIN_PROPERTY_DESCRIPTION_LENGTH) throw new Error(PROPERTY_DESCRIPTION_VALIDATION_MESSAGE);
  return normalized;
}

export function validateRentConfiguration(input: Pick<PropertyInput, "rentType" | "totalBeds" | "capacity"> & { genderPreference?: GenderPreference }) {
  if (input.rentType === "bed") {
    if (input.genderPreference !== "male" && input.genderPreference !== "female") throw new Error("اختر شباب أو طالبات لتأجير العقار بالسرير؛ لا يمكن اختيار مناسب للجميع.");
    if (!Number.isInteger(input.totalBeds) || !input.totalBeds || input.totalBeds > input.capacity) throw new Error("أدخل عدد الأسرة المتاحة، ويجب ألا يزيد عن سعة العقار.");
    return;
  }
  if (input.totalBeds !== null && input.totalBeds !== undefined) throw new Error("عدد الأسرة المتاحة يخص التأجير بالسرير فقط.");
}

function propertyPayload(input: Partial<PropertyInput>) {
  const normalizedInput = input.description === undefined ? input : { ...input, description: normalizePropertyDescription(input.description) };
  const payload = Object.fromEntries(Object.entries(normalizedInput).filter(([, value]) => value !== undefined).map(([key, value]) => [fieldMap[key] ?? key, value]));
  const effectiveGender = normalizedInput.genderPreference ?? (normalizedInput.genderSuitability === "male" || normalizedInput.genderSuitability === "female" ? normalizedInput.genderSuitability : "anyone");
  if (normalizedInput.rentType !== undefined || normalizedInput.genderPreference !== undefined) payload.gender_preference = effectiveGender;
  if (normalizedInput.genderPreference !== undefined) payload.gender_suitability = normalizedInput.genderPreference === "anyone" ? "mixed" : normalizedInput.genderPreference;
  return payload;
}

function fail(error: { message: string } | null) { if (error) throw new Error(error.message); }

export async function getOwnProfile(client: any, userId: string) {
  const { data, error } = await client.from("profiles").select("id, full_name, email, phone, role, updated_at").eq("id", userId).single();
  fail(error);
  return camelize(data);
}

export async function updateOwnProfile(client: any, userId: string, input: { fullName: string; phone: string | null }) {
  const { data, error } = await client.from("profiles")
    .update({ full_name: input.fullName.trim(), phone: input.phone?.trim() || null })
    .eq("id", userId)
    .select("id, full_name, email, phone, role, updated_at")
    .single();
  fail(error);
  return camelize(data);
}

export async function getStaffDashboardStats(client: any) {
  const count = async (table: string, apply: (query: any) => any = query => query) => {
    const { count: total, error } = await apply(client.from(table).select("id", { count: "exact", head: true }));
    fail(error);
    return total ?? 0;
  };
  const [totalStudents, totalOwners, pendingProperties, approvedProperties] = await Promise.all([
    count("profiles", query => query.eq("role", "student")),
    count("profiles", query => query.eq("role", "owner")),
    count("properties", query => query.is("deleted_at", null).eq("verification_status", "pending")),
    count("properties", query => query.is("deleted_at", null).eq("verification_status", "verified")),
  ]);
  return { totalStudents, totalOwners, pendingProperties, approvedProperties, refreshedAt: new Date().toISOString() };
}

const PROPERTY_MEDIA_TAGS = ["غرفة نوم", "مطبخ", "حمام", "صالة", "بلكونة", "مدخل", "واجهة", "أخرى"] as const;

function normalizeMediaMetadata(input: { description?: string; tag?: string }) {
  const description = input.description?.trim();
  const tag = input.tag?.trim();
  if (description && (description.length < 1 || description.length > 160)) throw new Error("وصف الصورة يجب ألا يتجاوز 160 حرفاً.");
  if (tag && (tag.length < 1 || tag.length > 48)) throw new Error("وسم الصورة يجب ألا يتجاوز 48 حرفاً.");
  return { description: description || null, tag: tag || null };
}

function withPublicMediaUrls(rows: any[]) {
  return rows.map(row => ({
    ...row,
    media: (row.media ?? [])
      .filter((media: any) => media.media_type === "image" && media.is_public && media.public_storage_bucket === "property-images" && media.public_storage_path && media.watermark_status === "watermarked")
      .sort((left: any, right: any) => left.sort_order - right.sort_order)
      .map((media: any) => ({
        isPrimary: media.is_primary,
        sortOrder: media.sort_order,
        description: media.description ?? null,
        tag: media.tag ?? null,
        url: supabaseAdmin.storage.from("property-images").getPublicUrl(media.public_storage_path).data.publicUrl,
      })),
  }));
}

async function withManagedMediaUrls(rows: any[], includeVerificationDocuments = true) {
  return Promise.all(rows.map(async row => ({
    ...row,
    media: await Promise.all([...(row.media ?? [])]
      .filter((media: any) => includeVerificationDocuments || media.media_type !== "verification_document")
      .sort((left: any, right: any) => (left.sort_order ?? 0) - (right.sort_order ?? 0)).map(async (media: any) => {
        const { data, error } = await supabaseAdmin.storage.from(media.storage_bucket).createSignedUrl(media.storage_path, 5 * 60);
        const publicUrl = media.public_storage_bucket === "property-images" && media.public_storage_path
          ? supabaseAdmin.storage.from("property-images").getPublicUrl(media.public_storage_path).data.publicUrl
          : undefined;
        return error || !data?.signedUrl ? { ...media, url: undefined, publicUrl } : { ...media, url: data.signedUrl, publicUrl };
      })),
  })));
}

function stableLocationOffset(propertyId: string, axis: "latitude" | "longitude") {
  let hash = axis === "latitude" ? 2166136261 : 1469598103;
  for (const character of propertyId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const normalized = (hash >>> 0) / 0xffffffff;
  const sign = normalized < 0.5 ? -1 : 1;
  return sign * (0.006 + ((normalized * 997) % 1) * 0.006);
}

const BENI_SUEF_APPROXIMATE_CENTER = { latitude: 29.0661, longitude: 31.0994 };

/**
 * Generates a non-reversible, property-specific approximate point from the
 * submitted public area/city and the record UUID. It intentionally does not
 * consume a browser-supplied exact coordinate or street address.
 */
export function derivePropertyApproximateCoordinates(input: Pick<PropertyInput, "area" | "city" | "governorate">, propertyId: string) {
  const seed = `${input.area.trim().toLowerCase()}|${input.city.trim().toLowerCase()}|${input.governorate.trim().toLowerCase()}|${propertyId}`;
  return {
    latitude: Number((BENI_SUEF_APPROXIMATE_CENTER.latitude + stableLocationOffset(`${seed}:private`, "latitude")).toFixed(7)),
    longitude: Number((BENI_SUEF_APPROXIMATE_CENTER.longitude + stableLocationOffset(`${seed}:private`, "longitude")).toFixed(7)),
  };
}

function toPublicProperty(row: any) {
  const storedPublicLatitude = Number(row.public_lat);
  const storedPublicLongitude = Number(row.public_lng);
  const { latitude: _legacyLatitude, longitude: _legacyLongitude, exact_lat: _exactLatitude, exact_lng: _exactLongitude, street: _street, owner_id: _ownerId, ownerId: _ownerIdCamel, pending_edits: _pendingEdits, pendingEdits: _pendingEditsCamel, has_pending_updates: _hasPendingUpdates, hasPendingUpdates: _hasPendingUpdatesCamel, views_count: _viewsCount, viewsCount: _viewsCountCamel, ...safeRow } = row;
  const fallback = derivePropertyApproximateCoordinates({ area: row.area ?? "بني سويف", city: row.city ?? "بني سويف", governorate: row.governorate ?? "بني سويف" }, String(row.id));
  const publicLatitude = Number.isFinite(storedPublicLatitude) ? storedPublicLatitude : fallback.latitude;
  const publicLongitude = Number.isFinite(storedPublicLongitude) ? storedPublicLongitude : fallback.longitude;
  return { ...safeRow, approximate_location: row.approximate_location ?? row.area, public_lat: publicLatitude, public_lng: publicLongitude };
}

function isPubliclyAvailableProperty(row: any) {
  return row.rent_type !== "bed" || Number(row.available_beds) > 0;
}

function hasAllowedImageSignature(bytes: Buffer, mimeType: PropertyPhotoInput["mimeType"]) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
}

function hasAllowedVerificationDocumentSignature(bytes: Buffer, mimeType: PropertyVerificationDocumentInput["mimeType"]) {
  if (mimeType === "application/pdf") return bytes.length >= 5 && bytes.subarray(0, 5).toString("ascii") === "%PDF-";
  return hasAllowedImageSignature(bytes, mimeType);
}

function validateOwnerVerificationDocument(document: PropertyVerificationDocumentInput) {
  if (!document.name.trim() || document.name.length > 255) throw new Error("اسم مستند إثبات الملكية غير صالح.");
  const bytes = Buffer.from(document.dataBase64, "base64");
  if (!bytes.length || bytes.length > MAX_OWNER_VERIFICATION_DOCUMENT_BYTES) throw new Error("يجب ألا يتجاوز مستند إثبات الملكية 5 ميجابايت.");
  if (!hasAllowedVerificationDocumentSignature(bytes, document.mimeType)) throw new Error("ارفع ملف PDF أو صورة JPEG أو PNG حقيقية لمستند إثبات الملكية.");
  return { ...document, bytes };
}

async function validatePropertySubmissionPhotos(photos: PropertyPhotoInput[]) {
  if (photos.length < MIN_PROPERTY_PHOTO_COUNT) throw new Error(`أضف ${MIN_PROPERTY_PHOTO_COUNT} صوراً واضحة للعقار على الأقل قبل الإرسال للمراجعة.`);
  if (photos.length > MAX_PROPERTY_PHOTO_COUNT) throw new Error(`الحد الأقصى لصور العقار هو ${MAX_PROPERTY_PHOTO_COUNT} صورة.`);
  return Promise.all(photos.map(async photo => {
    if (!photo.name.trim() || photo.name.length > 255) throw new Error("اسم إحدى الصور غير صالح.");
    const bytes = Buffer.from(photo.dataBase64, "base64");
    if (!bytes.length || bytes.length > MAX_PROPERTY_PHOTO_BYTES) throw new Error("يجب أن تكون كل صورة صالحة وبحجم لا يتجاوز 5 ميجابايت.");
    if (!hasAllowedImageSignature(bytes, photo.mimeType)) throw new Error("تدعم Sakan 4U صور JPEG وPNG وWebP الحقيقية فقط.");
    try { assertProcessablePropertyImage(bytes); } catch { throw new Error("تعذر قراءة إحدى الصور المختارة. اختر ملف صورة حقيقياً غير تالف ثم أعد المحاولة."); }
    return { ...photo, ...normalizeMediaMetadata(photo), bytes };
  }));
}

type WatermarkableMedia = {
  id: string; property_id: string; storage_bucket: "property-images" | "property-media-staging"; storage_path: string;
  original_name: string; mime_type: string; public_storage_bucket: "property-images" | null; public_storage_path: string | null; watermark_status: string;
};

async function makeLegacySourcePrivate(item: WatermarkableMedia) {
  if (item.storage_bucket !== "property-images") return item;
  const { data: legacyFile, error: legacyError } = await supabaseAdmin.storage.from("property-images").download(item.storage_path);
  fail(legacyError);
  if (!legacyFile) throw new Error("تعذر نقل الصورة القديمة إلى المصدر الخاص.");
  const privatePath = `legacy/${item.property_id}/${crypto.randomUUID()}-${item.original_name.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const { error: privateUploadError } = await supabaseAdmin.storage.from("property-media-staging").upload(privatePath, legacyFile, { contentType: item.mime_type, upsert: false });
  fail(privateUploadError);
  const { error: sourceUpdateError } = await supabaseAdmin.from("property_media").update({
    storage_bucket: "property-media-staging",
    storage_path: privatePath,
    is_public: false,
    public_storage_bucket: null,
    public_storage_path: null,
    public_mime_type: null,
    watermark_status: "processing",
  }).eq("id", item.id);
  if (sourceUpdateError) {
    await supabaseAdmin.storage.from("property-media-staging").remove([privatePath]);
    fail(sourceUpdateError);
  }
  const { error: legacyRemovalError } = await supabaseAdmin.storage.from("property-images").remove([item.storage_path]);
  if (legacyRemovalError) {
    await supabaseAdmin.from("property_media").update({ watermark_status: "failed", watermark_error: "تعذر سحب الأصل العام القديم" }).eq("id", item.id);
    throw new Error("تعذر سحب الأصل العام القديم قبل المعالجة.");
  }
  return { ...item, storage_bucket: "property-media-staging" as const, storage_path: privatePath, public_storage_bucket: null, public_storage_path: null };
}

async function publishApprovedPropertyImages(propertyId: string) {
  const { data, error } = await supabaseAdmin
    .from("property_media")
    .select("id, property_id, storage_bucket, storage_path, original_name, mime_type, public_storage_bucket, public_storage_path, watermark_status")
    .eq("property_id", propertyId).eq("media_type", "image").order("sort_order", { ascending: true });
  fail(error);
  const published: string[] = [];
  try {
    for (const rawItem of (data ?? []) as WatermarkableMedia[]) {
      if (rawItem.watermark_status === "watermarked" && rawItem.public_storage_path) continue;
      const item = await makeLegacySourcePrivate(rawItem);
      const { error: processingError } = await supabaseAdmin.from("property_media").update({ watermark_status: "processing", watermark_error: null }).eq("id", item.id);
      fail(processingError);
      try {
        const { data: sourceFile, error: sourceError } = await supabaseAdmin.storage.from(item.storage_bucket).download(item.storage_path);
        fail(sourceError);
        if (!sourceFile) throw new Error("تعذر قراءة المصدر الخاص للصورة.");
        const derivative = await createWatermarkDerivativeViaService(new Uint8Array(await sourceFile.arrayBuffer()));
        const derivativePath = `watermarked/${propertyId}/${item.id}.webp`;
        const { error: uploadError } = await supabaseAdmin.storage.from("property-images").upload(derivativePath, derivative, { contentType: "image/webp", upsert: true });
        fail(uploadError);
        const { error: updateError } = await supabaseAdmin.from("property_media").update({
          storage_bucket: item.storage_bucket,
          storage_path: item.storage_path,
          public_storage_bucket: "property-images",
          public_storage_path: derivativePath,
          public_mime_type: "image/webp",
          is_public: true,
          watermark_status: "watermarked",
          watermark_error: null,
          watermark_processed_at: new Date().toISOString(),
        }).eq("id", item.id);
        fail(updateError);
        published.push(derivativePath);
      } catch (imageError) {
        console.error("[Property watermark] Derivative processing failed", { propertyId, mediaId: item.id, reason: imageError instanceof Error ? imageError.message : "unknown_processing_failure" });
        await supabaseAdmin.from("property_media").update({ watermark_status: "failed", watermark_error: imageError instanceof Error ? imageError.message.slice(0, 500) : "unknown_processing_failure", is_public: false }).eq("id", item.id);
        throw new Error("تعذّر إنشاء النسخة العامة الموسومة. بقيت الصورة الأصلية محفوظة ولم يُنشر الإعلان.");
      }
    }
  } catch (error) {
    if (published.length) await supabaseAdmin.storage.from("property-images").remove(published);
    await supabaseAdmin.from("property_media").update({
      is_public: false,
      public_storage_bucket: null,
      public_storage_path: null,
      public_mime_type: null,
      watermark_status: "not_requested",
      watermark_processed_at: null,
    }).eq("property_id", propertyId).eq("media_type", "image").eq("watermark_status", "watermarked");
    throw error;
  }
}

async function withdrawPublishedPropertyImages(propertyId: string) {
  const { data: media, error } = await supabaseAdmin.from("property_media")
    .select("id, public_storage_bucket, public_storage_path").eq("property_id", propertyId).eq("media_type", "image");
  fail(error);
  const publicPaths = (media ?? []).map((item: any) => item.public_storage_bucket === "property-images" ? item.public_storage_path : null).filter(Boolean) as string[];
  if (publicPaths.length) await removeStorageObjectsIdempotently("property-images", publicPaths);
  const { error: updateError } = await supabaseAdmin.from("property_media").update({
    is_public: false,
    public_storage_bucket: null,
    public_storage_path: null,
    public_mime_type: null,
    watermark_status: "not_requested",
    watermark_error: null,
    watermark_processed_at: null,
  }).eq("property_id", propertyId).eq("media_type", "image");
  fail(updateError);
}

type StoredMedia = { storage_bucket: "property-images" | "property-media-staging" | "verification-documents" | "verification_documents"; storage_path: string };

async function removeStorageObjectsIdempotently(bucket: StoredMedia["storage_bucket"], paths: string[]) {
  for (let index = 0; index < paths.length; index += 100) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove(paths.slice(index, index + 100));
    if (error) throw new Error(`تعذر حذف ملفات العقار المخزنة بأمان: ${error.message}`);
  }
}

export async function cleanupPropertyStorage(propertyId: string) {
  const { data, error } = await supabaseAdmin.from("property_media").select("storage_bucket, storage_path, public_storage_bucket, public_storage_path").eq("property_id", propertyId);
  fail(error);
  const grouped = new Map<StoredMedia["storage_bucket"], string[]>();
  for (const media of (data ?? []) as Array<StoredMedia & { public_storage_bucket?: StoredMedia["storage_bucket"] | null; public_storage_path?: string | null }>) {
    const paths = grouped.get(media.storage_bucket) ?? [];
    paths.push(media.storage_path);
    grouped.set(media.storage_bucket, paths);
    if (media.public_storage_bucket === "property-images" && media.public_storage_path) {
      const derivativePaths = grouped.get("property-images") ?? [];
      derivativePaths.push(media.public_storage_path);
      grouped.set("property-images", derivativePaths);
    }
  }
  for (const [bucket, paths] of Array.from(grouped.entries())) await removeStorageObjectsIdempotently(bucket, paths);
  return { removedObjects: Array.from(grouped.values()).reduce((total, paths) => total + paths.length, 0) };
}

async function cleanupCapturedPropertyStorage(mediaObjects: Array<{ storageBucket?: StoredMedia["storage_bucket"]; storagePath?: string; publicStorageBucket?: StoredMedia["storage_bucket"] | null; publicStoragePath?: string | null }>) {
  const grouped = new Map<StoredMedia["storage_bucket"], string[]>();
  for (const media of mediaObjects) {
    if (media.storageBucket && media.storagePath) {
      const paths = grouped.get(media.storageBucket) ?? [];
      paths.push(media.storagePath); grouped.set(media.storageBucket, paths);
    }
    if (media.publicStorageBucket === "property-images" && media.publicStoragePath) {
      const paths = grouped.get("property-images") ?? [];
      paths.push(media.publicStoragePath); grouped.set("property-images", paths);
    }
  }
  for (const [bucket, paths] of Array.from(grouped.entries())) await removeStorageObjectsIdempotently(bucket, Array.from(new Set(paths)));
  return { removedObjects: Array.from(grouped.values()).reduce((total, paths) => total + new Set(paths).size, 0) };
}

export async function listPublicProperties(filters: Filters) {
  let query = supabaseAdmin.from("properties").select("*, media:property_media(*)").is("deleted_at", null).eq("verification_status", "verified").in("availability_status", ["available", "reserved"]).order("created_at", { ascending: false });
  if (filters.area) query = query.eq("area", filters.area);
  if (filters.propertyType) query = query.eq("property_type", filters.propertyType);
  if (filters.rentType) query = query.eq("rent_type", filters.rentType);
  if (filters.genderSuitability) query = query.eq("gender_suitability", filters.genderSuitability);
  if (filters.minPrice !== undefined) query = query.gte("monthly_price", filters.minPrice);
  if (filters.maxPrice !== undefined) query = query.lte("monthly_price", filters.maxPrice);
  if (filters.minBedrooms !== undefined) query = query.gte("bedrooms", filters.minBedrooms);
  if (filters.query) query = query.or(`title.ilike.%${filters.query}%,area.ilike.%${filters.query}%`);
  const { data, error } = await query;
  fail(error);
  const filtered = (data ?? []).filter(item => isPubliclyAvailableProperty(item) && (!filters.amenities?.length || filters.amenities.every(amenity => (item.amenities ?? []).includes(amenity))));
  return camelize(withPublicMediaUrls(filtered.map(toPublicProperty)));
}

export async function getPublicProperty(id: string) {
  const { data, error } = await supabaseAdmin.from("properties").select("*, media:property_media(*)").eq("id", id).is("deleted_at", null).eq("verification_status", "verified").in("availability_status", ["available", "reserved"]).maybeSingle();
  fail(error);
  return camelize(data && isPubliclyAvailableProperty(data) ? withPublicMediaUrls([toPublicProperty(data)])[0] : null);
}

export async function trackPublicPropertyView(propertyId: string, visitorSessionId: string) {
  const { data, error } = await supabaseAdmin.rpc("record_property_view", { target_property_id: propertyId, p_visitor_session_id: visitorSessionId });
  fail(error);
  return { recorded: data === true };
}

export async function getTotalPropertyViews(client: any) {
  const { data, error } = await client.rpc("get_total_property_views");
  fail(error);
  return { totalPropertyViews: Number(data ?? 0) };
}

export async function listSimilarPublicProperties(id: string) {
  const { data: current, error: currentError } = await supabaseAdmin.from("properties")
    .select("id, area, monthly_price").eq("id", id).is("deleted_at", null)
    .eq("verification_status", "verified").in("availability_status", ["available", "reserved"]).maybeSingle();
  fail(currentError);
  if (!current) return [];
  const candidates = () => supabaseAdmin.from("properties").select("*, media:property_media(*)")
    .neq("id", current.id).is("deleted_at", null).eq("verification_status", "verified")
    .in("availability_status", ["available", "reserved"]).order("created_at", { ascending: false });
  const { data: sameArea, error: sameAreaError } = await candidates().eq("area", current.area).limit(3);
  fail(sameAreaError);
  const chosen = [...(sameArea ?? [])].filter(isPubliclyAvailableProperty);
  if (chosen.length < 3) {
    const { data: similarPrice, error: similarPriceError } = await candidates()
      .gte("monthly_price", Math.max(1, Math.floor(Number(current.monthly_price) * 0.7)))
      .lte("monthly_price", Math.ceil(Number(current.monthly_price) * 1.3)).limit(6);
    fail(similarPriceError);
    const seen = new Set(chosen.map(property => property.id));
    for (const property of similarPrice ?? []) if (isPubliclyAvailableProperty(property) && !seen.has(property.id) && chosen.length < 3) { chosen.push(property); seen.add(property.id); }
  }
  return camelize(withPublicMediaUrls(chosen.slice(0, 3).map(toPublicProperty)));
}

export async function listStudentFavoritePropertyIds(client: any) {
  const { data, error } = await client.from("property_favorites").select("property_id").order("created_at", { ascending: false });
  fail(error);
  return (data ?? []).map((favorite: { property_id: string }) => favorite.property_id);
}

export async function listStudentFavoriteProperties(client: any) {
  const propertyIds: string[] = await listStudentFavoritePropertyIds(client);
  if (!propertyIds.length) return [];
  const { data, error } = await supabaseAdmin
    .from("properties")
    .select("*, media:property_media(*)")
    .in("id", propertyIds)
    .is("deleted_at", null)
    .eq("verification_status", "verified")
    .in("availability_status", ["available", "reserved"]);
  fail(error);
  const byId = new Map((data ?? []).map(property => [property.id, property]));
  const orderedPublicProperties = propertyIds.flatMap(propertyId => {
    const property = byId.get(propertyId);
    return property && isPubliclyAvailableProperty(property) ? [property] : [];
  });
  return camelize(withPublicMediaUrls(orderedPublicProperties.map(toPublicProperty)));
}

export async function setStudentPropertyFavorite(client: any, userId: string, propertyId: string, saved: boolean) {
  if (saved) {
    const { error } = await client.from("property_favorites").insert({ user_id: userId, property_id: propertyId });
    if (error && (error as { code?: string }).code !== "23505") fail(error);
  } else {
    const { error } = await client.from("property_favorites").delete().eq("user_id", userId).eq("property_id", propertyId);
    fail(error);
  }
  return { propertyId, saved };
}

export async function listOwnerProperties(client: any) {
  const { data: visibleProperties, error: visibleError } = await client.from("properties").select("id").order("updated_at", { ascending: false });
  fail(visibleError);
  const ids = (visibleProperties ?? []).map((property: any) => property.id);
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from("properties").select("*, media:property_media(*)").in("id", ids).order("updated_at", { ascending: false });
  fail(error); return camelize(await withManagedMediaUrls(data ?? [], false));
}

export async function createProperty(client: any, ownerId: string, input: PropertyInput, verificationStatus: "draft" | "pending" = "pending") {
  const id = crypto.randomUUID();
  const effectiveGenderPreference = input.genderPreference ?? (input.genderSuitability === "male" || input.genderSuitability === "female" ? input.genderSuitability : "anyone");
  validateRentConfiguration({ ...input, genderPreference: effectiveGenderPreference });
  const { latitude: _ignoredLatitude, longitude: _ignoredLongitude, exactLat, exactLng, ...propertyInput } = { ...input, genderPreference: effectiveGenderPreference };
  const { data, error } = await client.from("properties").insert({ ...propertyPayload(propertyInput), id, exact_lat: exactLat, exact_lng: exactLng, owner_id: ownerId, verification_status: verificationStatus }).select("id").single();
  fail(error); return camelize(data);
}

export async function createOwnerPropertyDraft(client: any, ownerId: string, input: PropertyInput) {
  return createProperty(client, ownerId, input, "draft");
}

export async function submitOwnerPropertyForReview(client: any, propertyId: string) {
  const { data, error } = await client.rpc("owner_submit_property_for_review", { target_property_id: propertyId });
  fail(error); return camelize(data);
}

export async function submitPropertyWithPhotos(client: any, ownerId: string, input: PropertyInput, photos: PropertyPhotoInput[], nationalIdDocument: PropertyVerificationDocumentInput, ownershipEvidence?: PropertyVerificationDocumentInput) {
  const validatedPhotos = await validatePropertySubmissionPhotos(photos);
  if (nationalIdDocument.kind !== "national_id") throw new Error("صورة البطاقة الشخصية مطلوبة قبل إرسال العقار للمراجعة.");
  const validatedNationalIdDocument = validateOwnerVerificationDocument(nationalIdDocument);
  const validatedOwnershipEvidence = ownershipEvidence ? validateOwnerVerificationDocument(ownershipEvidence) : null;
  const property = await createProperty(client, ownerId, input, "draft");
  try {
    for (let index = 0; index < validatedPhotos.length; index += 1) {
      const photo = validatedPhotos[index]!;
      try {
        await uploadMedia(client, ownerId, {
          propertyId: property.id,
          name: photo.name,
          mimeType: photo.mimeType,
          dataBase64: photo.dataBase64,
          mediaType: "image",
          isPrimary: index === 0,
          sortOrder: index,
          description: photo.description ?? undefined,
          tag: photo.tag ?? undefined,
          actorRole: "owner",
        });
      } catch (photoError) {
        throw new Error(`فشل رفع الصورة «${photo.name}»: ${photoError instanceof Error ? photoError.message : "خطأ غير معروف"}`);
      }
    }
    await uploadMedia(client, ownerId, { propertyId: property.id, name: validatedNationalIdDocument.name, mimeType: validatedNationalIdDocument.mimeType, dataBase64: validatedNationalIdDocument.dataBase64, mediaType: "verification_document", verificationDocumentKind: "national_id", isPrimary: false, actorRole: "owner" });
    if (validatedOwnershipEvidence) await uploadMedia(client, ownerId, { propertyId: property.id, name: validatedOwnershipEvidence.name, mimeType: validatedOwnershipEvidence.mimeType, dataBase64: validatedOwnershipEvidence.dataBase64, mediaType: "verification_document", verificationDocumentKind: "ownership_evidence", isPrimary: false, actorRole: "owner" });
    const submitted = await submitOwnerPropertyForReview(client, property.id);
    return { ...property, verificationStatus: submitted.verificationStatus, submittedPhotoCount: validatedPhotos.length, submittedNationalIdDocument: true, submittedOwnershipEvidence: Boolean(validatedOwnershipEvidence) };
  } catch (error) {
    try {
      await cleanupPropertyStorage(property.id);
      const { error: archiveError } = await supabaseAdmin.from("properties").update({ deleted_at: new Date().toISOString(), availability_status: "hidden" }).eq("id", property.id).eq("owner_id", ownerId);
      fail(archiveError);
    } catch (cleanupError) {
      console.error("[Property submission] Failed to clean partial submission:", cleanupError);
    }
    throw new Error(error instanceof Error ? `تعذر رفع صور العقار؛ لم يتم إرسال الإعلان للمراجعة. ${error.message}` : "تعذر رفع صور العقار؛ لم يتم إرسال الإعلان للمراجعة.");
  }
}

export async function updateOwnerProperty(client: any, ownerId: string, id: string, input: Partial<PropertyInput>) {
  const { data: ownedProperty, error: ownershipError } = await client.from("properties").select("id, verification_status, rent_type, total_beds, capacity, gender_preference, gender_suitability").eq("id", id).eq("owner_id", ownerId).is("deleted_at", null).maybeSingle();
  fail(ownershipError);
  if (!ownedProperty) throw new Error("العقار غير موجود أو لا تملك صلاحية تعديله.");
  const nextRentType = input.rentType ?? ownedProperty.rent_type;
  const nextGenderPreference = input.genderPreference ?? (ownedProperty.gender_preference ?? (ownedProperty.gender_suitability === "mixed" ? "anyone" : ownedProperty.gender_suitability));
  validateRentConfiguration({ rentType: nextRentType, totalBeds: input.totalBeds === undefined ? ownedProperty.total_beds : input.totalBeds, capacity: input.capacity ?? ownedProperty.capacity, genderPreference: nextGenderPreference });
  const { availabilityStatus: _availabilityStatus, latitude: _ignoredLatitude, longitude: _ignoredLongitude, exactLat: _ignoredExactLat, exactLng: _ignoredExactLng, ...materialChanges } = input;
  if (ownedProperty.verification_status === "verified") {
    const { data, error } = await client.rpc("owner_stage_property_edits", { target_property_id: id, proposed_edits: propertyPayload(materialChanges) });
    fail(error);
    return camelize(data);
  }
  const nextStatus = ownedProperty.verification_status === "draft" ? "draft" : "pending";
  const { data, error } = await client.from("properties").update({ ...propertyPayload(materialChanges), verification_status: nextStatus, review_reason: nextStatus === "pending" ? null : undefined }).eq("id", id).select("id").single();
  fail(error);
  return camelize(data);
}

export async function updateOwnerExactLocation(client: any, ownerId: string, propertyId: string, exactLat: number, exactLng: number) {
  const { data: ownedProperty, error: ownershipError } = await client.from("properties").select("id, verification_status").eq("id", propertyId).eq("owner_id", ownerId).is("deleted_at", null).maybeSingle();
  fail(ownershipError); if (!ownedProperty) throw new Error("العقار غير موجود أو لا تملك صلاحية تعديل موقعه.");
  if (ownedProperty.verification_status === "verified") {
    const { data, error } = await client.rpc("owner_stage_property_edits", { target_property_id: propertyId, proposed_edits: { exact_lat: exactLat, exact_lng: exactLng } });
    fail(error);
    return camelize(data);
  }
  const { data, error } = await client.from("properties").update({ exact_lat: exactLat, exact_lng: exactLng }).eq("id", propertyId).eq("owner_id", ownerId).select("id").single();
  fail(error); return camelize(data);
}

export async function updateStaffExactLocation(client: any, propertyId: string, exactLat: number, exactLng: number) {
  const { data, error } = await client.from("properties").update({ exact_lat: exactLat, exact_lng: exactLng }).eq("id", propertyId).is("deleted_at", null).select("id").single();
  fail(error); return camelize(data);
}

export async function updateStaffPropertyDescription(client: any, propertyId: string, description: string) {
  const { data, error } = await client.from("properties").update({ description: normalizePropertyDescription(description) }).eq("id", propertyId).is("deleted_at", null).select("id, description").single();
  fail(error); return camelize(data);
}

export async function getOwnerPropertyDeletionEligibility(client: any, propertyId: string) {
  const { data, error } = await client.rpc("owner_property_deletion_eligibility", { target_property_id: propertyId });
  fail(error); return camelize(data);
}

export async function deleteOwnerProperty(client: any, ownerId: string, propertyId: string) {
  const { data: property, error: lookupError } = await client.from("properties").select("id").eq("id", propertyId).eq("owner_id", ownerId).is("deleted_at", null).maybeSingle();
  fail(lookupError);
  if (!property) throw new Error("العقار غير موجود أو لا تملك صلاحية حذفه.");
  const { data, error } = await client.rpc("owner_delete_property_safely", { target_property_id: property.id });
  fail(error);
  await withdrawPublishedPropertyImages(property.id);
  return camelize(data) as { propertyId: string; archived: boolean; deletedAt: string };
}

export async function setOwnerPropertyAvailability(client: any, propertyId: string, availabilityStatus: "available" | "reserved" | "rented" | "hidden") {
  const { data, error } = await client.rpc("owner_set_property_availability", { target_property_id: propertyId, target_availability: availabilityStatus });
  fail(error); return camelize(data);
}

export async function getSuperAdminPropertyDeletionEligibility(client: any, propertyId: string) {
  const { data, error } = await client.rpc("super_admin_property_deletion_eligibility", { target_property_id: propertyId });
  fail(error); return camelize(data);
}

export async function deleteSuperAdminProperty(client: any, propertyId: string) {
  const { data, error } = await client.rpc("super_admin_delete_property_safely", { target_property_id: propertyId });
  fail(error);
  await withdrawPublishedPropertyImages(propertyId);
  return camelize(data) as { propertyId: string; archived: boolean; deletedAt: string };
}

export async function listPropertyLifecycleAudit(client: any, propertyId: string) {
  const { data, error } = await client.from("property_lifecycle_audit").select("id, action, from_verification_status, to_verification_status, from_availability_status, to_availability_status, media_id, details, created_at").eq("property_id", propertyId).order("created_at", { ascending: false }).limit(40);
  fail(error); return camelize(data ?? []);
}

export async function deleteOwnerProfileWithStorageCleanup(actorRole: AppRole, actorId: string, targetId: string) {
  if (actorRole !== "super_admin") throw new Error("Only a Super Admin can delete an owner profile");
  return deleteUserWithAudit(actorId, targetId);
}

export async function requestOwnerApplication(client: any, userId: string, input: { phone: string; onboarding: Record<string, unknown> }) {
  const { data, error } = await client.from("owner_applications").upsert({ user_id: userId, phone: input.phone, onboarding_data: input.onboarding, status: "pending" }, { onConflict: "user_id" }).select().single();
  fail(error); return camelize(data);
}

export async function quoteViewingFee(propertyId: string) {
  const { data, error } = await supabasePublic.rpc("quote_viewing_fee", { target_property_id: propertyId });
  fail(error);
  const quote = Array.isArray(data) ? data[0] : data;
  if (!quote) throw new Error("لا تتوفر رسوم معاينة معتمدة لهذا العقار حالياً.");
  return camelize(quote);
}

export type BookingNotificationDetails = {
  property: { id: string; title: string; ownerId: string };
  student: { name: string; email: string | null; phone: string };
  owner: { name: string; email: string | null; phone: string | null };
  requestedViewingAt: string;
};

export async function getBookingNotificationDetails(bookingId: string): Promise<BookingNotificationDetails> {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("bookings")
    .select("id, property_id, student_id, contact_name, phone, requested_viewing_at")
    .eq("id", bookingId)
    .maybeSingle();
  fail(bookingError);
  if (!booking) throw new Error("Booking notification source was not found");

  const [{ data: property, error: propertyError }, { data: student, error: studentError }] = await Promise.all([
    supabaseAdmin.from("properties").select("id, title, owner_id").eq("id", booking.property_id).maybeSingle(),
    supabaseAdmin.from("profiles").select("full_name, email, phone").eq("id", booking.student_id).maybeSingle(),
  ]);
  fail(propertyError);
  fail(studentError);
  if (!property || !student) throw new Error("Booking notification participants were not found");

  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email, phone")
    .eq("id", property.owner_id)
    .maybeSingle();
  fail(ownerError);
  if (!owner) throw new Error("Booking property owner was not found");

  return {
    property: { id: property.id, title: property.title, ownerId: property.owner_id },
    student: { name: student.full_name ?? booking.contact_name, email: student.email ?? null, phone: booking.phone },
    owner: { name: owner.full_name ?? "مالك العقار", email: owner.email ?? null, phone: owner.phone ?? null },
    requestedViewingAt: booking.requested_viewing_at,
  };
}

export async function createBooking(client: any, _studentId: string, input: { propertyId: string; requestedViewingAt: string; name: string; phone: string; peopleCount: number; notes?: string; termsAccepted: boolean }) {
  if (!input.termsAccepted) throw new Error("يجب الموافقة على شروط المعاينة وقواعد التنسيق قبل إرسال الطلب.");
  const { data, error } = await client.rpc("create_viewing_request", {
    target_property_id: input.propertyId,
    target_requested_viewing_at: input.requestedViewingAt,
    target_contact_name: input.name,
    target_phone: input.phone,
    target_people_count: input.peopleCount,
    target_notes: input.notes ?? null,
    target_terms_accepted: input.termsAccepted,
  });
  if (error?.code === "23505") throw new Error("لديك بالفعل طلب معاينة نشط لهذا العقار. تابع حالته من صفحة طلباتك.");
  if (error?.message.includes("not available for viewing")) throw new Error("لا يمكن إرسال طلب معاينة لهذا الإعلان لأنه غير متاح أو لم يكتمل التحقق منه.");
  if (error?.message.includes("own property")) throw new Error("لا يمكنك إرسال طلب معاينة لعقار تملكه.");
  fail(error);
  return camelize(data);
}

async function withSafeBookingProperties(bookings: any[]) {
  const propertyIds = Array.from(new Set(bookings.map(booking => booking.property_id).filter(Boolean)));
  if (!propertyIds.length) return bookings;
  const { data, error } = await supabaseAdmin.from("properties").select("id, title, area, governorate, city, approximate_location, monthly_price, bedrooms, bathrooms, capacity, gender_suitability, furnished, amenities, availability_status, verification_status").in("id", propertyIds);
  fail(error);
  const properties = new Map((data ?? []).map((property: any) => [property.id, property]));
  return bookings.map(booking => ({ ...booking, property: properties.get(booking.property_id) ?? null }));
}

async function listViewingRequests(client: any, rpcName: "list_student_viewing_requests" | "list_owner_viewing_requests" | "list_staff_viewing_requests") {
  const { data, error } = await client.rpc(rpcName);
  fail(error);
  return camelize(data ?? []);
}

export async function listStudentBookings(client: any) { return listViewingRequests(client, "list_student_viewing_requests"); }
export async function listOwnerBookings(client: any) { return listViewingRequests(client, "list_owner_viewing_requests"); }
export async function listStaffBookings(client: any) { return listViewingRequests(client, "list_staff_viewing_requests"); }

export async function listNotifications(client: any) {
  const { data, error } = await client
    .from("notifications")
    .select("id, notification_type, title, message, read_at, created_at, related_property_id, related_booking_id")
    .order("created_at", { ascending: false })
    .limit(40);
  fail(error);
  const { count, error: countError } = await client
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  fail(countError);
  return camelize({ items: data ?? [], unreadCount: count ?? 0 });
}

const defaultNotificationPreferences = {
  booking_updates: true,
  property_updates: true,
  owner_application_updates: true,
  general_account_updates: true,
};

export async function getNotificationPreferences(client: any, userId: string) {
  const { data, error } = await client
    .from("notification_preferences")
    .select("booking_updates, property_updates, owner_application_updates, general_account_updates, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  fail(error);
  if (data) return camelize(data);
  const { data: created, error: createError } = await client
    .from("notification_preferences")
    .insert({ user_id: userId, ...defaultNotificationPreferences })
    .select("booking_updates, property_updates, owner_application_updates, general_account_updates, updated_at")
    .maybeSingle();
  if (!createError) return camelize(created);
  if (createError.code !== "23505") fail(createError);
  const { data: raced, error: racedError } = await client
    .from("notification_preferences")
    .select("booking_updates, property_updates, owner_application_updates, general_account_updates, updated_at")
    .eq("user_id", userId)
    .single();
  fail(racedError); return camelize(raced);
}

export async function updateNotificationPreferences(client: any, userId: string, changes: Partial<typeof defaultNotificationPreferences>) {
  await getNotificationPreferences(client, userId);
  const { data, error } = await client
    .from("notification_preferences")
    .update(changes)
    .eq("user_id", userId)
    .select("booking_updates, property_updates, owner_application_updates, general_account_updates, updated_at")
    .single();
  fail(error); return camelize(data);
}

export async function markNotificationRead(client: any, notificationId: string) {
  const { data, error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .is("read_at", null)
    .select("id")
    .maybeSingle();
  fail(error);
  return { notificationId, changed: Boolean(data) };
}

export async function markAllNotificationsRead(client: any) {
  const { data, error } = await client
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .select("id");
  fail(error);
  return { markedCount: data?.length ?? 0 };
}

export async function transitionBookingStatus(client: any, bookingId: string, status: string) {
  const { data, error } = await client.rpc("transition_booking_status", { target_booking_id: bookingId, target_status: status });
  fail(error);
  return camelize(data);
}

export async function recordViewingFeePayment(client: any, bookingId: string, reference: string) {
  const { data, error } = await client.rpc("record_manual_inspection_payment", { target_booking_id: bookingId, target_reference: reference });
  if (error?.code === "23505") throw new Error("مرجع السداد مستخدم بالفعل ولا يمكن تسجيل عملية دفع مكررة.");
  fail(error);
  return camelize(data);
}

export async function scheduleViewing(client: any, bookingId: string, viewingAt: string) {
  const { data, error } = await client.rpc("schedule_viewing", { target_booking_id: bookingId, target_viewing_at: viewingAt });
  fail(error);
  return camelize(data);
}

export async function completeViewing(client: any, bookingId: string) {
  const { data, error } = await client.rpc("complete_viewing", { target_booking_id: bookingId });
  fail(error);
  return camelize(data);
}

export async function recordStudentViewingDecision(client: any, bookingId: string, decision: "accepted" | "rejected") {
  const { data, error } = await client.rpc("record_student_viewing_decision", { target_booking_id: bookingId, target_decision: decision });
  fail(error);
  return camelize(data);
}

export async function requestViewingReschedule(client: any, bookingId: string, viewingAt: string, reason: string) {
  const { data, error } = await client.rpc("request_viewing_reschedule", { target_booking_id: bookingId, target_requested_viewing_at: viewingAt, target_reason: reason });
  fail(error);
  return camelize(data);
}

export async function confirmViewingReschedule(client: any, requestId: string, viewingAt: string) {
  const { data, error } = await client.rpc("confirm_viewing_reschedule", { target_request_id: requestId, target_confirmed_viewing_at: viewingAt });
  fail(error);
  return camelize(data);
}

export async function staffRescheduleViewing(client: any, bookingId: string, viewingAt: string, reason: string) {
  const { data, error } = await client.rpc("staff_reschedule_viewing", { target_booking_id: bookingId, target_viewing_at: viewingAt, target_reason: reason });
  fail(error);
  return camelize(data);
}

export async function requestViewingCancellation(client: any, bookingId: string, reason: string) {
  const { data, error } = await client.rpc("request_viewing_cancellation", { target_booking_id: bookingId, target_reason: reason });
  fail(error);
  return camelize(data);
}

export async function confirmViewingCancellation(client: any, requestId: string) {
  const { data, error } = await client.rpc("confirm_viewing_cancellation", { target_request_id: requestId });
  fail(error);
  return camelize(data);
}

export async function staffCancelViewing(client: any, bookingId: string, reason: string) {
  const { data, error } = await client.rpc("staff_cancel_viewing", { target_booking_id: bookingId, target_reason: reason });
  fail(error);
  return camelize(data);
}

export async function recordViewingNoShow(client: any, bookingId: string, party: "student" | "owner" | "both", reason: string) {
  const { data, error } = await client.rpc("record_viewing_no_show", { target_booking_id: bookingId, target_party: party, target_reason: reason });
  fail(error);
  return camelize(data);
}

export async function recordManualRefundDecision(client: any, bookingId: string, decision: "approved" | "declined", amount: number | null, reason: string, reference?: string) {
  const { data, error } = await client.rpc("record_manual_refund_decision", { target_booking_id: bookingId, target_decision: decision, target_amount: amount, target_reason: reason, target_reference: reference?.trim() || null });
  fail(error);
  return camelize(data);
}

export async function listReviewQueue(client: any) {
  const { data: visibleProperties, error: visibleError } = await client.from("properties").select("id").is("deleted_at", null).or("verification_status.eq.pending,has_pending_updates.eq.true").order("updated_at", { ascending: false });
  fail(visibleError);
  const ids = (visibleProperties ?? []).map((property: any) => property.id);
  if (!ids.length) return [];
  const { data, error } = await supabaseAdmin.from("properties").select("*, media:property_media(*)").in("id", ids).order("updated_at", { ascending: false });
  fail(error);
  const completeSubmissions = (data ?? []).filter(property => (property.media ?? []).filter((media: any) => media.media_type === "image").length >= MIN_PROPERTY_PHOTO_COUNT);
  return camelize(await withManagedMediaUrls(completeSubmissions));
}

export async function listOwnerApplications(client: any) { const { data, error } = await client.from("owner_applications").select("*, profile:profiles!owner_applications_user_id_fkey(id, full_name, email)").eq("status", "pending").order("created_at", { ascending: true }); fail(error); return camelize(data ?? []); }

export async function reviewOwnerApplication(reviewerId: string, input: { applicationId: string; decision: "approved" | "rejected"; note?: string }) {
  const { data: application, error: readError } = await supabaseAdmin.from("owner_applications").select("id, user_id").eq("id", input.applicationId).eq("status", "pending").maybeSingle();
  fail(readError); if (!application) throw new Error("طلب المالك لم يعد متاحاً للمراجعة.");
  const { error: applicationError } = await supabaseAdmin.from("owner_applications").update({ status: input.decision, review_note: input.note ?? null, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq("id", application.id);
  fail(applicationError);
  if (input.decision === "approved") { const { error: roleError } = await supabaseAdmin.from("profiles").update({ role: "owner" }).eq("id", application.user_id); fail(roleError); }
  return { applicationId: application.id, status: input.decision };
}

export async function reviewProperty(client: any, reviewerId: string, input: { propertyId: string; status: string; reason?: string; ownerIdentityVerified?: boolean; propertyVideoVerified?: boolean; locationVerified?: boolean; availabilityVerified?: boolean; propertyPhotosQualityVerified?: boolean }) {
  const { data: pendingProperty, error: pendingPropertyError } = await client.from("properties").select("id, verification_status, has_pending_updates").eq("id", input.propertyId).is("deleted_at", null).or("verification_status.eq.pending,has_pending_updates.eq.true").maybeSingle();
  fail(pendingPropertyError);
  if (!pendingProperty) throw new Error("العقار غير متاح حالياً لقرار المراجعة.");
  if (pendingProperty.has_pending_updates) {
    const approve = input.status === "verified";
    const { data, error } = await client.rpc("staff_review_staged_property_edits", { target_property_id: input.propertyId, approve, decision_reason: approve ? null : input.reason?.trim() || null });
    fail(error);
    const { error: eventError } = await client.from("property_review_events").insert({ property_id: input.propertyId, reviewer_id: reviewerId, status: input.status, note: approve ? null : input.reason?.trim() || null });
    fail(eventError);
    return camelize(data);
  }
  if (input.status === "verified") {
    if (!input.propertyPhotosQualityVerified) throw new Error("يجب تأكيد أن الصور المرفوعة مناسبة وواضحة للعقار قبل الاعتماد.");
    const { count, error: photoError } = await supabaseAdmin.from("property_media").select("id", { count: "exact", head: true }).eq("property_id", input.propertyId).eq("media_type", "image");
    fail(photoError);
    if ((count ?? 0) < MIN_PROPERTY_PHOTO_COUNT) throw new Error(`لا يمكن اعتماد الإعلان قبل رفع ${MIN_PROPERTY_PHOTO_COUNT} صور عقار على الأقل.`);
  }
  if (input.status === "verified") await publishApprovedPropertyImages(input.propertyId);
  const { data, error } = await client.from("properties").update({ verification_status: input.status, review_reason: input.reason ?? null, owner_identity_verified: input.ownerIdentityVerified ?? false, property_video_verified: input.propertyVideoVerified ?? false, location_verified: input.locationVerified ?? false, availability_verified: input.availabilityVerified ?? false, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }).eq("id", input.propertyId).select("id, verification_status").single();
  fail(error);
  const { error: eventError } = await client.from("property_review_events").insert({ property_id: input.propertyId, reviewer_id: reviewerId, status: input.status, note: input.reason ?? null });
  fail(eventError);
  return camelize(data);
}

export async function manageRole(actorRole: AppRole, actorId: string, targetId: string, nextRole: AppRole) {
  if (actorRole !== "super_admin") throw new Error("Only a Super Admin can manage administrator access");
  if (targetId === actorId) throw new Error("A Super Admin cannot change their own role");
  const { data, error } = await supabaseAdmin.from("profiles").update({ role: nextRole }).eq("id", targetId).select("id, full_name, email, role").single();
  fail(error); return camelize(data);
}

type UserManagementListInput = { offset: number; limit: number; query?: string; role?: AppRole };

function normalizeUserSearch(value?: string) {
  return value?.trim().replace(/[%,()]/g, " ").replace(/\s+/g, " ").slice(0, 80) ?? "";
}

export async function listProfilesForRoleManagement(input: UserManagementListInput) {
  const search = normalizeUserSearch(input.query);
  let profileQuery = supabaseAdmin
    .from("profiles")
    .select("id, full_name, email, role, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(input.offset, input.offset + input.limit - 1);
  if (input.role) profileQuery = profileQuery.eq("role", input.role);
  if (search) profileQuery = profileQuery.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  const { data: profiles, error, count } = await profileQuery;
  fail(error);

  const ids = (profiles ?? []).map(profile => profile.id);
  const { data: applications, error: applicationsError } = ids.length
    ? await supabaseAdmin.from("owner_applications").select("user_id, status").in("user_id", ids)
    : { data: [], error: null };
  fail(applicationsError);
  const ownerStatus = new Map((applications ?? []).map(application => [application.user_id, application.status]));

  const users = await Promise.all((profiles ?? []).map(async profile => {
    const { data, error: authError } = await supabaseAdmin.auth.admin.getUserById(profile.id);
    const authUser = authError ? null : data.user;
    const bannedUntil = authUser?.banned_until ? new Date(authUser.banned_until) : null;
    const accountStatus = !authUser
      ? "unavailable"
      : bannedUntil && bannedUntil.getTime() > Date.now()
        ? "banned"
        : authUser.email_confirmed_at
          ? "active"
          : "pending_verification";
    return camelize({
      ...profile,
      accountStatus,
      ownerApplicationStatus: ownerStatus.get(profile.id) ?? null,
      emailConfirmedAt: authUser?.email_confirmed_at ?? null,
    });
  }));
  const total = count ?? 0;
  return { items: users, total, offset: input.offset, limit: input.limit, nextOffset: input.offset + users.length < total ? input.offset + users.length : null };
}

async function writeUserDeletionAudit(input: { actorId: string; targetId: string; targetRole: AppRole; result: "requested" | "succeeded" | "failed"; details: Record<string, unknown>; auditId?: string }) {
  if (input.auditId) {
    const { error } = await supabaseAdmin.from("super_admin_user_management_audit").update({ result: input.result, details: input.details, completed_at: new Date().toISOString() }).eq("id", input.auditId);
    fail(error);
    return input.auditId;
  }
  const { data, error } = await supabaseAdmin.from("super_admin_user_management_audit").insert({ actor_id: input.actorId, target_user_id: input.targetId, target_role: input.targetRole, action: "delete_user", result: input.result, details: input.details, completed_at: input.result === "requested" ? null : new Date().toISOString() }).select("id").single();
  fail(error);
  if (!data) throw new Error("تعذر إنشاء سجل تدقيق إجراء إدارة المستخدمين.");
  return data.id;
}

export async function deleteUserWithAudit(actorId: string, targetId: string) {
  if (actorId === targetId) throw new Error("لا يمكن للمدير العام حذف حسابه الشخصي.");
  const { data: target, error: targetError } = await supabaseAdmin.from("profiles").select("id, role").eq("id", targetId).maybeSingle();
  fail(targetError);
  if (!target) throw new Error("الحساب المطلوب غير موجود أو تم حذفه بالفعل.");
  const targetRole = target.role as AppRole;
  if (targetRole === "super_admin") throw new Error("حسابات المدير العام هويات إدارية محمية ولا تُحذف من هذا المسار.");

  const { data: ownedProperties, error: propertiesError } = await supabaseAdmin.from("properties").select("id").eq("owner_id", targetId);
  fail(propertiesError);
  const propertyIds = (ownedProperties ?? []).map(property => property.id);
  if (propertyIds.length) {
    await writeUserDeletionAudit({ actorId, targetId, targetRole, result: "failed", details: { reason: "owned_properties_preserved", ownedProperties: propertyIds.length } });
    throw new Error("لا يمكن حذف هذا الحساب لأنه يملك عقارات محفوظة تاريخياً. أرشف العقارات واحتفظ بالحساب المرتبط بها.");
  }
  const { count: studentBookingCount, error: studentBookingsError } = await supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).eq("student_id", targetId);
  fail(studentBookingsError);
  const { count: ownerBookingCount, error: ownerBookingsError } = propertyIds.length
    ? await supabaseAdmin.from("bookings").select("id", { count: "exact", head: true }).in("property_id", propertyIds)
    : { count: 0, error: null };
  fail(ownerBookingsError);
  const { count: reviewEventCount, error: reviewsError } = await supabaseAdmin.from("property_review_events").select("id", { count: "exact", head: true }).eq("reviewer_id", targetId);
  fail(reviewsError);
  const blockers = {
    studentBookings: studentBookingCount ?? 0,
    ownerBookings: ownerBookingCount ?? 0,
    reviewEvents: reviewEventCount ?? 0,
  };
  if (blockers.studentBookings || blockers.ownerBookings || blockers.reviewEvents) {
    await writeUserDeletionAudit({ actorId, targetId, targetRole, result: "failed", details: { reason: "historical_records_preserved", blockers } });
    throw new Error("لا يمكن حذف هذا الحساب لأن له سجلات حجز أو مراجعة تاريخية يجب الاحتفاظ بها.");
  }

  const auditId = await writeUserDeletionAudit({ actorId, targetId, targetRole, result: "requested", details: { ownedProperties: propertyIds.length } });
  try {
    const removedObjects = 0;
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(targetId);
    fail(deleteAuthError);
    await writeUserDeletionAudit({ actorId, targetId, targetRole, result: "succeeded", details: { deletedProperties: 0, removedObjects }, auditId });
    return { targetId, deletedProperties: 0, removedObjects };
  } catch (error) {
    await writeUserDeletionAudit({ actorId, targetId, targetRole, result: "failed", details: { reason: error instanceof Error ? error.message : "unknown_failure" }, auditId });
    throw error;
  }
}

export async function uploadMedia(client: any, actorId: string, input: { propertyId: string; name: string; mimeType: string; dataBase64: string; mediaType: "image" | "video" | "verification_document"; verificationDocumentKind?: VerificationDocumentKind; isPrimary: boolean; sortOrder?: number; description?: string; tag?: string; actorRole: AppRole }) {
  const { data: property, error: propertyError } = await client.from("properties").select("id, owner_id, deleted_at").eq("id", input.propertyId).maybeSingle();
  fail(propertyError);
  if (!property) throw new Error("العقار غير موجود أو لا تملك صلاحية الوصول إليه.");
  if (property.deleted_at) throw new Error("لا يمكن تعديل أو رفع وسائط لعقار مؤرشف.");
  const isVerification = input.mediaType === "verification_document";
  if (input.actorRole !== "admin" && input.actorRole !== "super_admin" && property.owner_id !== actorId) throw new Error("لا تملك صلاحية رفع ملفات لهذا العقار.");
  if (isVerification && input.actorRole !== "owner") throw new Error("لا يرفع مستندات إثبات الملكية إلا مالك العقار نفسه.");
  if (isVerification && !input.verificationDocumentKind) throw new Error("حدد نوع مستند التحقق قبل رفعه.");
  if ((input.mediaType === "image" || isVerification) && input.actorRole === "owner") await assertEditableOwnerProperty(client, actorId, input.propertyId);
  const raw = Buffer.from(input.dataBase64, "base64");
  if (raw.byteLength > (isVerification ? MAX_OWNER_VERIFICATION_DOCUMENT_BYTES : MAX_PROPERTY_PHOTO_BYTES)) throw new Error("الحد الأقصى لحجم الملف هو 5 ميجابايت.");
  if (input.mediaType === "image" && !["image/jpeg", "image/png", "image/webp"].includes(input.mimeType)) throw new Error("تدعم صور العقار JPEG وPNG وWebP فقط.");
  if (isVerification && !["application/pdf", "image/jpeg", "image/png"].includes(input.mimeType)) throw new Error("يدعم إثبات الملكية ملفات PDF وصور JPEG وPNG فقط.");
  if (isVerification && !hasAllowedVerificationDocumentSignature(raw, input.mimeType as PropertyVerificationDocumentInput["mimeType"])) throw new Error("ملف إثبات الملكية غير صالح أو لا يطابق نوعه المعلن.");
  const bucket = isVerification ? "verification_documents" : "property-media-staging";
  const safeName = input.name.replace(/[^a-zA-Z0-9._-]/g, "-");
  const path = `${actorId}/${input.propertyId}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(bucket).upload(path, raw, { contentType: input.mimeType, upsert: false });
  fail(uploadError);
  const metadata = input.mediaType === "image" ? normalizeMediaMetadata(input) : { description: null, tag: null };
  const { count, error: countError } = await supabaseAdmin.from("property_media").select("id", { count: "exact", head: true }).eq("property_id", input.propertyId).eq("media_type", input.mediaType);
  fail(countError);
  if (input.mediaType === "image" && (count ?? 0) >= MAX_PROPERTY_PHOTO_COUNT) throw new Error(`لا يمكن إضافة أكثر من ${MAX_PROPERTY_PHOTO_COUNT} صورة للعقار.`);
  const sortOrder = input.mediaType === "image" ? Math.max(0, input.sortOrder ?? (count ?? 0)) : 0;
  if (input.isPrimary) await supabaseAdmin.from("property_media").update({ is_primary: false }).eq("property_id", input.propertyId).eq("media_type", "image");
  const { data, error } = await supabaseAdmin.from("property_media").insert({ property_id: input.propertyId, storage_bucket: bucket, storage_path: path, original_name: input.name, mime_type: input.mimeType, media_type: input.mediaType, verification_document_kind: isVerification ? input.verificationDocumentKind : null, is_primary: input.isPrimary, sort_order: sortOrder, description: metadata.description, tag: metadata.tag, is_public: false, watermark_status: input.mediaType === "image" ? "not_requested" : "not_requested" }).select().single();
  if (error) {
    await supabaseAdmin.storage.from(bucket).remove([path]).catch(() => undefined);
  }
  fail(error); return camelize(data);
}

export async function deleteOwnerMedia(client: any, ownerId: string, mediaId: string) {
  const { data: media, error: mediaError } = await supabaseAdmin
    .from("property_media")
    .select("id, property_id, storage_bucket, storage_path, media_type")
    .eq("id", mediaId)
    .maybeSingle();
  fail(mediaError);
  if (!media) throw new Error("الوسيط غير موجود أو لا تملك صلاحية إدارته.");
  if (media.media_type !== "image") throw new Error("يمكن إدارة صور العقار فقط من هذا المسار.");
  const property = await assertEditableOwnerProperty(client, ownerId, media.property_id);
  const { count, error: countError } = await supabaseAdmin.from("property_media").select("id", { count: "exact", head: true }).eq("property_id", property.id).eq("media_type", "image");
  fail(countError);
  if ((count ?? 0) <= MIN_PROPERTY_PHOTO_COUNT) throw new Error(`يجب الإبقاء على ${MIN_PROPERTY_PHOTO_COUNT} صور على الأقل للعقار.`);
  const { error: removeError } = await supabaseAdmin.storage.from(media.storage_bucket).remove([media.storage_path]);
  fail(removeError);
  const { error: deleteError } = await supabaseAdmin.from("property_media").delete().eq("id", media.id).eq("property_id", property.id);
  fail(deleteError);
  const { data: firstRemaining, error: firstRemainingError } = await supabaseAdmin.from("property_media")
    .select("id").eq("property_id", property.id).eq("media_type", "image").order("sort_order", { ascending: true }).limit(1).maybeSingle();
  fail(firstRemainingError);
  if (firstRemaining) {
    const { error: primaryError } = await supabaseAdmin.from("property_media").update({ is_primary: true }).eq("id", firstRemaining.id);
    fail(primaryError);
  }
  return { mediaId: media.id, propertyId: property.id };
}

async function assertEditableOwnerProperty(client: any, ownerId: string, propertyId: string) {
  const { data: property, error } = await client.from("properties")
    .select("id, verification_status").eq("id", propertyId).eq("owner_id", ownerId).maybeSingle();
  fail(error);
  if (!property) throw new Error("العقار غير موجود أو لا تملك صلاحية إدارة صوره.");
  if (property.verification_status === "verified") {
    const { error: reviewError } = await client.from("properties").update({ verification_status: "pending", review_reason: null }).eq("id", property.id).eq("owner_id", ownerId);
    fail(reviewError);
    await withdrawPublishedPropertyImages(property.id);
    return { ...property, verification_status: "pending" };
  }
  if (!["draft", "pending", "needs_changes", "rejected"].includes(property.verification_status)) throw new Error("لا يمكن إدارة صور هذا الإعلان في حالته الحالية.");
  return property;
}

export async function reorderOwnerPropertyMedia(client: any, ownerId: string, propertyId: string, mediaIds: string[]) {
  await assertEditableOwnerProperty(client, ownerId, propertyId);
  const { data: media, error } = await supabaseAdmin.from("property_media")
    .select("id").eq("property_id", propertyId).eq("media_type", "image").order("sort_order", { ascending: true });
  fail(error);
  const existingIds = (media ?? []).map(item => item.id);
  if (existingIds.length !== mediaIds.length || existingIds.some(id => !mediaIds.includes(id)) || new Set(mediaIds).size !== mediaIds.length) {
    throw new Error("ترتيب الصور غير صالح لهذا الإعلان.");
  }
  const { error: clearPrimaryError } = await supabaseAdmin.from("property_media").update({ is_primary: false }).eq("property_id", propertyId).eq("media_type", "image");
  fail(clearPrimaryError);
  for (let index = 0; index < mediaIds.length; index += 1) {
    const { error: temporaryError } = await supabaseAdmin.from("property_media").update({ sort_order: 1000 + index }).eq("id", mediaIds[index]).eq("property_id", propertyId);
    fail(temporaryError);
  }
  for (let index = 0; index < mediaIds.length; index += 1) {
    const { error: finalError } = await supabaseAdmin.from("property_media").update({ sort_order: index, is_primary: index === 0 }).eq("id", mediaIds[index]).eq("property_id", propertyId);
    fail(finalError);
  }
  return { propertyId, mediaIds };
}

export async function updateOwnerMediaMetadata(client: any, ownerId: string, input: { mediaId: string; description?: string | null; tag?: string | null }) {
  const { data: media, error } = await supabaseAdmin.from("property_media")
    .select("id, property_id, media_type").eq("id", input.mediaId).maybeSingle();
  fail(error);
  if (!media || media.media_type !== "image") throw new Error("صورة العقار المطلوبة غير موجودة.");
  await assertEditableOwnerProperty(client, ownerId, media.property_id);
  const metadata = normalizeMediaMetadata({ description: input.description ?? undefined, tag: input.tag ?? undefined });
  const { error: updateError } = await supabaseAdmin.from("property_media").update(metadata).eq("id", media.id).eq("property_id", media.property_id);
  fail(updateError);
  return { mediaId: media.id, ...metadata };
}

export async function setOwnerPropertyMediaCover(client: any, ownerId: string, propertyId: string, mediaId: string) {
  await assertEditableOwnerProperty(client, ownerId, propertyId);
  const { data: media, error } = await supabaseAdmin.from("property_media").select("id").eq("property_id", propertyId).eq("media_type", "image").order("sort_order", { ascending: true });
  fail(error);
  const existingIds = (media ?? []).map(item => item.id);
  if (!existingIds.includes(mediaId)) throw new Error("الصورة المختارة لا تنتمي إلى هذا العقار.");
  return reorderOwnerPropertyMedia(client, ownerId, propertyId, [mediaId, ...existingIds.filter(id => id !== mediaId)]);
}

export async function replaceOwnerPropertyMedia(client: any, ownerId: string, input: { mediaId: string; name: string; mimeType: "image/jpeg" | "image/png" | "image/webp"; dataBase64: string; description?: string; tag?: string }) {
  const { data: current, error } = await supabaseAdmin.from("property_media").select("id, property_id, sort_order, is_primary, description, tag, media_type").eq("id", input.mediaId).maybeSingle();
  fail(error);
  if (!current || current.media_type !== "image") throw new Error("الصورة المطلوب استبدالها غير موجودة.");
  await assertEditableOwnerProperty(client, ownerId, current.property_id);
  const replacement = await uploadMedia(client, ownerId, {
    propertyId: current.property_id, name: input.name, mimeType: input.mimeType, dataBase64: input.dataBase64, mediaType: "image", isPrimary: current.is_primary,
    sortOrder: current.sort_order, description: input.description ?? current.description ?? undefined, tag: input.tag ?? current.tag ?? undefined, actorRole: "owner",
  });
  await deleteOwnerMedia(client, ownerId, current.id);
  return { replacedMediaId: current.id, replacement };
}
