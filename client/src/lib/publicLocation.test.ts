import { describe, expect, it } from "vitest";
import { isValidPublicMapPoint, publicMapFallbackCopy } from "./publicLocation";

describe("public map location helpers", () => {
  it("accepts a bounded public point without generating a public directions URL", () => {
    expect(isValidPublicMapPoint({ publicLat: 29.1264, publicLng: 31.2316 })).toBe(true);
    expect(publicMapFallbackCopy.unavailableDescription).not.toContain("اتجاهات");
  });

  it("rejects malformed public coordinates", () => {
    expect(isValidPublicMapPoint({ publicLat: Number.NaN, publicLng: 31.2 })).toBe(false);
  });

  it("provides an intentional Arabic unavailable-map fallback without coordinates", () => {
    expect(publicMapFallbackCopy.unavailableTitle).toContain("الخريطة");
    expect(publicMapFallbackCopy.unavailableDescription).toContain("موقعه الدقيق");
    expect(publicMapFallbackCopy.unavailableDescription).not.toMatch(/\d+\.\d+/);
  });
});
