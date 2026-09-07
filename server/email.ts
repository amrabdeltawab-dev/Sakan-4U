import type { SupabaseRuntimeEnv } from "./supabase";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult = {
  id: string;
};

export async function sendEmail(input: SendEmailInput, env: Pick<SupabaseRuntimeEnv, "RESEND_API_KEY">): Promise<SendEmailResult> {
  const apiKey = env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is missing");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "onboarding@resend.dev",
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(`Resend email request failed (${response.status}): ${responseText.slice(0, 300)}`);
  }

  const payload = await response.json() as { id?: string };
  if (!payload.id) throw new Error("Resend email response did not include an id");
  return { id: payload.id };
}

export function escapeEmailHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
