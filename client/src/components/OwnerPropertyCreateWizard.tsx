import { useState } from "react";
import { MapView } from "@/components/Map";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MIN_PROPERTY_PHOTOS, PropertyPhotoPicker, type PhotoSubmissionState, type PropertyPhotoDraft } from "@/components/PropertyPhotoPicker";
import { amenityOptions } from "@/lib/marketplace";
import { trpc } from "@/lib/trpc";
import { compressPropertyImage } from "@/lib/propertyImageCompression";
import { LoaderCircle, MapPin, Plus, Send } from "lucide-react";
import { actionErrorMessages } from "@/lib/errorMessages";
import { showActionError, toast } from "@/lib/appToast";

const BENI_SUEF_CENTER = { lat: 29.0661, lng: 31.0994 };
const minimumDescriptionLength = 20;
const normalizePastedDescription = (value: string) => value.replace(/\s+/g, " ").trim();

export function OwnerPropertyCreateWizard({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [photos, setPhotos] = useState<PropertyPhotoDraft[]>([]);
  const [submission, setSubmission] = useState<PhotoSubmissionState>({ phase: "waiting" });
  const [nationalIdDocument, setNationalIdDocument] = useState<File | null>(null);
  const [ownershipEvidence, setOwnershipEvidence] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "", propertyType: "apartment" as "apartment" | "studio" | "room" | "shared_room", governorate: "بني سويف", city: "بني سويف", area: "", street: "", exactLat: null as number | null, exactLng: null as number | null,
    description: "", monthlyPrice: "", bedrooms: "", bathrooms: "1", capacity: "", rentType: "full" as "full" | "bed", totalBeds: "", genderPreference: "anyone" as "male" | "female" | "anyone", distanceToCampus: "", utilitiesIncluded: [] as string[], videoUrl: "", furnished: true, amenities: [] as string[],
  });

  const exactSelected = Number.isFinite(form.exactLat) && Number.isFinite(form.exactLng);
  const normalizedDescription = form.description.trim();
  const validDescription = normalizedDescription.length >= minimumDescriptionLength;
  const capacity = Number(form.capacity);
  const totalBeds = Number(form.totalBeds);
  const bathrooms = Number(form.bathrooms);
  const bedrooms = Number(form.bedrooms);
  const monthlyPrice = Number(form.monthlyPrice);
  const validBathrooms = Number.isInteger(bathrooms) && bathrooms >= 1;
  const validCoreDetails = Number.isInteger(monthlyPrice) && monthlyPrice > 0 && Number.isInteger(bedrooms) && bedrooms > 0 && validBathrooms && Number.isInteger(capacity) && capacity > 0;
  const validRentConfiguration = form.rentType === "full" || (Number.isInteger(totalBeds) && totalBeds > 0 && totalBeds <= capacity);
  const validGenderPreference = form.rentType === "full" ? ["male", "female", "anyone"].includes(form.genderPreference) : ["male", "female"].includes(form.genderPreference);
  const validVideoUrl = !form.videoUrl.trim() || (() => { try { const host = new URL(form.videoUrl.trim()).hostname.toLowerCase(); return ["youtube.com", "youtu.be", "vimeo.com"].some(domain => host === domain || host.endsWith(`.${domain}`)); } catch { return false; } })();
  const payload = () => ({ ...form, exactLat: form.exactLat ?? Number.NaN, exactLng: form.exactLng ?? Number.NaN, approximateLocation: form.area, description: normalizedDescription, monthlyPrice, bedrooms, bathrooms, capacity, totalBeds: form.rentType === "bed" ? totalBeds : null, videoUrl: form.videoUrl.trim() || null, utilitiesIncluded: form.utilitiesIncluded, genderPreference: form.genderPreference });
  const stepReady = step === 1 ? Boolean(form.title && form.area && exactSelected) : step === 2 ? Boolean(validCoreDetails && validDescription && validRentConfiguration && validGenderPreference && validVideoUrl) : step === 3 ? form.amenities.length > 0 : photos.length >= MIN_PROPERTY_PHOTOS && Boolean(nationalIdDocument);
  const draftReady = Boolean(form.title && form.area && exactSelected && validCoreDetails && validDescription && validRentConfiguration && validGenderPreference && validVideoUrl && form.amenities.length);

  const createDraft = trpc.properties.createDraft.useMutation({ onSuccess: () => { toast.success("تم حفظ العقار كمسودة مع موقعه الخاص."); onCreated(); setOpen(false); }, onError: error => showActionError(error, actionErrorMessages.property) });
  const submit = trpc.properties.submitWithPhotos.useMutation({ onMutate: () => setSubmission({ phase: "uploading" }), onSuccess: () => { toast.success("تم إرسال العقار وصوره للمراجعة بنجاح."); onCreated(); setSubmission({ phase: "uploaded" }); setOpen(false); setStep(1); setPhotos([]); setNationalIdDocument(null); setOwnershipEvidence(null); }, onError: error => { showActionError(error, actionErrorMessages.property); setSubmission({ phase: "failed" }); } });
  const toggleAmenity = (amenity: string) => setForm(current => ({ ...current, amenities: current.amenities.includes(amenity) ? current.amenities.filter(value => value !== amenity) : [...current.amenities, amenity] }));
  const encode = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(new Error("تعذر قراءة إحدى الصور المختارة.")); reader.readAsDataURL(file); });
  const selectVerificationDocument = (file: File | null, kind: "national_id" | "ownership_evidence") => {
    if (!file) return kind === "national_id" ? setNationalIdDocument(null) : setOwnershipEvidence(null);
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) return setFormError("ارفع ملف PDF أو صورة JPEG أو PNG فقط.");
    if (file.size > 5 * 1024 * 1024) return setFormError("يجب ألا يتجاوز مستند التحقق 5 ميجابايت.");
    setFormError(null);
    kind === "national_id" ? setNationalIdDocument(file) : setOwnershipEvidence(file);
  };
  const reportSubmitError = (message: string, nextStep: number) => { setStep(nextStep); setFormError(message); toast.error(message); };
  const send = async () => {
    setFormError(null);
    if (!exactSelected) return reportSubmitError("حدد موقع مبنى العقار بدبوس على الخريطة قبل الإرسال.", 1);
    if (!validCoreDetails || !validDescription || !validRentConfiguration || !validGenderPreference || !validVideoUrl) return reportSubmitError(!validBathrooms ? "يرجى إدخال عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل." : !validGenderPreference ? "اختر شباب أو طالبات لتأجير العقار بالسرير؛ لا يمكن اختيار مناسب للجميع." : !validVideoUrl ? "استخدم رابط فيديو من YouTube أو Vimeo فقط." : validRentConfiguration ? "يرجى التأكد من إدخال جميع الحقول الإجبارية بشكل صحيح." : "أدخل عدد الأسرة المتاحة بشكل صحيح قبل الإرسال.", 2);
    if (!nationalIdDocument) return reportSubmitError("ارفع صورة البطاقة الشخصية قبل إرسال العقار للمراجعة.", 4);
    try {
      const encoded = await Promise.all(photos.map(async photo => {
        const compressed = photo.file.type === "image/webp" && photo.file.size <= 500 * 1024 ? photo.file : await compressPropertyImage(photo.file);
        return { name: compressed.name, mimeType: compressed.type as "image/jpeg" | "image/png" | "image/webp", dataBase64: await encode(compressed), description: photo.description || undefined, tag: photo.tag || undefined };
      }));
      const encodeDocument = async (file: File, kind: "national_id" | "ownership_evidence") => ({ name: file.name, mimeType: file.type as "application/pdf" | "image/jpeg" | "image/png", dataBase64: await encode(file), kind });
      submit.mutate({ property: payload(), photos: encoded, nationalIdDocument: await encodeDocument(nationalIdDocument, "national_id"), ownershipEvidence: ownershipEvidence ? await encodeDocument(ownershipEvidence, "ownership_evidence") : undefined });
    } catch (error) { const message = "تعذر تجهيز الصور أو مستندات التحقق للإرسال."; setFormError(message); showActionError(error, actionErrorMessages.upload); }
  };

  return <Dialog open={open} onOpenChange={next => { if (!submit.isPending && !createDraft.isPending) setOpen(next); }}>
    <DialogTrigger asChild><Button className="h-11 rounded-xl bg-[#2563eb] px-5 font-extrabold hover:bg-[#1d4ed8]"><Plus className="ml-2 h-4 w-4" />إضافة عقار</Button></DialogTrigger>
    <DialogContent dir="rtl" className="max-h-[92vh] max-w-2xl overflow-y-auto rounded-[24px]">
      <DialogHeader><DialogTitle className="text-right text-xl font-black">إضافة عقار وصور للمراجعة</DialogTitle><p className="text-right text-sm leading-6 text-[#64748b]">الخطوة {step} من 4 — يبقى دبوس المبنى خاصاً ويُستخدم فقط للتحقق وتمويه الموقع العام.</p></DialogHeader>
      <div className="my-3 h-1.5 overflow-hidden rounded-full bg-[#edf1f4]"><div className="h-full bg-[#2563eb] transition-all" style={{ width: `${step * 25}%` }} /></div>{formError && <p role="alert" className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-sm font-bold leading-6 text-[#b91c1c]">{formError}</p>}
      {step === 1 && <section className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-bold sm:col-span-2">عنوان الإعلان<Input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} className="mt-2" placeholder="مثال: شقة هادئة قرب الجامعة" /></label><label className="block text-sm font-bold">المنطقة<Input value={form.area} onChange={event => setForm({ ...form, area: event.target.value })} className="mt-2" placeholder="مثال: صلاح سالم" /></label><label className="block text-sm font-bold">الشارع (داخلي فقط)<Input value={form.street} onChange={event => setForm({ ...form, street: event.target.value })} className="mt-2" placeholder="لا يظهر علناً" /></label></div>
        <div className="overflow-hidden rounded-2xl border border-[#cbd5e1]"><MapView initialCenter={BENI_SUEF_CENTER} initialZoom={13} className="h-64" onMapReady={map => { let marker: google.maps.Marker | null = null; map.addListener("click", (event: google.maps.MapMouseEvent) => { const point = event.latLng?.toJSON(); if (!point) return; if (!marker) marker = new google.maps.Marker({ map, position: point, title: "موقع المبنى الخاص" }); else marker.setPosition(point); setForm(current => ({ ...current, exactLat: point.lat, exactLng: point.lng })); }); }} /></div>
        <p className={`flex items-start gap-2 rounded-xl p-3 text-xs font-bold leading-6 ${exactSelected ? "bg-[#e7f6ef] text-[#059669]" : "bg-[#eff6ff] text-[#b91c1c]"}`}><MapPin className="mt-0.5 h-4 w-4 shrink-0" />{exactSelected ? "تم تحديد موقع المبنى. سيُحفظ خاصاً ولا يظهر للطلاب." : "اضغط على الخريطة لإسقاط دبوس على موقع مبنى العقار. هذا الحقل إلزامي."}</p>
      </section>}
      {step === 2 && <section className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><p className="mb-2 text-sm font-bold">طريقة التأجير</p><div className="grid grid-cols-2 gap-2 rounded-xl border border-[#dbeafe] bg-[#f8fafc] p-1"><button type="button" aria-pressed={form.rentType === "full"} onClick={() => setForm(current => ({ ...current, rentType: "full", totalBeds: "" }))} className={`h-11 rounded-lg text-sm font-extrabold transition ${form.rentType === "full" ? "bg-[#2563eb] text-white shadow-sm" : "text-[#475569] hover:text-[#2563eb]"}`}>تأجير الشقة كاملة</button><button type="button" aria-pressed={form.rentType === "bed"} onClick={() => setForm(current => ({ ...current, rentType: "bed" }))} className={`h-11 rounded-lg text-sm font-extrabold transition ${form.rentType === "bed" ? "bg-[#2563eb] text-white shadow-sm" : "text-[#475569] hover:text-[#2563eb]"}`}>تأجير بالسرير</button></div></div>
        <label className="block text-sm font-bold">{form.rentType === "bed" ? "سعر السرير الشهري بالجنيه" : "السعر الشهري للشقة بالجنيه"}<Input value={form.monthlyPrice} onChange={event => setForm({ ...form, monthlyPrice: event.target.value })} className="mt-2" type="number" /></label>
        <label className="block text-sm font-bold">السعة الكلية<Input value={form.capacity} onChange={event => setForm({ ...form, capacity: event.target.value })} className="mt-2" type="number" /></label>
        {form.rentType === "bed" && <label className="block text-sm font-bold sm:col-span-2">إجمالي الأسرة المتاحة<Input value={form.totalBeds} onChange={event => setForm({ ...form, totalBeds: event.target.value })} className="mt-2" type="number" min="1" max={form.capacity || undefined} /><p className="mt-1 text-xs text-[#64748b]">يجب ألا يزيد عدد الأسرة المتاحة عن السعة الكلية للعقار.</p></label>}
        <label className="block text-sm font-bold sm:col-span-2">الفئة المناسبة للسكن<select value={form.genderPreference} onChange={event => setForm({ ...form, genderPreference: event.target.value as "male" | "female" | "anyone" })} className="mt-2 h-11 w-full rounded-xl border border-[#dbe4eb] bg-white px-3 text-sm font-bold text-[#475569]"><option value="male">شباب</option><option value="female">طالبات</option>{form.rentType === "full" && <option value="anyone">مناسب للجميع</option>}</select><p className="mt-1 text-xs font-bold text-[#64748b]">{form.rentType === "bed" ? "إجباري للتأجير بالسرير: اختر شباب أو طالبات فقط." : "يمكن اختيار مناسب للجميع عند تأجير الشقة كاملة."}</p></label>
        <label className="block text-sm font-bold">عدد الغرف<Input value={form.bedrooms} onChange={event => setForm({ ...form, bedrooms: event.target.value })} className="mt-2" type="number" min="1" /></label><label className="block text-sm font-bold">عدد الحمامات<Input value={form.bathrooms} onChange={event => setForm({ ...form, bathrooms: event.target.value })} className="mt-2" type="number" min="1" aria-invalid={!validBathrooms} />{!validBathrooms && <p className="mt-1 text-xs font-bold text-[#b91c1c]">أدخل عدداً صحيحاً للحمامات، بحد أدنى حمام واحد.</p>}</label>
        <label className="block text-sm font-bold">المسافة إلى الجامعة<Input value={form.distanceToCampus} onChange={event => setForm({ ...form, distanceToCampus: event.target.value })} className="mt-2" placeholder="مثال: 10 دقائق مشياً" /></label>
        <label className="block text-sm font-bold">رابط فيديو العقار (اختياري)<Input value={form.videoUrl} onChange={event => setForm({ ...form, videoUrl: event.target.value })} className="mt-2" type="url" placeholder="YouTube أو Vimeo" /></label>
        <div className="sm:col-span-2"><p className="mb-2 text-sm font-bold">المرافق المشمولة في السعر (اختياري)</p><div className="grid gap-2 sm:grid-cols-3">{(["الكهرباء", "المياه", "الغاز", "الإنترنت", "التنظيف"] as string[]).map(utility => <label key={utility} className="flex items-center gap-2 rounded-xl border border-[#e2e8ee] bg-white p-2.5 text-xs font-bold"><Checkbox checked={form.utilitiesIncluded.includes(utility)} onCheckedChange={checked => setForm(current => ({ ...current, utilitiesIncluded: checked ? [...current.utilitiesIncluded, utility] : current.utilitiesIncluded.filter(value => value !== utility) }))} />{utility}</label>)}</div></div>
        <label className="block text-sm font-bold sm:col-span-2">وصف العقار<Textarea value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} onPaste={event => { event.preventDefault(); const pasted = normalizePastedDescription(event.clipboardData.getData("text")); if (pasted) setForm(current => ({ ...current, description: `${current.description} ${pasted}`.trim() })); }} className="mt-2 min-h-28" /><p className="mt-2 text-xs font-bold leading-5 text-[#b91c1c]">تنبيه: لا تقم بكتابة العنوان الدقيق (رقم العمارة) أو أرقام الهواتف في الوصف لحماية خصوصيتك. سيتم مراجعة الوصف.</p><p className="mt-1 text-xs text-[#64748b]">الوصف مطلوب: {minimumDescriptionLength} حرفاً واضحاً على الأقل. العدد الحالي: {normalizedDescription.length}.</p></label><label className="flex items-center gap-3 text-sm font-bold"><Checkbox checked={form.furnished} onCheckedChange={checked => setForm({ ...form, furnished: Boolean(checked) })} />العقار مفروش</label>
      </section>}
      {step === 3 && <section><p className="mb-4 text-sm font-bold">اختر التجهيزات المتاحة</p><div className="grid gap-3 sm:grid-cols-2">{amenityOptions.map(amenity => <label key={amenity} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#e2e8ee] p-3 text-sm font-bold"><Checkbox checked={form.amenities.includes(amenity)} onCheckedChange={() => toggleAmenity(amenity)} />{amenity}</label>)}</div></section>}
      {step === 4 && <section className="space-y-4"><PropertyPhotoPicker disabled={submit.isPending || submission.phase === "uploaded"} onChange={setPhotos} submissionState={submission} /><VerificationUpload title="صورة البطاقة الشخصية (إجباري)" copy="تُحفظ البطاقة بشكل خاص ولا تظهر للعامة؛ يراجعها Admin أو Super Admin فقط للتحقق من هوية المالك." required file={nationalIdDocument} pending={submit.isPending} onChange={file => selectVerificationDocument(file, "national_id")} /><VerificationUpload title="فاتورة مرافق أو عقد ملكية (اختياري)" copy="يمكنك إضافة مستند داعم للعقار. يُحفظ بشكل خاص ولا يظهر للعامة." file={ownershipEvidence} pending={submit.isPending} onChange={file => selectVerificationDocument(file, "ownership_evidence")} /></section>}
      <div className="mt-5 flex justify-end"><Button type="button" variant="outline" onClick={() => createDraft.mutate(payload())} disabled={!draftReady || createDraft.isPending || submit.isPending} className="h-10 rounded-xl text-xs font-bold">{createDraft.isPending ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ الحفظ...</> : "حفظ كمسودة"}</Button></div>
      <div className="mt-4 flex justify-between gap-3">{step > 1 ? <Button type="button" variant="outline" onClick={() => setStep(step - 1)} className="h-10 rounded-xl">السابق</Button> : <span />}{step < 4 ? <Button type="button" onClick={() => setStep(step + 1)} disabled={!stepReady || submit.isPending || createDraft.isPending} className="h-10 rounded-xl bg-[#0f172a] font-extrabold hover:bg-[#1e3a8a]">التالي</Button> : <Button type="button" onClick={send} disabled={!stepReady || submit.isPending || createDraft.isPending} className="h-10 rounded-xl bg-[#2563eb] font-extrabold hover:bg-[#1d4ed8]"><Send className="ml-2 h-4 w-4" />{submit.isPending ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ رفع الصور وإرسال الإعلان...</> : "إرسال للمراجعة"}</Button>}</div>
    </DialogContent>
  </Dialog>;
}

function VerificationUpload({ title, copy, required = false, file, pending, onChange }: { title: string; copy: string; required?: boolean; file: File | null; pending: boolean; onChange: (file: File | null) => void }) {
  return <section className="rounded-2xl border border-[#dce7ee] bg-[#f8fafc] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><h4 className="font-black text-[#0f172a]">{title}</h4><p className="mt-1 max-w-xl text-xs leading-6 text-[#62788d]">{copy}</p>{required && <p className="mt-1 max-w-xl text-xs font-bold leading-6 text-[#b91c1c]">تأكد أن الاسم المسجل في حسابك يطابق الاسم الظاهر في البطاقة لتسريع اعتماد الإعلان.</p>}</div><span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${required ? "bg-[#fef2f2] text-[#b91c1c]" : "bg-white text-[#62788d]"}`}>{required ? "إجباري" : "اختياري"}</span></div><label className="mt-3 block cursor-pointer rounded-xl border border-dashed border-[#b8cbd9] bg-white p-3 text-sm font-bold text-[#2563eb]"><Input type="file" accept="application/pdf,image/jpeg,image/png" className="cursor-pointer border-0 p-0 shadow-none" disabled={pending} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.files?.[0] ?? null)} /><span className="mt-2 block text-xs text-[#64748b]">PDF أو JPEG أو PNG حتى 5 ميجابايت.</span></label>{file && <p className="mt-3 rounded-lg bg-[#e7f6ef] px-3 py-2 text-xs font-bold text-[#059669]">تم اختيار المستند: {file.name}</p>}</section>;
}
