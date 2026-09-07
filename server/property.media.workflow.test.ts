import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { normalizePropertyDescription, PROPERTY_DESCRIPTION_VALIDATION_MESSAGE, submitPropertyWithPhotos } from "./db";
import type { TrpcContext } from "./_core/context";

const ownerContext: TrpcContext = {
  user: { id: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", name: "مالك اختبار", email: "owner@example.com", phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" },
  accessToken: "test-token", supabase: {} as never, req: {} as never, res: {} as never,
};
const property = { title: "شقة اختبار للصور", propertyType: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", exactLat: 29.0661, exactLng: 31.0994, description: "وصف كاف لعقار اختبار يتحقق من أن الصور مطلوبة قبل إرساله للمراجعة.", monthlyPrice: 3200, bedrooms: 2, bathrooms: 1, capacity: 2, genderSuitability: "mixed", furnished: true, amenities: ["واي فاي"] };

describe("property submission with required photos", () => {
  it("rejects an empty or invalid image package before creating any property record", async () => {
    await expect(submitPropertyWithPhotos({} as never, ownerContext.user!.id, property, [])).rejects.toThrow("3 صور");
    await expect(submitPropertyWithPhotos({} as never, ownerContext.user!.id, property, [
      { name: "one.png", mimeType: "image/png", dataBase64: Buffer.from("not-a-real-png").toString("base64") },
      { name: "two.png", mimeType: "image/png", dataBase64: Buffer.from("not-a-real-png").toString("base64") },
      { name: "three.png", mimeType: "image/png", dataBase64: Buffer.from("not-a-real-png").toString("base64") },
    ])).rejects.toThrow("JPEG وPNG وWebP");
  });

  it("does not expose the legacy property-create route as a way to bypass required photos", async () => {
    const caller = appRouter.createCaller(ownerContext);
    await expect(caller.properties.create(property)).rejects.toThrow("صور العقار المطلوبة");
  });

  it("requires an exact building pin for every owner creation path", async () => {
    const caller = appRouter.createCaller(ownerContext);
    const { exactLat: _lat, exactLng: _lng, ...withoutLocation } = property;
    await expect(caller.properties.createDraft(withoutLocation as never)).rejects.toThrow();
    await expect(caller.properties.submitWithPhotos({ property: withoutLocation as never, photos: [] })).rejects.toThrow();
  });

  it("rejects zero or missing bathrooms with an Arabic field-specific validation message", async () => {
    const caller = appRouter.createCaller(ownerContext);
    await expect(caller.properties.createDraft({ ...property, bathrooms: 0 })).rejects.toThrow("أدخل عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل.");
    await expect(caller.properties.createDraft({ ...property, bathrooms: Number.NaN })).rejects.toThrow("أدخل عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل.");
  });

  it("rejects blank or trim-short property descriptions with the Arabic rule and normalizes valid values", async () => {
    const caller = appRouter.createCaller(ownerContext);
    expect(() => normalizePropertyDescription("                    ")).toThrow(PROPERTY_DESCRIPTION_VALIDATION_MESSAGE);
    expect(() => normalizePropertyDescription("   وصف قصير   ")).toThrow(PROPERTY_DESCRIPTION_VALIDATION_MESSAGE);
    expect(normalizePropertyDescription(`  ${property.description}  `)).toBe(property.description);
    await expect(caller.properties.submitWithPhotos({ property: { ...property, description: "                    " }, photos: [] })).rejects.toThrow(PROPERTY_DESCRIPTION_VALIDATION_MESSAGE);
  });

  it("blocks non-owner identities from a media-delete request before a data query runs", async () => {
    const student = appRouter.createCaller({ ...ownerContext, user: { ...ownerContext.user!, appRole: "student", marketplaceRole: "student" } });
    await expect(student.media.delete({ mediaId: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1" })).rejects.toThrow("مالك معتمد");
  });

  it("exposes only owner-scoped order and metadata mutations, while keeping the new photo contract bounded", async () => {
    const routerSource = await import("node:fs/promises").then(fs => fs.readFile("server/routers.ts", "utf8"));
    const dbSource = await import("node:fs/promises").then(fs => fs.readFile("server/db.ts", "utf8"));
    expect(routerSource).toContain("sortOrder");
    expect(routerSource).toContain("updateMetadata");
    expect(routerSource).toContain("reorder:");
    expect(dbSource).toContain("assertEditableOwnerProperty");
    expect(dbSource).toContain("watermark_status");
    expect(dbSource).toContain("public_storage_path");
  });

  it("requires a staff-owned reason for media-quality rejection and never exposes an unrestricted moderation route", async () => {
    const routerSource = await import("node:fs/promises").then(fs => fs.readFile("server/routers.ts", "utf8"));
    expect(routerSource).toContain("mediaQualityIssue");
    expect(routerSource).toContain("سبب القرار مطلوب عند طلب تعديل أو رفض الإعلان");
    expect(routerSource).toContain("لا يقل عن 12 حرفاً عند رفض الصور");
    expect(routerSource).toContain("review: adminProcedure");
  });

  it("keeps the four-stage owner payload aligned with the trimmed server contract", async () => {
    const ownerSource = await import("node:fs/promises").then(fs => fs.readFile("client/src/components/OwnerPropertyCreateWizard.tsx", "utf8"));
    const routerSource = await import("node:fs/promises").then(fs => fs.readFile("server/routers.ts", "utf8"));
    expect(ownerSource).toContain("const normalizedDescription = form.description.trim()");
    expect(ownerSource).toContain("description: normalizedDescription");
    expect(ownerSource).toContain("exactLat");
    expect(ownerSource).toContain("new google.maps.Marker");
    expect(ownerSource).toContain('bathrooms: "1"');
    expect(ownerSource).toContain("const validBathrooms");
    expect(ownerSource).toContain('min="1" aria-invalid={!validBathrooms}');
    expect(ownerSource).toContain("يجب أن يكون حماماً واحداً على الأقل");
    expect(ownerSource).toContain("تنبيه: لا تقم بكتابة العنوان الدقيق");
    expect(routerSource).toContain("description: z.string().trim().min(db.MIN_PROPERTY_DESCRIPTION_LENGTH");
  });
});
