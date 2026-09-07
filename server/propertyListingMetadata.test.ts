import { describe, expect, it } from "vitest";
import { validateRentConfiguration } from "./db";

describe("property listing metadata gender rules", () => {
  it("rejects anyone for rent-by-bed listings", () => {
    expect(() => validateRentConfiguration({ rentType: "bed", totalBeds: 2, capacity: 3, genderPreference: "anyone" })).toThrow("لا يمكن اختيار مناسب للجميع");
  });

  it("rejects a missing preference for rent-by-bed listings", () => {
    expect(() => validateRentConfiguration({ rentType: "bed", totalBeds: 2, capacity: 3 })).toThrow("اختر شباب أو طالبات");
  });

  it.each(["male", "female"] as const)("accepts %s for rent-by-bed listings", genderPreference => {
    expect(() => validateRentConfiguration({ rentType: "bed", totalBeds: 2, capacity: 3, genderPreference })).not.toThrow();
  });

  it("allows anyone for full-apartment listings", () => {
    expect(() => validateRentConfiguration({ rentType: "full", totalBeds: null, capacity: 3, genderPreference: "anyone" })).not.toThrow();
  });
});
