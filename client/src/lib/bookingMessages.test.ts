import { describe, expect, it } from "vitest";
import { studentBookingSuccessMessage } from "./bookingMessages";

describe("student booking success messages", () => {
  it("uses the confirmation message only for a successful student confirmation", () => {
    expect(studentBookingSuccessMessage("STUDENT_CONFIRMED")).toBe("تم تأكيد الحجز بنجاح");
    expect(studentBookingSuccessMessage("STUDENT_CONFIRMED")).not.toBe("تم إلغاء الطلب");
  });

  it("retains the cancellation message for an actual cancellation", () => {
    expect(studentBookingSuccessMessage("CANCELLED")).toBe("تم إلغاء الطلب");
  });
});
