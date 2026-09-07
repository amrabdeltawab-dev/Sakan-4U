import * as db from "./db";
import { escapeEmailHtml, sendEmail } from "./email";
import type { SupabaseRuntimeEnv } from "./supabase";
import { getRuntimeEnvValue } from "./runtimeEnv";

type BookingNotificationKind = "new_request" | "accepted" | "rejected";

function notificationSubject(kind: BookingNotificationKind, propertyTitle: string) {
  if (kind === "new_request") return `New Booking Request for ${propertyTitle}`;
  if (kind === "accepted") return `Your booking was accepted - ${propertyTitle}`;
  return `Booking request update - ${propertyTitle}`;
}

function notificationHtml(kind: BookingNotificationKind, details: Awaited<ReturnType<typeof db.getBookingNotificationDetails>>) {
  const title = escapeEmailHtml(details.property.title);
  const studentName = escapeEmailHtml(details.student.name);
  const studentPhone = escapeEmailHtml(details.student.phone);
  const ownerName = escapeEmailHtml(details.owner.name);
  const requestedAt = escapeEmailHtml(details.requestedViewingAt);

  if (kind === "new_request") {
    return `<div dir="rtl"><h2>طلب معاينة جديد على Sakan 4U</h2><p>يوجد طلب معاينة جديد لعقار <strong>${title}</strong>.</p><p>اسم الطالب: ${studentName}<br>رقم التواصل: ${studentPhone}<br>الموعد المطلوب: ${requestedAt}</p><p>يرجى الدخول إلى لوحة التحكم لمراجعة الطلب.</p></div>`;
  }

  if (kind === "accepted") {
    return `<div dir="rtl"><h2>تم قبول طلب المعاينة</h2><p>تم قبول طلبك لمعاينة عقار <strong>${title}</strong>.</p><p>المالك: ${ownerName}<br>الموعد: ${requestedAt}</p><p>يمكنك متابعة التفاصيل من صفحة طلباتك على Sakan 4U.</p></div>`;
  }

  return `<div dir="rtl"><h2>تحديث بشأن طلب المعاينة</h2><p>نعتذر، لم يتم قبول طلب معاينة عقار <strong>${title}</strong> من المالك في هذه المرة.</p><p>يمكنك استكشاف إعلانات أخرى موثقة على Sakan 4U.</p></div>`;
}

export async function sendBookingNotification(kind: BookingNotificationKind, bookingId: string, env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">) {
  if (getRuntimeEnvValue("NODE_ENV") === "test") return false;
  try {
    const details = await db.getBookingNotificationDetails(bookingId);
    const recipient = kind === "new_request" ? details.owner.email : details.student.email;
    if (!recipient) {
      console.error(new Error(`Booking notification recipient email is missing for ${bookingId}`));
      return false;
    }

    await sendEmail({
      to: recipient,
      subject: notificationSubject(kind, details.property.title),
      html: notificationHtml(kind, details),
    }, env);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
