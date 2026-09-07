import { formatEgp } from "@/lib/marketplace";

type InspectionFeeInput = {
  feeAmount?: number | null;
  isLoading: boolean;
  hasError: boolean;
};

export function inspectionFeePresentation({ feeAmount, isLoading, hasError }: InspectionFeeInput) {
  if (typeof feeAmount === "number" && Number.isFinite(feeAmount) && feeAmount > 0) {
    return { canSubmit: true, message: `رسوم خدمة Sakan 4U للمعاينة: ${formatEgp(feeAmount)} جنيه`, detail: null };
  }
  if (hasError) {
    return {
      canSubmit: false,
      message: "تعذر تحديد رسوم خدمة المعاينة.",
      detail: "يرجى المحاولة لاحقاً أو التواصل مع فريق Sakan 4U. لا يمكن إرسال الطلب قبل تأكيد الرسوم.",
    };
  }
  return { canSubmit: false, message: "رسوم خدمة Sakan 4U للمعاينة: جارٍ التحقق...", detail: isLoading ? "جارٍ تحميل الرسوم المعتمدة للعقار." : "جارٍ التحقق من الرسوم المعتمدة للعقار." };
}

export function canSubmitInspectionRequest(input: InspectionFeeInput & { name: string; phone: string; requestedViewingAt: string; isSubmitting: boolean }) {
  const fee = inspectionFeePresentation(input);
  return fee.canSubmit && !input.isSubmitting && input.name.trim().length >= 2 && input.phone.trim().length >= 6 && Boolean(input.requestedViewingAt);
}
