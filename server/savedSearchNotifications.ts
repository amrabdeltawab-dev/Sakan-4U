import { escapeEmailHtml, sendEmail } from "./email";
import { supabaseAdmin, type SupabaseRuntimeEnv } from "./supabase";
import { getRuntimeEnvValue } from "./runtimeEnv";

function shouldSkipInTest(): boolean {
  return getRuntimeEnvValue("NODE_ENV") === "test";
}

export async function sendSavedSearchMatchEmails(
  propertyId: string,
  matchCount: number,
  env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">,
): Promise<boolean> {
  if (shouldSkipInTest()) return false;
  if (matchCount === 0) return false;
  try {
    const { data: property, error: propError } = await supabaseAdmin
      .from("properties")
      .select("title, area, monthly_price")
      .eq("id", propertyId)
      .maybeSingle();
    if (propError || !property) return false;

    const { data: searches, error: searchError } = await supabaseAdmin
      .from("saved_searches")
      .select("student_id, profiles!inner(email)")
      .eq("active", true);
    if (searchError) return false;

    const title = escapeEmailHtml(property.title);
    const area = escapeEmailHtml(property.area ?? "");
    const price = Number(property.monthly_price ?? 0).toLocaleString("ar-EG");
    const subject = `إعلان جديد مطابق لبحثك المحفوظ — ${property.title}`;
    const html = `<div dir="rtl"><h2>إعلان جديد مطابق لبحثك المحفوظ</h2><p>تم نشر عقار <strong>${title}</strong> في ${area} بسعر ${price} جنيه/شهرياً، وهو مطابق لمعايير البحث الذي حفظته على Sakan 4U.</p><p>يمكنك عرض الإعلان وإرسال طلب معاينة من المنصة.</p></div>`;

    let sent = 0;
    for (const search of (searches ?? []) as any[]) {
      const email = search.profiles?.email;
      if (!email) continue;
      try {
        await sendEmail({ to: email, subject, html }, env);
        sent += 1;
      } catch (err) {
        console.error(`[Saved-search email] failed for student ${search.student_id}:`, err);
      }
    }
    return sent > 0;
  } catch (error) {
    console.error(`[Saved-search email] failed for property ${propertyId}:`, error);
    return false;
  }
}
