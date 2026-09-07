import { toArabicErrorMessage } from "@/lib/errorMessages";

export type SupabaseAuthErrorLike = { message?: string; code?: string; status?: number } | null | undefined;

export function authErrorMessage(error: SupabaseAuthErrorLike) {
  const message = error?.message?.toLowerCase() ?? "";
  const isEmailRateLimited = error?.code === "over_email_send_rate_limit" || error?.status === 429 || message.includes("email rate limit") || message.includes("email rate") || message.includes("over_email_send_rate_limit");
  if (isEmailRateLimited) return "تم بلوغ الحد المؤقت لرسائل تأكيد البريد. لم يكتمل إنشاء الحساب. انتظر قليلاً قبل المحاولة أو تواصل مع إدارة Sakan 4U؛ لا تكرر الإرسال الآن.";
  if (message.includes("invalid login")) return "البريد الإلكتروني أو كلمة المرور غير صحيحة.";
  if (message.includes("email not confirmed")) return "تحقق من بريدك الإلكتروني أولاً ثم سجّل الدخول.";
  if (message.includes("email address not authorized")) return "لا يسمح إعداد البريد الحالي بإرسال رسالة تأكيد إلى هذا العنوان. تواصل مع إدارة Sakan 4U.";
  return toArabicErrorMessage(error);
}

export function canShowRegistrationSuccess(userId?: string) {
  return Boolean(userId);
}
