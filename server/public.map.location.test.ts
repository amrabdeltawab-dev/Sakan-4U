import { describe, expect, it } from "vitest";
import { createProperty, derivePropertyApproximateCoordinates } from "./db";

describe("public approximate property location", () => {
  const submittedArea = { area: "صلاح سالم", city: "بني سويف", governorate: "بني سويف" };

  it("derives different stable approximate points for distinct properties without accepting an exact browser point", () => {
    const first = derivePropertyApproximateCoordinates(submittedArea, "5aaf42f5-cf6a-4f2a-a5c3-8d5f1c82b101");
    const second = derivePropertyApproximateCoordinates(submittedArea, "6baf42f5-cf6a-4f2a-a5c3-8d5f1c82b202");

    expect(first).toEqual(derivePropertyApproximateCoordinates(submittedArea, "5aaf42f5-cf6a-4f2a-a5c3-8d5f1c82b101"));
    expect(first).not.toEqual(second);
    expect(first.latitude).toBeGreaterThan(29.05);
    expect(first.latitude).toBeLessThan(29.08);
    expect(first.longitude).toBeGreaterThan(31.08);
    expect(first.longitude).toBeLessThan(31.12);
  });

  it("stores only a server-derived approximate point when an owner creates a property", async () => {
    let inserted: Record<string, unknown> | undefined;
    const client = {
      from: () => ({
        insert: (value: Record<string, unknown>) => {
          inserted = value;
          return { select: () => ({ single: async () => ({ data: { id: value.id }, error: null }) }) };
        },
      }),
    };

    await createProperty(client, "5f8b62fd-1c69-48d7-8ce7-49938e2f1101", {
      title: "شقة اختبار موقع تقريبي",
      propertyType: "apartment",
      ...submittedArea,
      street: "شارع لا يجب استعماله علناً",
      description: "وصف اختبار كافٍ لإنشاء عقار والتحقق من اشتقاق موقع تقريبي آمن على الخادم.",
      monthlyPrice: 3200,
      bedrooms: 2,
      bathrooms: 1,
      capacity: 2,
      genderSuitability: "mixed",
      furnished: true,
      amenities: ["واي فاي"],
      latitude: 29.1234567,
      longitude: 31.2345678,
    });

    expect(inserted).toBeDefined();
    expect(inserted?.latitude).not.toBe(29.1234567);
    expect(inserted?.longitude).not.toBe(31.2345678);
    expect(inserted).toHaveProperty("street", "شارع لا يجب استعماله علناً");
  });
});
