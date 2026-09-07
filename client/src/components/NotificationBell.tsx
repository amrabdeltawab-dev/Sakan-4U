import { Bell, CheckCheck, ChevronDown, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "@/lib/appToast";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type NotificationItem = {
  id: string;
  notificationType: string;
  title: string;
  message: string;
  readAt: string | null;
  createdAt: string;
  relatedPropertyId: string | null;
  relatedBookingId: string | null;
};

type Preferences = {
  bookingUpdates: boolean;
  propertyUpdates: boolean;
  ownerApplicationUpdates: boolean;
  generalAccountUpdates: boolean;
};

const preferenceOptions: Array<{ key: keyof Preferences; title: string; description: string }> = [
  { key: "bookingUpdates", title: "تحديثات المعاينة والحجز", description: "الطلب، الموعد، القرار، والإلغاء." },
  { key: "propertyUpdates", title: "تحديثات العقارات", description: "المراجعة وإعادة الإرسال وحالة الإعلان." },
  { key: "ownerApplicationUpdates", title: "تحديثات طلب المالك", description: "حالة طلب اعتماد حساب المالك." },
  { key: "generalAccountUpdates", title: "تحديثات الحساب العامة", description: "التحديثات غير الحرجة الخاصة بالحساب." },
];

function relativeTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-EG", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function notificationDestination(role: string, item: NotificationItem) {
  if (role === "student") return "/account";
  if (role === "owner") return "/owner";
  if (role === "admin" || role === "super_admin") return "/admin";
  return "/";
}

export default function NotificationBell() {
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const notifications = trpc.notifications.list.useQuery(undefined, { enabled: Boolean(isAuthenticated && user?.id), staleTime: 20_000 });
  const preferences = trpc.notifications.preferences.useQuery(undefined, { enabled: Boolean(isAuthenticated && user?.id), staleTime: 60_000 });
  const markRead = trpc.notifications.markRead.useMutation({
    onMutate: ({ notificationId }) => {
      const previous = utils.notifications.list.getData();
      utils.notifications.list.setData(undefined, current => {
        if (!current) return current;
        const wasUnread = current.items.some((item: NotificationItem) => item.id === notificationId && !item.readAt);
        return { ...current, unreadCount: wasUnread ? Math.max(0, current.unreadCount - 1) : current.unreadCount, items: current.items.map((item: NotificationItem) => item.id === notificationId ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item) };
      });
      return { previous };
    },
    onError: (_error, _input, context) => { utils.notifications.list.setData(undefined, context?.previous); toast.error("تعذر تحديث حالة الإشعار. أعد المحاولة."); },
    onSettled: () => void utils.notifications.list.invalidate(),
  });
  const markAllRead = trpc.notifications.markAllRead.useMutation({
    onMutate: () => {
      const previous = utils.notifications.list.getData();
      utils.notifications.list.setData(undefined, current => current ? { ...current, unreadCount: 0, items: current.items.map((item: NotificationItem) => item.readAt ? item : { ...item, readAt: new Date().toISOString() }) } : current);
      return { previous };
    },
    onError: (_error, _input, context) => { utils.notifications.list.setData(undefined, context?.previous); toast.error("تعذر تعليم الإشعارات كمقروءة. أعد المحاولة."); },
    onSettled: () => void utils.notifications.list.invalidate(),
  });
  const updatePreferences = trpc.notifications.updatePreferences.useMutation({
    onSuccess: () => { void utils.notifications.preferences.invalidate(); toast.success("تم حفظ تفضيلات الإشعارات."); },
    onError: () => toast.error("تعذر حفظ التفضيلات الآن. أعد المحاولة."),
  });
  const items = (notifications.data?.items ?? []) as NotificationItem[];
  const unreadCount = notifications.data?.unreadCount ?? 0;

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`sakeno-notifications-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, () => void utils.notifications.list.invalidate())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter: `recipient_id=eq.${user.id}` }, () => void utils.notifications.list.invalidate())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id, utils.notifications.list]);

  if (!isAuthenticated || !user) return null;
  const openNotification = (item: NotificationItem) => {
    if (!item.readAt) markRead.mutate({ notificationId: item.id });
    navigate(notificationDestination(user.appRole, item));
  };
  const togglePreference = (key: keyof Preferences) => {
    const current = preferences.data as Preferences | undefined;
    if (!current || updatePreferences.isPending) return;
    updatePreferences.mutate({ [key]: !current[key] });
  };

  return <Popover><PopoverTrigger asChild><button type="button" aria-label={unreadCount ? `لديك ${unreadCount} إشعارات غير مقروءة` : "الإشعارات"} className="relative grid h-10 w-10 place-items-center rounded-xl text-[#475569] transition hover:bg-[#f1f5f8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb]"><Bell className="h-5 w-5" />{unreadCount > 0 && <span className="absolute -left-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#2563eb] px-1 text-[10px] font-black text-white">{unreadCount > 99 ? "99+" : unreadCount}</span>}</button></PopoverTrigger><PopoverContent dir="rtl" align="start" className="w-[min(calc(100vw-1.5rem),390px)] overflow-hidden rounded-2xl border-[#e2e8f0] bg-white p-0 shadow-[0_18px_42px_rgba(16,42,67,.18)]"><div className="flex items-center justify-between gap-3 border-b border-[#e2e8f0] px-4 py-3"><div className="min-w-0"><h2 className="font-black text-[#0f172a]">الإشعارات</h2><p className="mt-0.5 text-[11px] font-bold text-[#64748b]">تحديثاتك المصرح بها في Sakan 4U</p></div><div className="flex shrink-0 items-center gap-1">{unreadCount > 0 && <Button type="button" variant="ghost" size="sm" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate()} className="h-8 gap-1.5 px-2 text-xs font-bold text-[#059669] hover:bg-[#edf8f2] hover:text-[#12613f]"><CheckCheck className="h-3.5 w-3.5" />قراءة الكل</Button>}<Button type="button" variant="ghost" size="icon" aria-label="تحديث الإشعارات" onClick={() => void notifications.refetch()} disabled={notifications.isFetching} className="h-8 w-8 text-[#60768a]"><RefreshCw className={`h-3.5 w-3.5 ${notifications.isFetching ? "animate-spin" : ""}`} /></Button></div></div><button type="button" onClick={() => setPreferencesOpen(value => !value)} className="flex w-full items-center justify-between border-b border-[#e2e8f0] px-4 py-2.5 text-right text-xs font-extrabold text-[#475569] hover:bg-[#f8fafc]"><span className="flex items-center gap-2"><Settings2 className="h-3.5 w-3.5" />تفضيلات التنبيهات غير الحرجة</span><ChevronDown className={`h-3.5 w-3.5 transition ${preferencesOpen ? "rotate-180" : ""}`} /></button>{preferencesOpen && <div className="border-b border-[#e2e8f0] bg-[#fbfcfd] px-4 py-2">{preferences.isLoading ? <div className="flex items-center gap-2 py-3 text-xs font-bold text-[#64748b]"><Loader2 className="h-3.5 w-3.5 animate-spin" />جارٍ تحميل التفضيلات...</div> : preferences.isError ? <p className="py-2 text-xs font-bold text-[#b91c1c]">تعذر تحميل التفضيلات. أعد فتح اللوحة لاحقاً.</p> : preferenceOptions.map(option => <label key={option.key} className="flex cursor-pointer items-center justify-between gap-3 py-2.5"><span className="min-w-0"><span className="block text-xs font-extrabold text-[#334e68]">{option.title}</span><span className="mt-0.5 block text-[11px] leading-4 text-[#64748b]">{option.description}</span></span><input type="checkbox" className="h-4 w-4 shrink-0 accent-[#2563eb]" checked={Boolean((preferences.data as Preferences | undefined)?.[option.key])} disabled={updatePreferences.isPending} onChange={() => togglePreference(option.key)} aria-label={option.title} /></label>)}<p className="pb-2 pt-1 text-[10px] leading-4 text-[#64748b]">تنبيهات الإجراءات الإدارية العاجلة لا يمكن إيقافها.</p></div>}{notifications.isLoading ? <div className="grid min-h-36 place-items-center text-sm font-bold text-[#64748b]"><Loader2 className="h-4 w-4 animate-spin" /></div> : notifications.isError ? <div className="p-5 text-center"><p role="alert" className="text-sm font-bold leading-6 text-[#b91c1c]">تعذر تحميل الإشعارات الآن.</p><Button type="button" variant="outline" size="sm" onClick={() => void notifications.refetch()} className="mt-3 h-8 text-xs font-bold">إعادة المحاولة</Button></div> : !items.length ? <div className="p-7 text-center"><Bell className="mx-auto h-6 w-6 text-[#9aaab8]" /><p className="mt-3 text-sm font-bold text-[#475569]">لا توجد إشعارات بعد</p><p className="mt-1 text-xs leading-5 text-[#64748b]">ستظهر هنا تحديثات طلباتك وإجراءات المراجعة.</p></div> : <div className="max-h-[min(58vh,440px)] overflow-y-auto">{items.map(item => <button type="button" key={item.id} onClick={() => openNotification(item)} className={`block w-full border-b border-[#e2e8f0] px-4 py-3.5 text-right transition last:border-0 hover:bg-[#f8fafc] ${item.readAt ? "bg-white" : "bg-[#fff7f2]"}`}><div className="flex items-start gap-3"><span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-[#d8e0e7]" : "bg-[#2563eb]"}`} aria-hidden="true" /><div className="min-w-0 flex-1"><p className={`text-sm ${item.readAt ? "font-bold text-[#334e68]" : "font-extrabold text-[#0f172a]"}`}>{item.title}</p><p className="mt-1 text-xs leading-5 text-[#61778a]">{item.message}</p><p className="mt-2 text-[11px] font-bold text-[#64748b]">{relativeTimestamp(item.createdAt)}</p></div></div></button>)}</div>}</PopoverContent></Popover>;
}
