import { describe, expect, it } from "vitest";
import { canSubmitInspectionRequest, inspectionFeePresentation } from "./inspectionFee";

describe("inspection fee presentation", () => {
  it("renders the authoritative resolved fee and enables a valid request", () => {
    expect(inspectionFeePresentation({ feeAmount: 900, isLoading: false, hasError: false }).message).toBe("رسوم خدمة Sakan 4U للمعاينة: ٩٠٠ جنيه");
    expect(canSubmitInspectionRequest({ feeAmount: 900, isLoading: false, hasError: false, name: "طالب اختبار", phone: "01000000000", requestedViewingAt: "2030-01-01T12:00", isSubmitting: false })).toBe(true);
  });

  it("keeps submission disabled with a clear Arabic error when the server fee cannot resolve", () => {
    const state = inspectionFeePresentation({ feeAmount: null, isLoading: false, hasError: true });
    expect(state.message).toBe("تعذر تحديد رسوم خدمة المعاينة.");
    expect(canSubmitInspectionRequest({ feeAmount: null, isLoading: false, hasError: true, name: "طالب اختبار", phone: "01000000000", requestedViewingAt: "2030-01-01T12:00", isSubmitting: false })).toBe(false);
  });
});
