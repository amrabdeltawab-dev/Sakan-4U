export const viewingPaymentLabel: Record<string, string> = {
  pending: "بانتظار دفع رسوم المعاينة",
  paid: "تم التحقق من سداد الرسوم",
  failed: "تعذر تأكيد الدفع",
  refunded: "تمت إعادة الرسوم",
};

export const viewingDecisionLabel: Record<string, string> = {
  pending: "بانتظار قرارك بعد المعاينة",
  accepted: "تم قبول العقار",
  rejected: "العقار غير مناسب",
};

export function studentViewingNextAction(item: any) {
  if (item.status === "no_show") return item.refundReviewStatus === "pending" ? "سجلت الإدارة حالة عدم حضور وتراجع أي قرار استرداد يدوياً. لا يُعتمد استرداد تلقائياً." : "سجلت الإدارة حالة عدم حضور. راجع إشعاراتك لتفاصيل المتابعة.";
  if (item.cancellationRequest?.status === "pending") return "طلب الإلغاء قيد مراجعة Sakan 4U. لا يتغير الطلب أو الرسوم قبل القرار التشغيلي.";
  if (item.rescheduleRequest?.status === "pending") return "طلب تغيير الموعد قيد مراجعة Sakan 4U؛ يبقى الموعد الحالي سارياً حتى اعتماد موعد جديد.";
  if (item.studentViewingDecision === "accepted") return "تم احتساب رسوم المعاينة ضمن تكلفة خدمة/حجز Sakan 4U النهائية.";
  if (item.studentViewingDecision === "rejected") return "انتهت المعاينة. رسوم الخدمة غير قابلة للاسترداد بعد تقديم خدمة المعاينة والوساطة.";
  if (item.viewingCompletedAt) return "أخبر Sakan 4U بقرارك بعد المعاينة.";
  if (item.viewingScheduledAt) return "موعد المعاينة منسّق عبر Sakan 4U. لا يعني ذلك حجز العقار نهائياً.";
  if (item.paymentStatus === "paid") return "يتابع Sakan 4U تنسيق موعد المعاينة مع المالك.";
  return "رسوم خدمة Sakan 4U للمعاينة مطلوبة قبل تنسيق الموعد. لا يشارك Sakan 4U بيانات الاتصال المباشرة في هذه المرحلة.";
}
