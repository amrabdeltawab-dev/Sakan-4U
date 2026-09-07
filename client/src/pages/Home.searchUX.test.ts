import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Homepage search and filter UX", () => {
  const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");

  it("sorts visible results by newest and both price orders", () => {
    expect(source).toContain('type SortOption = "newest" | "price_asc" | "price_desc"');
    expect(source).toContain('if (sort === "price_asc") return a.monthlyPrice - b.monthlyPrice');
    expect(source).toContain('if (sort === "price_desc") return b.monthlyPrice - a.monthlyPrice');
    expect(source).toContain("visibleCards.map(property");
  });

  it("keeps one hero search bar and places detailed controls in the RTL filter sheet", () => {
    expect(source).toContain("ابحث باسم العقار أو المدينة أو الحي");
    expect(source).toContain("<SheetContent side=\"right\" dir=\"rtl\"");
    expect(source).toContain("تصفية النتائج");
    expect(source).toContain("FilterFields");
    expect(source).not.toContain("lg:grid-cols-[280px_minmax(0,1fr)]");
  });

  it("uses incremental public pagination plus explicit card skeletons instead of a blank loading area", () => {
    expect(source).toContain("const [visibleCount, setVisibleCount] = useState(6)");
    expect(source).toContain("const visibleCards = sortedCards.slice(0, visibleCount)");
    expect(source).toContain("عرض المزيد من العقارات");
    expect(source).toContain("PropertyCardSkeleton");
    expect(source).toContain("جارٍ تحميل العقارات");
  });

  it("uses a rich contained hero, an RTL-start responsive listing grid, and three balanced journey steps", () => {
    expect(source).toContain("bg-gradient-to-bl from-[#f8fafc] via-[#eff6ff] to-[#f0fdf4]");
    expect(source).toContain("lg:grid-cols-[1.05fr_.95fr]");
    expect(source).toContain('const listingGridClass = "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"');
    expect(source).toContain("grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4");
    expect(source).toContain("grid w-full content-start gap-6");
    expect(source).not.toContain("justify-items-center");
    expect(source).not.toContain("mx-auto max-w-md grid-cols-1");
    expect(source).toContain("max-w-7xl");
    expect(source).toContain("mt-10 grid gap-5 text-right md:grid-cols-3");
    expect(source).toContain("hover:-translate-y-1 hover:shadow-lg");
    expect(source).not.toContain("[background-image:radial-gradient(#bfdbfe_1px,transparent_1px)]");
  });
});
