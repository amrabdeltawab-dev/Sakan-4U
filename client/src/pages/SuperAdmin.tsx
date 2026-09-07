import { useMemo, useState } from "react";
import WorkspaceShell from "@/components/WorkspaceShell";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Eye, Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck, Trash2, UserCog } from "lucide-react";
import { actionErrorMessages } from "@/lib/errorMessages";
import { showActionError, toast } from "@/lib/appToast";

const roleLabels: Record<string, string> = { student: "طالب", owner: "مالك", admin: "مدير", super_admin: "مدير عام" };
const statusLabels: Record<string, string> = { active: "نشط", pending_verification: "بانتظار تأكيد البريد", banned: "موقوف", unavailable: "غير متاح" };
const ownerStatusLabels: Record<string, string> = { pending: "طلب مالك قيد المراجعة", approved: "مالك معتمد", rejected: "طلب مالك مرفوض" };
const pageSize = 25;

type ManagedUser = {
  id: string;
  fullName: string;
  email: string;
  role: "student" | "owner" | "admin" | "super_admin";
  createdAt: string;
  accountStatus: "active" | "pending_verification" | "banned" | "unavailable";
  ownerApplicationStatus: "pending" | "approved" | "rejected" | null;
};

export default function SuperAdmin() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | ManagedUser["role"]>("all");
  const [offset, setOffset] = useState(0);
  const [pendingDelete, setPendingDelete] = useState<ManagedUser | null>(null);
  const listInput = useMemo(() => ({ offset, limit: pageSize, query: search || undefined, role: roleFilter === "all" ? undefined : roleFilter }), [offset, roleFilter, search]);
  const profiles = trpc.superAdmin.listUsers.useQuery(listInput, { enabled: user?.appRole === "super_admin" });
  const propertyViewStats = trpc.superAdmin.propertyViewStats.useQuery(undefined, { enabled: user?.appRole === "super_admin", refetchInterval: 30_000, refetchIntervalInBackground: false });
  const setRole = trpc.superAdmin.setRole.useMutation({
    onSuccess: () => {
      void utils.superAdmin.listUsers.invalidate();
      toast.success("تم تحديث الصلاحية من الخادم.");
    },
    onError: error => showActionError(error, actionErrorMessages.profile),
  });
  const deleteUser = trpc.superAdmin.deleteUser.useMutation({
    onSuccess: result => {
      setPendingDelete(null);
      void utils.superAdmin.listUsers.invalidate();
      toast.success(`تم حذف الحساب وتنظيف ${result.removedObjects} ملفاً مخزناً بأمان.`);
    },
    onError: error => showActionError(error, actionErrorMessages.profile),
  });

  if (user && user.appRole !== "super_admin") {
    return <WorkspaceShell active="/super-admin"><section className="grid min-h-[520px] place-items-center text-center"><div><ShieldAlert className="mx-auto h-11 w-11 text-[#2563eb]" /><h1 className="mt-5 text-2xl font-black">هذه المساحة للمدير العام فقط</h1><p className="mt-3 text-[#64748b]">تتم حماية إدارة المستخدمين والصلاحيات في الواجهة والخادم.</p></div></section></WorkspaceShell>;
  }

  const applySearch = () => { setOffset(0); setSearch(searchDraft.trim()); };
  const changeRoleFilter = (value: "all" | ManagedUser["role"]) => { setOffset(0); setRoleFilter(value); };
  const users: ManagedUser[] = ((profiles.data?.items ?? []) as any[]).map(profile => ({
    id: profile.id,
    fullName: profile.fullName ?? profile.full_name,
    email: profile.email,
    role: profile.role,
    createdAt: profile.createdAt ?? profile.created_at,
    accountStatus: profile.accountStatus,
    ownerApplicationStatus: profile.ownerApplicationStatus ?? null,
  }));
  const canGoBack = offset > 0;
  const canGoForward = profiles.data?.nextOffset !== null && profiles.data?.nextOffset !== undefined;

  return (
    <WorkspaceShell active="/super-admin">
      <section>
        <span className="text-xs font-black tracking-[.15em] text-[#2563eb]">تحكم موثوق</span>
        <h1 className="mt-2 text-3xl font-black">إدارة مستخدمي المنصة</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-[#6e8295]">تُدار الحسابات من الخادم فقط. لا يمكن حذف حساب المدير العام أو حسابك الشخصي، كما تُحفظ سجلات الحجز والمالية التاريخية بدلاً من حذفها.</p>
      </section>

      <section className="mt-8 sakeno-surface bg-gradient-to-l from-white to-[#eff6ff] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-black">تحليلات المنصة</h2><p className="mt-1 text-sm text-[#6e8295]">إجمالي فتح صفحات العقارات في جلسات المتصفحات، ويُحدَّث كل 30 ثانية.</p></div><Button type="button" variant="outline" onClick={() => void propertyViewStats.refetch()} disabled={propertyViewStats.isFetching} className="h-10 rounded-xl border-[#d6e1e9] font-extrabold text-[#2563eb]"><RefreshCw className={`ml-2 h-4 w-4 ${propertyViewStats.isFetching ? "animate-spin" : ""}`} />تحديث الآن</Button></div>
        <div className="mt-4 max-w-sm rounded-2xl border border-[#dbeafe] bg-white p-5 shadow-sm"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]"><Eye className="h-5 w-5" /></span><b className="mt-3 block text-3xl font-black">{propertyViewStats.data?.totalPropertyViews?.toLocaleString("ar-EG") ?? "—"}</b><small className="mt-1 block text-xs font-bold text-[#728598]">إجمالي مشاهدات صفحات العقارات</small></div>
      </section>

      <section className="mt-8 overflow-hidden rounded-[24px] border border-[#e2e8ee] bg-white shadow-[0_8px_24px_rgba(16,42,67,.04)]">
        <div className="flex flex-col gap-4 border-b border-[#e5ebf0] p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]"><UserCog className="h-5 w-5" /></span><div><h2 className="font-black">الحسابات</h2><p className="mt-1 text-xs text-[#64748b]">بحث وترقيم صفحات على الخادم. كل حذف يسجل في سجل تدقيق محمي.</p></div></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex min-w-[230px] overflow-hidden rounded-xl border border-[#dce4eb] bg-white"><Input aria-label="البحث في المستخدمين" value={searchDraft} onChange={event => setSearchDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") applySearch(); }} placeholder="ابحث بالاسم أو البريد" className="h-10 border-0 text-right shadow-none focus-visible:ring-0" /><Button onClick={applySearch} variant="ghost" className="h-10 w-10 rounded-none p-0 text-[#50677b]" aria-label="تنفيذ البحث"><Search className="h-4 w-4" /></Button></div>
            <select aria-label="تصفية الحسابات حسب الدور" value={roleFilter} onChange={event => changeRoleFilter(event.target.value as "all" | ManagedUser["role"])} className="h-10 rounded-xl border border-[#dce4eb] bg-white px-3 text-sm font-bold text-[#30475b] outline-none focus:border-[#2563eb]"><option value="all">كل الأدوار</option><option value="student">الطلاب</option><option value="owner">الملاك</option><option value="admin">المديرون</option><option value="super_admin">المديرون العامون</option></select>
          </div>
        </div>
        {profiles.isLoading ? <div className="p-10 text-center text-sm text-[#64748b]"><Loader2 className="mx-auto mb-3 h-5 w-5 animate-spin" />جارٍ تحميل الحسابات...</div> : profiles.error ? <div className="p-10 text-center text-sm text-[#b1432a]"><p>تعذر تحميل الحسابات الآن. أعد المحاولة لاحقاً.</p><Button type="button" variant="outline" size="sm" onClick={() => void profiles.refetch()} className="mt-3 h-8 text-xs font-bold">إعادة المحاولة</Button></div> : users.length === 0 ? <div className="p-10 text-center text-sm text-[#64748b]">لا توجد حسابات مطابقة للبحث أو التصفية.</div> : <div className="divide-y divide-[#e2e8f0]">{users.map(profile => {
          const protectedIdentity = profile.role === "super_admin" || profile.id === user?.id;
          return <div key={profile.id} className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><b className="truncate">{profile.fullName}</b><Badge className={`border-0 ${profile.role === "super_admin" ? "bg-[#f0e8ff] text-[#6b3fa0]" : profile.role === "admin" ? "bg-[#eaf0fb] text-[#2563eb]" : "bg-[#f2f5f7] text-[#475569]"}`}>{roleLabels[profile.role]}</Badge><Badge variant="outline" className="border-[#dce4eb] text-[#475569]">{statusLabels[profile.accountStatus]}</Badge>{profile.ownerApplicationStatus && <Badge variant="outline" className="border-[#dce4eb] text-[#475569]">{ownerStatusLabels[profile.ownerApplicationStatus]}</Badge>}</div><p className="mt-1 truncate text-sm text-[#64748b]">{profile.email}</p><p className="mt-1 text-xs text-[#91a0ad]">أنشئ في {new Date(profile.createdAt).toLocaleDateString("ar-EG")}</p></div>{protectedIdentity ? <span className="flex items-center gap-2 text-sm font-bold text-[#7453a3]"><ShieldCheck className="h-4 w-4" />{profile.id === user?.id ? "حسابك محمي" : "هوية مدير عام محمية"}</span> : <div className="flex flex-wrap gap-2">{(["student", "owner", "admin"] as const).map(role => <Button key={role} disabled={setRole.isPending || profile.role === role} onClick={() => setRole.mutate({ userId: profile.id, role })} variant={role === "admin" ? "default" : "outline"} className={`h-9 rounded-lg text-xs font-bold ${role === "admin" ? "bg-[#0f172a] hover:bg-[#1e3a8a]" : "border-[#dce4eb] text-[#50677b]"}`}>جعله {roleLabels[role]}</Button>)}<Button onClick={() => setPendingDelete(profile)} variant="outline" className="h-9 rounded-lg border-[#f2c0b2] text-xs font-bold text-[#b1432a] hover:bg-[#fff0ed] hover:text-[#9d3724]"><Trash2 className="ml-1 h-3.5 w-3.5" />حذف الحساب</Button></div>}</div>;
        })}</div>}
        <div className="flex items-center justify-between border-t border-[#e5ebf0] p-4"><span className="text-xs text-[#64748b]">{profiles.data?.total ?? 0} حساباً</span><div className="flex gap-2"><Button disabled={!canGoBack || profiles.isFetching} onClick={() => setOffset(Math.max(0, offset - pageSize))} variant="outline" className="h-9 rounded-lg text-xs">السابق</Button><Button disabled={!canGoForward || profiles.isFetching} onClick={() => setOffset(profiles.data?.nextOffset ?? offset)} variant="outline" className="h-9 rounded-lg text-xs">التالي</Button></div></div>
      </section>

      <AlertDialog open={Boolean(pendingDelete)} onOpenChange={open => { if (!open && !deleteUser.isPending) setPendingDelete(null); }}>
        <AlertDialogContent dir="rtl" className="text-right">
          <AlertDialogHeader className="text-right"><AlertDialogTitle>تأكيد حذف الحساب</AlertDialogTitle><AlertDialogDescription className="leading-6">سيُحذف حساب <b>{pendingDelete?.fullName}</b> من Auth وملفه الشخصي. لا يمكن تنفيذ الحذف إذا وجدت حجوزات أو سجلات مراجعة تاريخية، وستُنظف ملفات العقارات المملوكة بأمان عند السماح بالحذف.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-start"><AlertDialogCancel disabled={deleteUser.isPending}>إلغاء</AlertDialogCancel><AlertDialogAction disabled={deleteUser.isPending || !pendingDelete} onClick={() => pendingDelete && deleteUser.mutate({ userId: pendingDelete.id })} className="bg-[#b1432a] hover:bg-[#963421]">{deleteUser.isPending ? "جارٍ الحذف..." : "تأكيد حذف الحساب"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </WorkspaceShell>
  );
}
