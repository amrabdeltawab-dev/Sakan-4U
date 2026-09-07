import { describe, expect, it } from "vitest";
import { normalizeProperty } from "./marketplace";

describe("public property map normalization", () => {
  it("uses only server-provided public map fields and never falls back to an exact coordinate field", () => {
    const property = normalizeProperty({
      id: "property-location-privacy",
      title: "عقار اختبار",
      propertyType: "apartment",
      area: "صلاح سالم",
      governorate: "بني سويف",
      monthlyPrice: 3000,
      bedrooms: 2,
      bathrooms: 1,
      capacity: 2,
      genderSuitability: "mixed",
      furnished: true,
      amenities: ["واي فاي"],
      availabilityStatus: "available",
      verificationStatus: "verified",
      description: "وصف اختبار كافٍ للتحقق من استخدام موقع الخريطة التقريبي فقط.",
      approximateLocation: "صلاح سالم، بني سويف",
      exactLat: 29.1234567,
      exactLng: 31.2345678,
      publicLat: 29.126,
      publicLng: 31.232,
    });

    expect(property.publicLat).toBe(29.126);
    expect(property.publicLng).toBe(31.232);
    expect("exactLat" in property).toBe(false);
    expect("exactLng" in property).toBe(false);
  });
});
