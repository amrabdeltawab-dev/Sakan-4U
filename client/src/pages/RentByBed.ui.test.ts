import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeProperty } from "@/lib/marketplace";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("rent-by-bed UI", () => {
  const ownerWizard = source("client/src/components/OwnerPropertyCreateWizard.tsx");
  const home = source("client/src/pages/Home.tsx");
  const card = source("client/src/components/PropertyCard.tsx");
  const detail = source("client/src/pages/PropertyDetails.tsx");

  it("normalizes the public bed-rental inventory without changing default full-apartment listings", () => {
    const bed = normalizeProperty({ id: "1", title: "سكن مشترك", propertyType: "shared_room", area: "صلاح سالم", governorate: "بني سويف", monthlyPrice: 1500, rentType: "bed", totalBeds: 3, bedrooms: 2, bathrooms: 1, capacity: 4, genderSuitability: "male", furnished: true, amenities: [], verificationStatus: "verified", availabilityStatus: "available", description: "وصف كافٍ", media: [] });
    const full = normalizeProperty({ ...bed, rentType: undefined, totalBeds: undefined });
    expect(bed).toMatchObject({ rentType: "bed", totalBeds: 3 });
    expect(full).toMatchObject({ rentType: "full", totalBeds: null });
  });

  it("gives owners an explicit full-apartment or bed-rental choice with a conditional available-bed field", () => {
    expect(ownerWizard).toContain("طريقة التأجير");
    expect(ownerWizard).toContain("تأجير الشقة كاملة");
    expect(ownerWizard).toContain("تأجير بالسرير");
    expect(ownerWizard).toContain("إجمالي الأسرة المتاحة");
    expect(ownerWizard).toContain("validRentConfiguration");
    expect(ownerWizard).toContain("totalBeds: form.rentType === \"bed\" ? totalBeds : null");
  });

  it("adds a horizontal rent-type tab bar above the unchanged responsive RTL grid", () => {
    expect(home).toContain('type RentTypeFilter = "all" | "full" | "bed"');
    expect(home).toContain('role="tablist" aria-label="نوع الإيجار"');
    expect(home).toContain("شقق كاملة");
    expect(home).toContain("سكن مشترك / سرير");
    expect(home).toContain("rentType: rentType === \"all\" ? undefined : rentType");
    expect(home).toContain('"grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"');
  });

  it("labels bed listings clearly with per-bed pricing and available-bed information in cards and details", () => {
    expect(card).toContain("مشترك (بالسرير)");
    expect(card).toContain("rentPriceLabels[property.rentType]");
    expect(card).toContain("`${property.availableBeds ?? 0} أسرة متاحة`");
    expect(detail).toContain("rentTypeLabels[property.rentType]");
    expect(detail).toContain("سعر السرير الشهري");
  });
});
