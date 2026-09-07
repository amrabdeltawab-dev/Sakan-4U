import { describe, expect, it } from "vitest";
import { matchesPropertyFilters, parseDistanceMinutes } from "./propertyFilters";

describe("property grid metadata filters", () => {
  it("parses western and Arabic minute values from campus-distance labels", () => {
    expect(parseDistanceMinutes("10 mins walk")).toBe(10);
    expect(parseDistanceMinutes("١٥ دقيقة مشياً")).toBe(15);
    expect(parseDistanceMinutes("غير محددة")).toBeNull();
  });

  it("matches gender and maximum distance together", () => {
    const property = { genderPreference: "female" as const, distanceToCampus: "١٠ دقائق مشياً" };
    expect(matchesPropertyFilters(property, "female", "15")).toBe(true);
    expect(matchesPropertyFilters(property, "male", "15")).toBe(false);
    expect(matchesPropertyFilters(property, "female", "5")).toBe(false);
    expect(matchesPropertyFilters(property, "", "")).toBe(true);
  });

  it("requires a known campus distance when a distance limit is active", () => {
    expect(matchesPropertyFilters({ genderPreference: "anyone", distanceToCampus: null }, "", "10")).toBe(false);
  });
});
