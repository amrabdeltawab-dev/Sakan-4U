import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateRentConfiguration } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const ownerContext: TrpcContext = {
  user: { id: "b5f9b244-8161-4dc1-9cfe-8ddc0c45e2e1", name: "Test Owner", email: "owner@example.com", phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" },
  accessToken: "test-token", supabase: {} as never, req: {} as never, res: {} as never,
};

const bedDraft = {
  title: "سكن مشترك قريب من الجامعة", propertyType: "shared_room" as const, governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", exactLat: 29.0661, exactLng: 31.0994,
  description: "وصف واضح وكافٍ لسكن مشترك مريح وآمن للطلاب بالقرب من الجامعة.", monthlyPrice: 1800, bedrooms: 2, bathrooms: 1, capacity: 4, genderSuitability: "male" as const, furnished: true, amenities: ["واي فاي"], rentType: "bed" as const,
};

describe("rent-by-bed server and database integrity", () => {
  it("allows a bed rental only when its available beds are a positive integer within capacity", () => {
    expect(() => validateRentConfiguration({ rentType: "bed", totalBeds: 3, capacity: 4, genderPreference: "male" })).not.toThrow();
    expect(() => validateRentConfiguration({ rentType: "bed", totalBeds: null, capacity: 4, genderPreference: "male" })).toThrow("عدد الأسرة المتاحة");
    expect(() => validateRentConfiguration({ rentType: "bed", totalBeds: 5, capacity: 4, genderPreference: "male" })).toThrow("عدد الأسرة المتاحة");
  });

  it("does not allow a full-apartment listing to retain a bed inventory", () => {
    expect(() => validateRentConfiguration({ rentType: "full", totalBeds: null, capacity: 4, genderPreference: "anyone" })).not.toThrow();
    expect(() => validateRentConfiguration({ rentType: "full", totalBeds: 2, capacity: 4, genderPreference: "anyone" })).toThrow("التأجير بالسرير فقط");
  });

  it("rejects malformed bed-rental create requests at the protected API contract before any data client is used", async () => {
    const caller = appRouter.createCaller(ownerContext);
    await expect(caller.properties.createDraft(bedDraft)).rejects.toThrow("عدد الأسرة المتاحة");
    await expect(caller.properties.createDraft({ ...bedDraft, totalBeds: 5 })).rejects.toThrow("عدد الأسرة المتاحة");
    await expect(caller.properties.createDraft({ ...bedDraft, rentType: "full", totalBeds: 2 })).rejects.toThrow("التأجير بالسرير فقط");
  });

  it("keeps the SQL-level conditional inventory constraint and full-rental default in the tracked migration", () => {
    const migration = readFileSync(resolve(process.cwd(), "supabase/migrations/20260827192500_rent_by_bed_properties.sql"), "utf8");
    expect(migration).toContain("create type public.rent_type as enum ('full', 'bed')");
    expect(migration).toContain("alter column rent_type set default 'full'::public.rent_type");
    expect(migration).toContain("properties_rent_type_total_beds_check");
    expect(migration).toContain("total_beds between 1 and capacity");
  });
});
