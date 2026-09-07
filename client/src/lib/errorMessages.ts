export type ErrorLike = { message?: unknown; code?: unknown; status?: unknown } | null | undefined;

const genericErrorMessage = "تعذر إكمال العملية الآن. حاول مرة أخرى بعد قليل.";
const networkErrorMessage = "تعذر الاتصال بالخدمة الآن. تحقق من اتصالك وحاول مرة أخرى.";
const propertyFormErrorMessage = "يرجى التأكد من إدخال جميع الحقول الإجبارية بشكل صحيح، مثل عدد الحمامات.";

export const actionErrorMessages = {
  booking: "تعذر إرسال طلب المعاينة الآن. راجع البيانات وحاول مرة أخرى.",
  bookingDecision: "تعذر تحديث حالة طلب المعاينة. حاول مرة أخرى بعد قليل.",
  moderation: "تعذر حفظ قرار المراجعة. راجع البيانات وحاول مرة أخرى.",
  property: "تعذر حفظ العقار أو إرساله للمراجعة. راجع البيانات وحاول مرة أخرى.",
  payment: "تعذر تسجيل إجراء السداد الآن. تحقق من البيانات وحاول مرة أخرى.",
  email: "تم تنفيذ الإجراء، لكن تعذر إرسال البريد الإلكتروني حالياً.",
  profile: "تعذر حفظ بيانات الحساب الآن. تحقق من البيانات وحاول مرة أخرى.",
  upload: "تعذر تجهيز الملف أو رفعه الآن. تحقق من الملف وحاول مرة أخرى.",
} as const;

function rawErrorMessage(error: unknown) {
  if (typeof error === "string") return error.trim();
  if (error && typeof error === "object") {
    const candidate = error as { message?: unknown };
    if (typeof candidate.message === "string") return candidate.message.trim();
  }
  return "";
}

export function toArabicErrorMessage(error: unknown, fallback = genericErrorMessage) {
  const message = rawErrorMessage(error);
  const normalized = message.toLowerCase();
  const isArabicUserMessage = /[\u0600-\u06ff]/.test(message) && !/[{[\]}/]/.test(message) && !/(trpc|zod|json|error:|postgres|supabase)/i.test(message);

  if (/(bathrooms?|عدد الحمامات)/i.test(message)) return "يرجى إدخال عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل.";
  if (/(bedrooms?|عدد الغرف|monthlyprice|monthly price|capacity|السعة)/i.test(message) && /(invalid|expected|too_small|too small|validation|zod|json|input|number)/i.test(message)) return propertyFormErrorMessage;
  if (/(zod|validation|invalid input|expected (number|string|boolean)|too_small|too_big|unrecognized key|json|parse error)/i.test(normalized)) return propertyFormErrorMessage;
  if (/(unauthorized|forbidden|permission denied|not authorized|غير مخول|غير مصرح)/i.test(normalized)) return "لا تملك صلاحية تنفيذ هذه العملية.";
  if (/(duplicate|already exists|موجود بالفعل|طلب نشط|active request)/i.test(normalized)) return "يوجد طلب نشط لهذه العملية بالفعل.";
  if (/(network|failed to fetch|fetch failed|timeout|connection|pgrst|postgres|supabase|internal server|server error)/i.test(normalized)) return fallback === genericErrorMessage ? networkErrorMessage : fallback;
  if (isArabicUserMessage) return message;
  return fallback;
}

export const arabicErrorMessages = { genericErrorMessage, networkErrorMessage, propertyFormErrorMessage };
