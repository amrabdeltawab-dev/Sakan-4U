import { describe, expect, it } from "vitest";
import { canSubmitInspectionRequest, computeServiceFee, inspectionFeePresentation, FEE_CAP, FEE_RATE } from "./inspectionFee";

describe("inspection fee presentation", () => {
  it("renders the authoritative resolved fee and enables a valid request", () => {
    expect(inspectionFeePresentation({ feeAmount: 300, isLoading: false, hasError: false }).message).toBe("رسوم خدمة Sakan 4U للمعاينة: ٣٠٠ جنيه");
    expect(canSubmitInspectionRequest({ feeAmount: 300, isLoading: false, hasError: false, name: "طالب اختبار", phone: "01000000000", requestedViewingAt: "2030-01-01T12:00", isSubmitting: false })).toBe(true);
  });

  it("keeps submission disabled with a clear Arabic error when the server fee cannot resolve", () => {
    const state = inspectionFeePresentation({ feeAmount: null, isLoading: false, hasError: true });
    expect(state.message).toBe("تعذر تحديد رسوم خدمة المعاينة.");
    expect(canSubmitInspectionRequest({ feeAmount: null, isLoading: false, hasError: true, name: "طالب اختبار", phone: "01000000000", requestedViewingAt: "2030-01-01T12:00", isSubmitting: false })).toBe(false);
  });
});

describe("computeServiceFee — 15% of one month's rent, capped at 2000", () => {
  it("returns 15% for cheap rent below the cap", () => {
    expect(computeServiceFee(2000)).toBe(300);
    expect(computeServiceFee(5000)).toBe(750);
  });

  it("returns exactly 2000 when 15% equals the cap", () => {
    expect(computeServiceFee(13334)).toBe(2000);
  });

  it("caps at 2000 for rent above the threshold", () => {
    expect(computeServiceFee(15000)).toBe(2000);
    expect(computeServiceFee(50000)).toBe(2000);
  });

  it("rounds to the nearest integer", () => {
    expect(computeServiceFee(3333)).toBe(Math.round(3333 * FEE_RATE));
  });

  it("returns 0 for non-positive rent", () => {
    expect(computeServiceFee(0)).toBe(0);
    expect(computeServiceFee(-100)).toBe(0);
  });

  it("exposes the rate and cap constants", () => {
    expect(FEE_RATE).toBe(0.15);
    expect(FEE_CAP).toBe(2000);
  });
});
