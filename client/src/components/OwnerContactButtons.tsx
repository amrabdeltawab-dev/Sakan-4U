import { Phone, MessageCircle } from "lucide-react";

function normalizeEgyptianPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  const international = digits.startsWith("0") ? `20${digits.slice(1)}` : digits;
  if (international.length < 8) return null;
  return international;
}

export function buildTelHref(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("0") ? `+20${digits.slice(1)}` : digits.startsWith("20") ? `+${digits}` : digits;
  return `tel:${normalized}`;
}

export function buildWhatsAppHref(phone: string, message?: string): string | null {
  const international = normalizeEgyptianPhone(phone);
  if (!international) return null;
  const text = message ?? "أهلاً بك من منصة Sakan 4U بخصوص عقارك.";
  return `https://wa.me/${international}?text=${encodeURIComponent(text)}`;
}

export function OwnerContactButtons({ phone, fullName, contextLabel }: { phone?: string | null; fullName?: string | null; contextLabel?: string }) {
  if (!phone) return null;
  const telHref = buildTelHref(phone);
  const waHref = buildWhatsAppHref(phone, contextLabel ? `أهلاً بك من منصة Sakan 4U بخصوص ${contextLabel}.` : undefined);
  const recipient = fullName ?? "المالك";
  return (
    <div className="flex flex-wrap gap-2">
      {telHref && (
        <a href={telHref} aria-label={`اتصال بـ ${recipient}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#eff6ff] px-3 text-xs font-extrabold text-[#2563eb] transition hover:bg-[#dbeafe]">
          <Phone className="h-3.5 w-3.5" />اتصال
        </a>
      )}
      {waHref && (
        <a href={waHref} target="_blank" rel="noreferrer" aria-label={`واتساب مع ${recipient}`} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#e7f6ef] px-3 text-xs font-extrabold text-[#059669] transition hover:bg-[#d7f0e3]">
          <MessageCircle className="h-3.5 w-3.5" />واتساب
        </a>
      )}
    </div>
  );
}

export { normalizeEgyptianPhone };
