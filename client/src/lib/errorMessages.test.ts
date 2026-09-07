import { describe, expect, it } from "vitest";
import { arabicErrorMessages, toArabicErrorMessage } from "./errorMessages";

describe("Arabic application error messages", () => {
  it("replaces raw Zod bathroom errors with a clear Arabic instruction", () => {
    const rawZodError = { message: '[{"code":"too_small","path":["property","bathrooms"],"message":"Too small"}]' };
    expect(toArabicErrorMessage(rawZodError)).toBe("يرجى إدخال عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل.");
  });

  it("translates generic technical, authorization, and network failures without exposing implementation details", () => {
    expect(toArabicErrorMessage({ message: "ZodError: invalid input" })).toBe(arabicErrorMessages.propertyFormErrorMessage);
    expect(toArabicErrorMessage({ message: "PGRST301 permission denied" })).toBe("لا تملك صلاحية تنفيذ هذه العملية.");
    expect(toArabicErrorMessage({ message: "Failed to fetch" })).toBe("تعذر الاتصال بالخدمة الآن. تحقق من اتصالك وحاول مرة أخرى.");
  });

  it("preserves already-safe Arabic business feedback", () => {
    expect(toArabicErrorMessage({ message: "أدخل عدد الأسرة المتاحة بشكل صحيح قبل الإرسال." })).toBe("أدخل عدد الأسرة المتاحة بشكل صحيح قبل الإرسال.");
  });
});
