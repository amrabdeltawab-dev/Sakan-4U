import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Property Details lightbox and favorite persistence", () => {
  const detail = readFileSync(resolve(process.cwd(), "client/src/pages/PropertyDetails.tsx"), "utf8");
  const ownerCard = readFileSync(resolve(process.cwd(), "client/src/components/OwnerPropertyManagementCard.tsx"), "utf8");
  const db = readFileSync(resolve(process.cwd(), "server/db.ts"), "utf8");

  it("opens an accessible fullscreen gallery from the primary image and lets users navigate its photos", () => {
    expect(detail).toContain("const [lightboxOpen, setLightboxOpen] = useState(false)");
    expect(detail).toContain("فتح معرض الصور بالحجم الكامل");
    expect(detail).toContain("عرض بالحجم الكامل");
    expect(detail).toContain('h-[100dvh]');
    expect(detail).toContain('w-[100vw]');
    expect(detail).toContain("الصورة السابقة");
    expect(detail).toContain("الصورة التالية");
    expect(detail).toContain("إغلاق معرض الصور");
    expect(detail).toContain("object-contain");
  });

  it("keeps favorites authenticated and database-backed rather than storing property state locally", () => {
    expect(detail).toContain("trpc.favorites.ids.useQuery");
    expect(detail).toContain("trpc.favorites.set.useMutation");
    expect(detail).not.toContain("localStorage");
    expect(db).toContain('from("property_favorites").insert');
    expect(db).toContain('from("property_favorites").delete');
    expect(db).toContain('select("property_id")');
  });

  it("clearly distinguishes a declined staged update from a listing-level review note for the owner", () => {
    expect(ownerCard).toContain("تعديلات قيد المراجعة");
    expect(ownerCard).toContain("لم تُعتمد التعديلات المقترحة:");
    expect(ownerCard).toContain("property.reviewReason");
  });
});
