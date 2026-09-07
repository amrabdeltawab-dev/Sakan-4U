export function studentBookingSuccessMessage(status: "STUDENT_CONFIRMED" | "CANCELLED") {
  return status === "STUDENT_CONFIRMED" ? "تم تأكيد الحجز بنجاح" : "تم إلغاء الطلب";
}
