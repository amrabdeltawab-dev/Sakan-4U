import * as db from "./db";
import { escapeEmailHtml, sendEmail } from "./email";
import type { SupabaseRuntimeEnv } from "./supabase";
import { getRuntimeEnvValue } from "./runtimeEnv";

export type BookingNotificationKind =
  | "new_request"
  | "contacted"
  | "owner_confirmed"
  | "student_confirmed"
  | "completed"
  | "rejected"
  | "cancelled"
  | "rescheduled";

type RecipientRole = "student" | "owner" | "staff";

function shouldSkipInTest(): boolean {
  return getRuntimeEnvValue("NODE_ENV") === "test";
}

function bookingSubject(kind: BookingNotificationKind, propertyTitle: string): string {
  const labels: Record<BookingNotificationKind, string> = {
    new_request: `طلب معاينة جديد — ${propertyTitle}`,
    contacted: `متابعة طلب المعاينة — ${propertyTitle}`,
    owner_confirmed: `تم تأكيد طلب المعاينة — ${propertyTitle}`,
    student_confirmed: `تأكيد الطالب — ${propertyTitle}`,
    completed: `اكتمل طلب السكن — ${propertyTitle}`,
    rejected: `تحديث طلب المعاينة — ${propertyTitle}`,
    cancelled: `تم إلغاء طلب المعاينة — ${propertyTitle}`,
    rescheduled: `تم تغيير موعد المعاينة — ${propertyTitle}`,
  };
  return labels[kind];
}

function bookingHtml(kind: BookingNotificationKind, details: Awaited<ReturnType<typeof db.getBookingNotificationDetails>>, recipientRole: RecipientRole): string {
  const title = escapeEmailHtml(details.property.title);
  const studentName = escapeEmailHtml(details.student.name);
  const studentPhone = escapeEmailHtml(details.student.phone);
  const ownerName = escapeEmailHtml(details.owner.name);
  const requestedAt = escapeEmailHtml(details.requestedViewingAt);

  if (kind === "new_request" && recipientRole === "owner") {
    return `<div dir="rtl"><h2>طلب معاينة جديد على Sakan 4U</h2><p>يوجد طلب معاينة جديد لعقار <strong>${title}</strong>.</p><p>اسم الطالب: ${studentName}<br>رقم التواصل: ${studentPhone}<br>الموعد المطلوب: ${requestedAt}</p><p>يرجى الدخول إلى لوحة التحكم لمراجعة الطلب.</p></div>`;
  }

  if (kind === "new_request" && recipientRole === "staff") {
    return `<div dir="rtl"><h2>طلب معاينة جديد يحتاج المتابعة</h2><p>يوجد طلب معاينة جديد لعقار <strong>${title}</strong> من الطالب ${studentName}.</p><p>يرجى الدخول إلى لوحة الإدارة لمتابعة الطلب.</p></div>`;
  }

  if (kind === "contacted" && recipientRole === "student") {
    return `<div dir="rtl"><h2>متابعة طلب المعاينة</h2><p>بدأ مالك عقار <strong>${title}</strong> متابعة طلب معاينتك. ستصل التفاصيل قريباً.</p><p>يمكنك متابعة الحالة من صفحة طلباتك على Sakan 4U.</p></div>`;
  }

  if (kind === "owner_confirmed" && recipientRole === "student") {
    return `<div dir="rtl"><h2>تم تأكيد طلب المعاينة</h2><p>تم قبول طلبك لمعاينة عقار <strong>${title}</strong>.</p><p>المالك: ${ownerName}<br>الموعد: ${requestedAt}</p><p>يمكنك متابعة التفاصيل من صفحة طلباتك على Sakan 4U.</p></div>`;
  }

  if (kind === "student_confirmed" && recipientRole === "owner") {
    return `<div dir="rtl"><h2>تأكيد الطالب للخطوة التالية</h2><p>أكد الطالب ${studentName} الاستمرار بعد معاينة عقار <strong>${title}</strong>.</p><p>يمكنك متابعة التفاصيل من لوحة تحكمك.</p></div>`;
  }

  if (kind === "completed" && recipientRole === "student") {
    return `<div dir="rtl"><h2>اكتمل طلب السكن</h2><p>اكتمل طلب السكن المرتبط بعقار <strong>${title}</strong>. نتمنى لكم تجربة سكن مريحة.</p></div>`;
  }

  if (kind === "completed" && recipientRole === "owner") {
    return `<div dir="rtl"><h2>اكتمل طلب السكن</h2><p>اكتمل طلب السكن المرتبط بعقار <strong>${title}</strong>.</p></div>`;
  }

  if (kind === "rejected" && recipientRole === "student") {
    return `<div dir="rtl"><h2>تحديث بشأن طلب المعاينة</h2><p>نعتذر، لم يتم قبول طلب معاينة عقار <strong>${title}</strong> من المالك في هذه المرة.</p><p>يمكنك استكشاف إعلانات أخرى موثقة على Sakan 4U.</p></div>`;
  }

  if (kind === "cancelled" && recipientRole === "student") {
    return `<div dir="rtl"><h2>تم إلغاء طلب المعاينة</h2><p>تم إلغاء طلب معاينة عقار <strong>${title}</strong>.</p><p>يمكنك استكشاف إعلانات أخرى على Sakan 4U.</p></div>`;
  }

  if (kind === "cancelled" && recipientRole === "owner") {
    return `<div dir="rtl"><h2>تم إلغاء طلب معاينة</h2><p>أُلغي طلب معاينة لعقار <strong>${title}</strong> من قبل الطالب أو الإدارة.</p></div>`;
  }

  if (kind === "rescheduled" && recipientRole === "student") {
    return `<div dir="rtl"><h2>تم تغيير موعد المعاينة</h2><p>تم تغيير موعد معاينة عقار <strong>${title}</strong> إلى ${requestedAt}.</p><p>يرجى متابعة التفاصيل من صفحة طلباتك.</p></div>`;
  }

  if (kind === "rescheduled" && recipientRole === "owner") {
    return `<div dir="rtl"><h2>تم تغيير موعد معاينة</h2><p>تم تغيير موعد معاينة عقار <strong>${title}</strong> إلى ${requestedAt}.</p></div>`;
  }

  return `<div dir="rtl"><p>تحديث بشأن طلب معاينة عقار <strong>${title}</strong>.</p></div>`;
}

async function sendToRecipient(
  kind: BookingNotificationKind,
  bookingId: string,
  recipientRole: RecipientRole,
  env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">,
): Promise<boolean> {
  if (shouldSkipInTest()) return false;
  try {
    const details = await db.getBookingNotificationDetails(bookingId);
    let email: string | null = null;
    if (recipientRole === "student") email = details.student.email;
    else if (recipientRole === "owner") email = details.owner.email;
    else email = null;

    if (!email) {
      console.error(new Error(`Booking ${kind} email recipient missing for booking ${bookingId} (${recipientRole})`));
      return false;
    }

    await sendEmail({
      to: email,
      subject: bookingSubject(kind, details.property.title),
      html: bookingHtml(kind, details, recipientRole),
    }, env);
    return true;
  } catch (error) {
    console.error(`[Booking email] ${kind} to ${recipientRole} failed for ${bookingId}:`, error);
    return false;
  }
}

export async function sendBookingNotification(kind: BookingNotificationKind, bookingId: string, env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">) {
  return sendToRecipient(kind, bookingId, "student", env);
}

export async function sendBookingNotificationToOwner(kind: BookingNotificationKind, bookingId: string, env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">) {
  return sendToRecipient(kind, bookingId, "owner", env);
}

export async function sendBookingNotificationToStudent(kind: BookingNotificationKind, bookingId: string, env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">) {
  return sendToRecipient(kind, bookingId, "student", env);
}
