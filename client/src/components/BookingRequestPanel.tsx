import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { canSubmitInspectionRequest, inspectionFeePresentation } from "@/lib/inspectionFee";
import type { PropertyView } from "@/lib/marketplace";
import { trpc } from "@/lib/trpc";
import { actionErrorMessages } from "@/lib/errorMessages";
import { showActionError, toast } from "@/lib/appToast";
import { LoadingButton } from "@/components/LoadingButton";

const activeStatuses = ["pending", "contacted", "owner_confirmed", "student_confirmed"];

export function BookingRequestPanel({ property, isDemo }: { property: PropertyView; isDemo: boolean }) {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const bookings = trpc.bookings.mine.useQuery(undefined, { enabled: user?.appRole === "student" });
  const [submitted, setSubmitted] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [form, setForm] = useState({ name: user?.name ?? "", phone: user?.phone ?? "", peopleCount: 1, requestedViewingAt: new Date(Date.now() + 86_400_000).toISOString().slice(0, 16), notes: "" });
  const feeQuote = trpc.bookings.viewingFeeQuote.useQuery({ propertyId: String(property.id) }, { enabled: !isDemo });
  const create = trpc.bookings.create.useMutation({
    onSuccess: () => { setSubmitted(true); void utils.bookings.mine.invalidate(); toast.success(property.rentType === "bed" ? "تم إرسال طلب السرير بنجاح" : "تم إرسال طلب المعاينة بنجاح"); toast.success('Email sent successfully!'); },
    onError: error => showActionError(error, actionErrorMessages.booking),
  });
  const active = bookings.data?.find((item: any) => String(item.propertyId) === String(property.id) && activeStatuses.includes(item.status));
  const feeState = inspectionFeePresentation({ feeAmount: feeQuote.data?.feeAmount, isLoading: feeQuote.isLoading, hasError: feeQuote.isError });
  const maySubmit = canSubmitInspectionRequest({ feeAmount: feeQuote.data?.feeAmount, isLoading: feeQuote.isLoading, hasError: feeQuote.isError, name: form.name, phone: form.phone, requestedViewingAt: form.requestedViewingAt, isSubmitting: create.isPending }) && termsAccepted;
  const isBedRental = property.rentType === "bed";
  const requestLabel = isBedRental ? "طلب سرير" : "طلب معاينة";
  const confirmationLabel = isBedRental ? "تأكيد طلب السرير" : "تأكيد طلب المعاينة";
  const soldOut = isBedRental && (property.availableBeds ?? 0) < 1;
  const feePanelClass = feeState.detail && feeQuote.isError ? "bg-[#fff0ee] text-[#a8482d]" : "bg-[#fff5df] text-[#81530c]";
  const contactGridClass = isBedRental ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3";

  if (isDemo) return <div className="rounded-2xl border border-dashed border-[#d3dde5] bg-[#f8fafc] p-4 text-sm leading-6 text-[#6b8195]"><b className="block text-[#0f172a]">إعلان تمثيلي للواجهة</b><span>طلب المعاينة يصبح متاحاً فور نشر مالك إعلاناً حقيقياً ومراجعته من الإدارة.</span></div>;
  if (soldOut) return <div className="rounded-2xl border border-[#dce4eb] bg-[#f8fafc] p-4 text-sm leading-6 text-[#64748b]"><b className="block text-[#0f172a]">اكتملت الأسرة المتاحة</b><span className="mt-1 block">لا توجد أسرة متاحة حالياً في هذا السكن المشترك، لذلك لا يمكن إرسال طلب سرير جديد.</span><Button disabled className="mt-3 h-11 w-full rounded-xl bg-[#94a3b8] font-extrabold text-white opacity-100">طلب سرير</Button></div>;
  if (property.availabilityStatus === "RESERVED") return <div className="rounded-2xl border border-[#f2d39a] bg-[#fff8e9] p-4 text-sm leading-6 text-[#8c5b0d]"><b className="block">محجوزة لمعاينة قادمة</b><span className="mt-1 block">هذا العقار مرتبط بمعاينة قادمة حالياً، لذلك لا يمكن إرسال طلب معاينة جديد الآن.</span><Button disabled className="mt-3 h-11 w-full rounded-xl bg-[#c99b48] font-extrabold text-white opacity-100">{requestLabel}</Button></div>;
  if (!isAuthenticated) return <Dialog><DialogTrigger asChild><Button className="h-12 w-full rounded-xl bg-[#2563eb] font-extrabold text-white hover:bg-[#1d4ed8]">{requestLabel}</Button></DialogTrigger><DialogContent dir="rtl" className="max-w-md rounded-[24px]"><DialogHeader><DialogTitle className="text-right text-xl font-black">سجّل الدخول لـ{requestLabel}</DialogTitle><DialogDescription className="text-right leading-6">أنشئ حساب طالب أو سجّل الدخول أولاً، ثم ستعود إلى هذا الإعلان لإرسال طلب آمن عبر Sakan 4U.</DialogDescription></DialogHeader><Link href={`/login?returnTo=${encodeURIComponent(`/property/${property.id}`)}`} className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#0f172a] font-extrabold text-white hover:bg-[#1e3a8a]">الانتقال إلى تسجيل الدخول</Link></DialogContent></Dialog>;
  if (user?.appRole !== "student") return <div className="rounded-2xl bg-[#f8fafc] p-4 text-sm leading-6 text-[#475569]">{requestLabel} متاح لحسابات الطلاب فقط. يمكنك إدارة إعلاناتك وطلباتك من مساحة العمل المناسبة.</div>;
  if (submitted) return <div className="rounded-2xl bg-[#eaf7ef] p-4 text-sm leading-6 text-[#059669]"><b className="block">تم إرسال {isBedRental ? "طلب السرير" : "طلب المعاينة"} وحالته الآن: بانتظار المتابعة.</b><span className="mt-1 block">يتولى Sakan 4U تنسيق الخطوات ولا يشارك بيانات الاتصال المباشرة مع المالك في هذه المرحلة.</span><Link href="/account" className="mt-3 inline-flex font-extrabold text-[#0f172a]">عرض طلباتي</Link></div>;
  if (active) return <div className="rounded-2xl bg-[#fff5df] p-4 text-sm leading-6 text-[#98600c]"><b className="block">لديك {isBedRental ? "طلب سرير" : "طلب معاينة"} نشط لهذا العقار.</b><span className="mt-1 block">تابع حالة الرسوم والموعد والخطوة التالية من صفحة طلباتك.</span><Link href="/account" className="mt-3 inline-flex font-extrabold text-[#0f172a]">عرض طلباتي</Link></div>;

  return <Dialog>
    <DialogTrigger asChild><Button className="h-12 w-full rounded-xl bg-[#2563eb] font-extrabold text-white hover:bg-[#1d4ed8]">{requestLabel}</Button></DialogTrigger>
    <DialogContent dir="rtl" className="max-h-[92vh] max-w-md overflow-y-auto rounded-[24px]">
      <DialogHeader><DialogTitle className="text-right text-xl font-black">{isBedRental ? "طلب سرير عبر Sakan 4U" : "طلب معاينة عبر Sakan 4U"}</DialogTitle><DialogDescription className="text-right leading-6">{isBedRental ? `طلبك لسرير واحد من الأسرة المتاحة حالياً (${property.availableBeds ?? 0}).` : "طلب المعاينة لا يعني حجز العقار نهائياً."} ينظم Sakan 4U التواصل والموعد قبل مشاركة أي بيانات اتصال مباشرة.</DialogDescription></DialogHeader>
      <div className="space-y-4 py-3">
        <div className={`rounded-2xl p-4 text-right text-sm leading-6 ${feePanelClass}`}><b className="block">{feeState.message}</b><span className="mt-1 block">{feeState.detail ?? "تُدفع قبل المعاينة. إذا قبلت العقار بعد المعاينة، تُحتسب ضمن تكلفة خدمة/حجز Sakan 4U النهائية. وإذا لم يناسبك العقار بعد المعاينة فهي غير قابلة للاسترداد مقابل خدمة المعاينة والوساطة، وليست وديعة إيجار."}</span></div>
        <Input value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} placeholder="الاسم — داخلي لفريق Sakan 4U فقط" className="h-11 rounded-xl" />
        <Input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} placeholder="رقم الهاتف — لا يظهر للمالك" className="h-11 rounded-xl" />
        <div className={contactGridClass}>{!isBedRental && <label className="text-sm font-bold">عدد الأفراد<select value={form.peopleCount} onChange={event => setForm({ ...form, peopleCount: Number(event.target.value) })} className="mt-2 h-10 w-full rounded-xl border border-[#dce4eb] bg-white px-3 text-sm"><option value="1">شخص واحد</option><option value="2">شخصان</option><option value="3">3 أفراد</option></select></label>}<label className="text-sm font-bold">موعد معاينة مقترح<Input value={form.requestedViewingAt} onChange={event => setForm({ ...form, requestedViewingAt: event.target.value })} type="datetime-local" className="mt-2 h-10 rounded-xl" /></label></div>
        <Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="ملاحظة لفريق Sakan 4U للتنسيق فقط (اختياري)" className="min-h-24 rounded-xl" />
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#dce7ee] bg-[#f8fafc] p-3 text-right text-xs font-bold leading-6 text-[#405b70]"><Checkbox checked={termsAccepted} onCheckedChange={checked => setTermsAccepted(checked === true)} className="mt-0.5 shrink-0" />أوافق على شروط المعاينة، وقواعد التنسيق، وأقر بأن منصة Sakan 4U هي جهة تنسيق ووساطة إعلانية وليست طرفاً في عقد الإيجار النهائي.</label>
        <LoadingButton onClick={() => create.mutate({ propertyId: String(property.id), requestedViewingAt: new Date(form.requestedViewingAt).toISOString(), name: form.name, phone: form.phone, peopleCount: isBedRental ? 1 : form.peopleCount, notes: form.notes || undefined, termsAccepted })} loading={create.isPending} loadingLabel="جارٍ إرسال الطلب..." disabled={!maySubmit} className="h-11 w-full rounded-xl bg-[#2563eb] font-extrabold hover:bg-[#1d4ed8]">{confirmationLabel}</LoadingButton>
      </div>
    </DialogContent>
  </Dialog>;
}
