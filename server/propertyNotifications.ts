import { supabaseAdmin } from "./supabase";
import { escapeEmailHtml, sendEmail } from "./email";
import type { SupabaseRuntimeEnv } from "./supabase";
import { getRuntimeEnvValue } from "./runtimeEnv";

function shouldSkipInTest(): boolean {
  return getRuntimeEnvValue("NODE_ENV") === "test";
}

type PropertyReviewDecision = "verified" | "needs_changes" | "rejected";

async function getPropertyAndOwner(propertyId: string) {
  const { data: property, error } = await supabaseAdmin
    .from("properties")
    .select("id, title, owner_id, review_reason")
    .eq("id", propertyId)
    .maybeSingle();
  if (error) throw error;
  if (!property) throw new Error("Property not found for notification");
  const { data: owner, error: ownerError } = await supabaseAdmin
    .from("profiles")
    .select("full_name, email")
    .eq("id", property.owner_id)
    .maybeSingle();
  if (ownerError) throw ownerError;
  if (!owner) throw new Error("Owner not found for notification");
  return { property, owner };
}

function reviewSubject(decision: PropertyReviewDecision, propertyTitle: string): string {
  if (decision === "verified") return `تم اعتماد إعلانك — ${propertyTitle}`;
  if (decision === "needs_changes") return `تعديل مطلوب على إعلانك — ${propertyTitle}`;
  return `تم رفض إعلانك — ${propertyTitle}`;
}

function reviewHtml(decision: PropertyReviewDecision, propertyTitle: string, reason?: string | null): string {
  const title = escapeEmailHtml(propertyTitle);
  const reasonHtml = reason ? `<p>ملاحظة الإدارة: ${escapeEmailHtml(reason)}</p>` : "";
  if (decision === "verified") {
    return `<div dir="rtl"><h2>تم اعتماد إعلانك</h2><p>تم اعتماد إعلان <strong>${title}</strong> وسيظهر للطلاب وفق حالته المتاحة.</p></div>`;
  }
  if (decision === "needs_changes") {
    return `<div dir="rtl"><h2>تعديل مطلوب على إعلانك</h2><p>يرجى مراجعة ملاحظة الإدارة على إعلان <strong>${title}</strong> ثم إعادة إرساله.</p>${reasonHtml}</div>`;
  }
  return `<div dir="rtl"><h2>تم رفض إعلانك</h2><p>تم رفض إعلان <strong>${title}</strong>. راجع ملاحظة الإدارة لمعرفة الخطوة التالية.</p>${reasonHtml}</div>`;
}

export async function sendPropertyReviewEmail(
  propertyId: string,
  decision: PropertyReviewDecision,
  reason: string | undefined,
  env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">,
): Promise<boolean> {
  if (shouldSkipInTest()) return false;
  try {
    const { property, owner } = await getPropertyAndOwner(propertyId);
    const email = owner.email;
    if (!email) {
      console.error(new Error(`Property review email: owner email missing for property ${propertyId}`));
      return false;
    }
    await sendEmail({
      to: email,
      subject: reviewSubject(decision, property.title),
      html: reviewHtml(decision, property.title, reason ?? property.review_reason),
    }, env);
    return true;
  } catch (error) {
    console.error(`[Property review email] ${decision} for ${propertyId} failed:`, error);
    return false;
  }
}

async function getStaffEmails(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .in("role", ["admin", "super_admin"])
    .not("email", "is", null);
  if (error) throw error;
  return (data ?? []).map((row: { email: string }) => row.email).filter(Boolean);
}

export async function sendPropertySubmittedEmail(
  propertyId: string,
  propertyTitle: string,
  env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">,
): Promise<boolean> {
  if (shouldSkipInTest()) return false;
  try {
    const emails = await getStaffEmails();
    if (!emails.length) return false;
    const title = escapeEmailHtml(propertyTitle);
    const html = `<div dir="rtl"><h2>عقار جديد ينتظر المراجعة</h2><p>يوجد إعلان جديد لعقار <strong>${title}</strong> يحتاج المراجعة.</p><p>يرجى الدخول إلى لوحة الإدارة لمراجعته.</p></div>`;
    for (const email of emails) {
      try {
        await sendEmail({ to: email, subject: `عقار جديد ينتظر المراجعة — ${propertyTitle}`, html }, env);
      } catch (err) {
        console.error(`[Property submitted email] to ${email} failed:`, err);
      }
    }
    return true;
  } catch (error) {
    console.error(`[Property submitted email] for ${propertyId} failed:`, error);
    return false;
  }
}

export async function sendOwnerLeadEmail(
  leadId: string,
  name: string,
  phone: string,
  area: string,
  env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">,
): Promise<boolean> {
  if (shouldSkipInTest()) return false;
  try {
    const emails = await getStaffEmails();
    if (!emails.length) return false;
    const leadName = escapeEmailHtml(name);
    const leadPhone = escapeEmailHtml(phone);
    const leadArea = escapeEmailHtml(area);
    const html = `<div dir="rtl"><h2>طلب مالك جديد</h2><p>اسم المالك: ${leadName}<br>رقم التواصل: ${leadPhone}<br>المنطقة: ${leadArea}</p><p>يرجى التواصل مع المالك لمتابعة طلب إضافة عقاره.</p></div>`;
    for (const email of emails) {
      try {
        await sendEmail({ to: email, subject: `طلب مالك جديد — ${name}`, html }, env);
      } catch (err) {
        console.error(`[Owner lead email] to ${email} failed:`, err);
      }
    }
    return true;
  } catch (error) {
    console.error(`[Owner lead email] for ${leadId} failed:`, error);
    return false;
  }
}
