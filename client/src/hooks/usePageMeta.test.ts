import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("usePageMeta hook", () => {
  const source = readSource("client/src/hooks/usePageMeta.ts");

  it("sets document.title, meta description, and injects JSON-LD script", () => {
    expect(source).toContain("document.title");
    expect(source).toContain('meta[name="description"]');
    expect(source).toContain('application/ld+json');
    expect(source).toContain("SCRIPT_ID");
  });

  it("cleans up on unmount by restoring defaults and removing the script", () => {
    expect(source).toContain("DEFAULT_TITLE");
    expect(source).toContain("DEFAULT_DESCRIPTION");
    expect(source).toContain("remove()");
  });
});

describe("Home page SEO meta", () => {
  const source = readSource("client/src/pages/Home.tsx");

  it("uses usePageMeta with Arabic title and keywords in description", () => {
    expect(source).toContain("usePageMeta");
    expect(source).toContain("سكن طلابي في بني سويف | Sakan 4U");
    expect(source).toContain("شقق للطلاب");
    expect(source).toContain("سكن طلابي موثّق");
  });

  it("includes Organization and WebSite JSON-LD with SearchAction", () => {
    expect(source).toContain('"@type": "Organization"');
    expect(source).toContain('"@type": "WebSite"');
    expect(source).toContain("SearchAction");
    expect(source).toContain("query-input");
  });
});

describe("PropertyDetails page SEO meta", () => {
  const source = readSource("client/src/pages/PropertyDetails.tsx");

  it("sets a data-driven title from property data via usePageMeta", () => {
    expect(source).toContain("usePageMeta");
    expect(source).toContain("propertyTitle");
    expect(source).toContain("property.monthlyPrice");
    expect(source).toContain("property.title");
    expect(source).toContain("formatEgp");
  });

  it("generates a description from property data including price, location, and availability", () => {
    expect(source).toContain("propertyDescription");
    expect(source).toContain("property.approximateLocation");
    expect(source).toContain("rentPriceLabels");
    expect(source).toContain("property.bedrooms");
    expect(source).toContain("property.capacity");
  });

  it("includes Residence schema.org JSON-LD with EGP price", () => {
    expect(source).toContain('"@type": "Residence"');
    expect(source).toContain("priceCurrency");
    expect(source).toContain("EGP");
    expect(source).toContain("PostalAddress");
  });
});
