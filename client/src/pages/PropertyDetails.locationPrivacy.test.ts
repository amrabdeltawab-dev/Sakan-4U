import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("PropertyDetails smart-radius location privacy", () => {
  it("uses a 300m circle around public coordinates and removes exact pin and directions UI", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/PropertyDetails.tsx"), "utf8");
    expect(source).toContain("new google.maps.Circle");
    expect(source).toContain("radius: 300");
    expect(source).toContain("property.publicLat");
    expect(source).toContain("property.publicLng");
    expect(source).toContain("الموقع الموضح تقريبي للحفاظ على خصوصية المالك.");
    expect(source).not.toContain("new google.maps.Marker");
    expect(source).not.toContain("buildApproximateDirectionsUrl");
    expect(source).not.toContain("اتجاهات المنطقة التقريبية");
  });
});
