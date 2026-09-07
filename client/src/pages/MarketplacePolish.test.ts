import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Marketplace polish controls", () => {
  const favorites = readFileSync(resolve(process.cwd(), "client/src/pages/Favorites.tsx"), "utf8");
  const cards = readFileSync(resolve(process.cwd(), "client/src/components/PropertyCard.tsx"), "utf8");
  const detail = readFileSync(resolve(process.cwd(), "client/src/pages/PropertyDetails.tsx"), "utf8");
  const home = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
  const emptyState = readFileSync(resolve(process.cwd(), "client/src/components/MarketplaceEmptyState.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "client/src/pages/Auth.tsx"), "utf8");
  const ownerWizard = readFileSync(resolve(process.cwd(), "client/src/components/OwnerPropertyCreateWizard.tsx"), "utf8");

  it("provides a student-only saved-properties page and accessible card toggle", () => {
    expect(favorites).toContain("trpc.favorites.list.useQuery");
    expect(favorites).toContain("saved: false");
    expect(favorites).toContain("العقارات المحفوظة");
    expect(cards).toContain("aria-pressed={isFavorite}");
    expect(cards).toContain("إزالة من المفضلة");
  });

  it("keeps the property-detail sharing control generic and removes the redundant WhatsApp action", () => {
    expect(detail).toContain("navigator.share");
    expect(detail).toContain("navigator.clipboard.writeText");
    expect(detail).toContain("مشاركة");
    expect(detail).not.toContain("shareOnWhatsApp");
    expect(detail).not.toContain("wa.me");
    expect(detail).not.toContain("MessageCircle");
  });

  it("shows a friendly Arabic no-results state whose primary action clears active filters", () => {
    expect(home).toContain("SearchX");
    expect(home).toContain("عفواً، لا توجد أماكن تطابق بحثك حالياً");
    expect(home).toContain('actionLabel="إعادة ضبط الفلاتر" onAction={clearFilters}');
    expect(home).toContain('const clearFilters = () => { setQuery(""); setArea(""); setType(""); setRentType("all"); setMaxPrice(""); setRooms(""); setGender(""); setDistanceMax(""); setSelectedAmenities([]); };');
    expect(emptyState).toContain("bg-[#2563eb]");
    expect(emptyState).toContain("onClick={onAction}");
  });

  it("uses a wider card image and exposes a native share action with a copied-link fallback", () => {
    expect(cards).toContain("aspect-[16/9]");
    expect(cards).toContain("w-full max-w-[320px] cursor-pointer justify-self-start");
    expect(cards).toContain("property.availableBeds ?? 0");
    expect(cards).toContain("grid grid-cols-3 gap-2");
    expect(cards).toContain("absolute right-3 top-3 flex items-center gap-2");
    expect(cards).toContain('aria-label="مشاركة العقار"');
    expect(cards).toContain("Share2");
    expect(cards).toContain("sharePropertyLink");
    expect(cards).toContain("navigator.share");
    expect(cards).toContain("navigator.clipboard.writeText");
    expect(cards).toContain("تم نسخ الرابط بنجاح");
    expect(cards).toContain('position: "bottom-center"');
    expect(cards).toContain("CarouselContent");
    expect(cards).toContain('opts={{ direction: "rtl"');
    expect(cards).toContain("الصورة التالية");
    expect(cards).toContain("سرير واحد متبقي!");
    expect(cards).toContain("text-red-600");
  });

  it("shares from the exterior card control and copies the link only when native sharing is unavailable", () => {
    expect(cards).toContain("aspect-[16/9]");
    expect(cards).toContain("w-full max-w-[320px] cursor-pointer justify-self-start");
    expect(cards).toContain("grid grid-cols-3 gap-2");
    expect(cards).toContain("absolute right-3 top-3 flex items-center gap-2");
    expect(cards).toContain('aria-label="مشاركة العقار"');
    expect(cards).toContain("Share2");
    expect(cards).toContain("if (!navigator.share) return copyPropertyLink(property)");
    expect(cards).toContain('name !== "AbortError"');
    expect(cards).toContain("navigator.clipboard.writeText");
  });

  it("makes the full property card navigable while isolating sharing, favorites, and carousel controls", () => {
    expect(cards).toContain('role="link"');
    expect(cards).toContain("tabIndex={0}");
    expect(cards).toContain("const stopCardNavigation");
    expect(cards).toContain("onClick={openProperty}");
    expect(cards).toContain("stopCardNavigation(event); carouselApi?.scrollPrev()");
    expect(cards).toContain("stopCardNavigation(event); carouselApi?.scrollNext()");
    expect(cards).toContain("stopCardNavigation(event); void sharePropertyLink(property)");
  });

  it("allows direct switching between student and owner signup and closes a successful property submission", () => {
    expect(auth).toContain('mode === "student" ? "/signup/owner" : "/signup/student"');
    expect(auth).toContain('mode === "student" ? "إنشاء حساب مالك" : "إنشاء حساب طالب"');
    expect(ownerWizard).toContain("setOpen(false); setStep(1); setPhotos([]);");
  });

  it("shows a spinner for pending authentication submissions and normalizes pasted descriptions", () => {
    expect(auth).toContain("LoaderCircle");
    expect(auth).toContain("animate-spin");
    expect(ownerWizard).toContain("normalizePastedDescription");
    expect(ownerWizard).toContain("onPaste={event =>");
    expect(ownerWizard).toContain("العدد الحالي: {normalizedDescription.length}");
  });
});
