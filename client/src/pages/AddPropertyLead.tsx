import { useState } from "react";
import SiteHeader from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { trpc } from "@/lib/trpc";
import { toast } from "@/lib/appToast";
import { CheckCircle2, LoaderCircle } from "lucide-react";
import { useLocation } from "wouter";

const areaOptions = ["صلاح سالم", "البرج", "بني سويف الجديدة", "منشأة السادات", "الواسطي", "ناصر", "ببا", "سمسطاط"];

export default function AddPropertyLead() {
  const [, navigate] = useLocation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [area, setArea] = useState("");
  const [propertyCount, setPropertyCount] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);
  const submit = trpc.leads.submitOwnerLead.useMutation({
    onSuccess: () => {
      toast.success("تم إرسال طلبك بنجاح. سيتواصل معك فريق Sakan 4U قريباً.");
      navigate("/");
    },
    onError: (error) => toast.error(error.message || "تعذر إرسال الطلب حالياً. حاول مرة أخرى."),
  });

  const canSubmit = name.trim().length >= 2 && phone.trim().length >= 6 && area.trim().length >= 2 && consent && !submit.isPending;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;
    submit.mutate({
      name: name.trim(),
      phone: phone.trim(),
      area: area.trim(),
      approximatePropertyCount: propertyCount ? Number(propertyCount) : undefined,
      notes: notes.trim() || undefined,
      consentAccepted: consent,
    });
  };

  return (
    <div dir="rtl" className="min-h-screen overflow-x-hidden bg-[#f8fafc] text-[#0f172a]">
      <SiteHeader />
      <section className="mx-auto max-w-2xl px-5 py-16 md:px-10">
        <div className="mb-8 text-center">
          <span className="text-xs font-black tracking-[.15em] text-[#2563eb]">طلبات الملاك</span>
          <h1 className="mt-2 text-3xl font-black">أضف عقارك</h1>
          <p className="mt-3 text-sm leading-7 text-[#6e8295]">سجّل بياناتك ودع فريق Sakan 4U يتواصل معك. لا تحتاج إلى حساب لإرسال طلبك.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 rounded-3xl border border-[#e2e8f0] bg-white p-6 shadow-[0_18px_45px_rgba(15,23,42,.08)] md:p-8">
          <div>
            <label className="mb-2 block text-sm font-black">الاسم <span className="text-[#b91c1c]">*</span></label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل" className="h-12 rounded-xl border-[#dbe4eb] text-sm" maxLength={160} />
          </div>
          <div>
            <label className="mb-2 block text-sm font-black">رقم الهاتف <span className="text-[#b91c1c]">*</span></label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" className="h-12 rounded-xl border-[#dbe4eb] text-sm" maxLength={32} inputMode="tel" />
          </div>
          <div>
            <label className="mb-2 block text-sm font-black">المنطقة <span className="text-[#b91c1c]">*</span></label>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="h-12 w-full rounded-xl border border-[#dbe4eb] bg-white px-3 text-sm font-semibold text-[#475569] outline-none focus:border-[#2563eb]">
              <option value="">اختر المنطقة</option>
              {areaOptions.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-black">عدد العقارات تقريباً</label>
            <select value={propertyCount} onChange={(e) => setPropertyCount(e.target.value)} className="h-12 w-full rounded-xl border border-[#dbe4eb] bg-white px-3 text-sm font-semibold text-[#475569] outline-none focus:border-[#2563eb]">
              <option value="">غير محدد</option>
              <option value="1">عقار واحد</option>
              <option value="2">عقاران</option>
              <option value="3">3 عقارات</option>
              <option value="5">5 عقارات أو أكثر</option>
              <option value="10">10 عقارات أو أكثر</option>
            </select>
          </div>
          <div>
            <label className="mb-2 block text-sm font-black">ملاحظات اختيارية</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="أي تفاصيل تود إضافتها..." className="min-h-24 rounded-xl border-[#dbe4eb] text-sm" maxLength={1000} />
          </div>
          <label className="flex items-start gap-2.5 text-sm font-semibold text-[#475569]">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>أوافق على التواصل معي من قبل فريق Sakan 4U بخصوص طلب إضافة عقاري وأعلم أن بياناتي تُستخدم لهذا الغرض فقط.</span>
          </label>
          <Button type="submit" disabled={!canSubmit} className="h-12 w-full rounded-xl bg-[#2563eb] font-extrabold text-white shadow-[0_8px_20px_rgba(37,99,235,.2)] transition hover:bg-[#1d4ed8]">
            {submit.isPending ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ الإرسال...</> : <><CheckCircle2 className="ml-2 h-4 w-4" />إرسال الطلب</>}
          </Button>
        </form>
      </section>
    </div>
  );
}
