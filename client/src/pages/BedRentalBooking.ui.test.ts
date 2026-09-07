import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("bed-rental booking presentation", () => {
  const card = source("client/src/components/PropertyCard.tsx");
  const panel = source("client/src/components/BookingRequestPanel.tsx");
  const owner = source("client/src/pages/Owner.tsx");
  const admin = source("client/src/pages/Admin.tsx");
  const detail = source("client/src/pages/PropertyDetails.tsx");

  it("shows the exact remaining bed inventory on public cards and details", () => {
    expect(card).toContain("property.availableBeds ?? 0");
    expect(card).toContain("أسرة متاحة");
    expect(detail).toContain("الأسرة المتبقية");
    expect(detail).toContain("property.availableBeds ?? 0");
  });

  it("uses a bed-specific request CTA, enforces one bed per request, and blocks depleted inventory in the student UI", () => {
    expect(panel).toContain('const requestLabel = isBedRental ? "طلب سرير" : "طلب معاينة"');
    expect(panel).toContain('const soldOut = isBedRental && (property.availableBeds ?? 0) < 1');
    expect(panel).toContain("اكتملت الأسرة المتاحة");
    expect(panel).toContain("peopleCount: isBedRental ? 1 : form.peopleCount");
    expect(panel).toContain("تأكيد طلب السرير");
  });

  it("labels the protected owner and staff coordination views from the requested rental-mode snapshot", () => {
    expect(owner).toContain('item.requestedRentType === "bed" ? "طلب سرير واحد" : "طلب شقة كاملة"');
    expect(owner).toContain('item.requestedRentType === "bed" ? "تأكيد السرير" : "تأكيد الاستعداد"');
    expect(admin).toContain('item.requestedRentType === "bed" ? "طلب سرير واحد" : "طلب شقة كاملة"');
    expect(admin).toContain("labels[item.status] = `${requestRentLabel}");
  });
});
