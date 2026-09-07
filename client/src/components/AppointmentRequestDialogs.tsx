import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { CalendarClock, XCircle } from "lucide-react";
import { useState } from "react";
import { actionErrorMessages } from "@/lib/errorMessages";
import { showActionError, toast } from "@/lib/appToast";
import { LoadingButton } from "@/components/LoadingButton";

type RequestProps = { bookingId: string; onDone: () => void; compact?: boolean };

const minimumFutureLocal = () => {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

export function RescheduleRequestDialog({ bookingId, onDone, compact = false }: RequestProps) {
  const [open, setOpen] = useState(false);
  const [viewingAt, setViewingAt] = useState(minimumFutureLocal);
  const [reason, setReason] = useState("");
  const request = trpc.bookings.requestReschedule.useMutation({
    onSuccess: () => { toast.success("تم إرسال طلب تغيير الموعد للإدارة."); onDone(); setOpen(false); setReason(""); },
    onError: error => showActionError(error, actionErrorMessages.bookingDecision),
  });
  const submit = () => request.mutate({ bookingId, viewingAt: new Date(viewingAt).toISOString(), reason: reason.trim() });
  return <Dialog open={open} onOpenChange={next => !request.isPending && setOpen(next)}><DialogTrigger asChild><Button type="button" variant="outline" className={`${compact ? "h-8 px-2 text-[11px]" : "h-9 text-xs"} rounded-lg border-[#b8c8e2] font-bold text-[#2563eb]`}><CalendarClock className="ml-1.5 h-3.5 w-3.5" />طلب تغيير الموعد</Button></DialogTrigger><DialogContent dir="rtl" className="max-w-md rounded-[24px]"><DialogHeader><DialogTitle className="text-right text-xl font-black">طلب تغيير موعد المعاينة</DialogTitle></DialogHeader><p className="text-right text-sm leading-6 text-[#6e8295]">سيراجع فريق Sakan 4U الموعد المقترح ويؤكد الموعد النهائي. لا يتغير الموعد الحالي قبل اعتماد الإدارة.</p><div className="space-y-4 py-3"><label className="block text-right text-sm font-bold">الموعد المقترح<Input value={viewingAt} min={minimumFutureLocal()} onChange={event => setViewingAt(event.target.value)} type="datetime-local" className="mt-2 h-11 rounded-xl" /></label><label className="block text-right text-sm font-bold">سبب التغيير<Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="اكتب سبباً واضحاً للتغيير..." className="mt-2 min-h-24 rounded-xl" /></label></div><LoadingButton type="button" onClick={submit} loading={request.isPending} loadingLabel="جارٍ الإرسال..." disabled={!viewingAt || reason.trim().length < 5} className="h-11 w-full rounded-xl bg-[#2563eb] font-extrabold hover:bg-[#274d80]">إرسال طلب التغيير</LoadingButton></DialogContent></Dialog>;
}

export function CancellationRequestDialog({ bookingId, onDone, compact = false }: RequestProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const request = trpc.bookings.requestCancellation.useMutation({
    onSuccess: () => { toast.success("تم إرسال طلب الإلغاء للمراجعة."); onDone(); setOpen(false); setReason(""); },
    onError: error => showActionError(error, actionErrorMessages.bookingDecision),
  });
  return <Dialog open={open} onOpenChange={next => !request.isPending && setOpen(next)}><DialogTrigger asChild><Button type="button" variant="outline" className={`${compact ? "h-8 px-2 text-[11px]" : "h-9 text-xs"} rounded-lg border-[#e8b9b4] font-bold text-[#b91c1c]`}><XCircle className="ml-1.5 h-3.5 w-3.5" />طلب إلغاء</Button></DialogTrigger><DialogContent dir="rtl" className="max-w-md rounded-[24px]"><DialogHeader><DialogTitle className="text-right text-xl font-black">طلب إلغاء المعاينة</DialogTitle></DialogHeader><p className="text-right text-sm leading-6 text-[#6e8295]">يُسجل السبب ويراجعه فريق Sakan 4U. إن كانت الرسوم مدفوعة، يظل أي استرداد قراراً يدوياً مستقلاً ولا يُعتمد تلقائياً.</p><label className="mt-4 block text-right text-sm font-bold">سبب الإلغاء<Textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="اكتب سبباً واضحاً للإلغاء..." className="mt-2 min-h-28 rounded-xl" /></label><LoadingButton type="button" onClick={() => request.mutate({ bookingId, reason: reason.trim() })} loading={request.isPending} loadingLabel="جارٍ الإرسال..." disabled={reason.trim().length < 5} className="mt-5 h-11 w-full rounded-xl bg-[#b91c1c] font-extrabold hover:bg-[#9f4121]">إرسال طلب الإلغاء</LoadingButton></DialogContent></Dialog>;
}
