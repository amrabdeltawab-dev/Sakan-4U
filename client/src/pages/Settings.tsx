import WorkspaceShell from "@/components/WorkspaceShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/_core/hooks/useAuth";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import { authErrorMessage } from "@/lib/authErrors";
import { CheckCircle2, KeyRound, LoaderCircle, Save, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { actionErrorMessages } from "@/lib/errorMessages";
import { showActionError, toast } from "@/lib/appToast";

export default function Settings() {
  const { user, refresh } = useAuth();
  const utils = trpc.useUtils();
  const profile = trpc.profile.me.useQuery(undefined, { enabled: Boolean(user) });
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const supportedRole = user?.appRole === "student" || user?.appRole === "owner";

  useEffect(() => {
    if (!profile.data) return;
    setFullName(profile.data.fullName ?? "");
    setPhone(profile.data.phone ?? "");
  }, [profile.data]);

  const saveProfile = trpc.profile.update.useMutation({
    onSuccess: async () => {
      await utils.profile.me.invalidate();
      await refresh();
      toast.success("تم حفظ بيانات الحساب بنجاح.");
    },
    onError: error => showActionError(error, actionErrorMessages.profile),
  });

  const updatePassword = async () => {
    if (!user?.email || !currentPassword) { toast.error("أدخل كلمة المرور الحالية أولاً."); return; }
    if (password.length < 8) { toast.error("يجب أن تتكون كلمة المرور من 8 أحرف على الأقل."); return; }
    if (password !== passwordConfirmation) { toast.error("تأكيد كلمة المرور غير مطابق."); return; }
    setPasswordBusy(true);
    try {
      const { data: verification, error: verificationError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
      if (verificationError || verification.user?.id !== user.id) {
        setCurrentPassword("");
        const message = authErrorMessage(verificationError);
        toast.error(message === "البريد الإلكتروني أو كلمة المرور غير صحيحة." ? "كلمة المرور الحالية غير صحيحة." : message);
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setCurrentPassword(""); setPassword(""); setPasswordConfirmation("");
      toast.success("تم تحديث كلمة المرور بأمان.");
    } catch (error) {
      showActionError(error, actionErrorMessages.profile);
    } finally { setPasswordBusy(false); }
  };

  if (user && !supportedRole) return <WorkspaceShell active="/settings"><section className="grid min-h-[520px] place-items-center"><div className="max-w-md text-center"><ShieldCheck className="mx-auto h-11 w-11 text-[#2563eb]" /><h1 className="mt-5 text-2xl font-black">إعدادات الحساب للطلاب والملاك</h1><p className="mt-3 leading-7 text-[#64748b]">تُدار بيانات حسابات الإدارة من خلال مسارات الصلاحيات المخصصة لها.</p></div></section></WorkspaceShell>;

  return <WorkspaceShell active="/settings"><section><span className="text-xs font-black tracking-[.15em] text-[#2563eb]">الحساب</span><h1 className="mt-2 text-3xl font-black">إعدادات الملف الشخصي</h1><p className="mt-2 max-w-2xl text-sm leading-7 text-[#6e8295]">حدّث بيانات التواصل الخاصة بك، أو غيّر كلمة المرور من خلال Supabase Auth. لا يمكن تعديل البريد الإلكتروني أو الدور من هذه الصفحة.</p></section>
    <div className="mt-8 grid gap-5 xl:grid-cols-2"><section className="rounded-[24px] border border-[#e2e8ee] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,67,.04)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eff6ff] text-[#2563eb]"><UserRound className="h-5 w-5" /></span><div><h2 className="font-black">بياناتك الأساسية</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">تظهر هذه البيانات فقط ضمن المسارات المصرح بها في Sakan 4U.</p></div></div>{profile.isLoading ? <div className="mt-7 flex items-center gap-2 text-sm text-[#64748b]"><LoaderCircle className="h-4 w-4 animate-spin" />جارٍ تحميل البيانات...</div> : <form className="mt-7 space-y-4" onSubmit={event => { event.preventDefault(); saveProfile.mutate({ fullName: fullName.trim(), phone: phone.trim() || null }); }}><label className="block text-sm font-extrabold">الاسم الكامل<Input value={fullName} onChange={event => setFullName(event.target.value)} minLength={2} maxLength={160} className="mt-2 h-11 rounded-xl" /></label><label className="block text-sm font-extrabold">رقم الهاتف <span className="font-normal text-[#64748b]">(اختياري)</span><Input value={phone} onChange={event => setPhone(event.target.value)} minLength={6} maxLength={32} inputMode="tel" className="mt-2 h-11 rounded-xl" /></label><label className="block text-sm font-extrabold">البريد الإلكتروني<Input value={profile.data?.email ?? user?.email ?? ""} disabled className="mt-2 h-11 rounded-xl bg-[#f8fafc] text-[#64748b]" /></label><Button disabled={saveProfile.isPending || fullName.trim().length < 2 || (phone.trim().length > 0 && phone.trim().length < 6)} className="mt-2 h-11 rounded-xl bg-[#2563eb] px-5 font-extrabold hover:bg-[#1d4ed8]"><Save className="ml-2 h-4 w-4" />{saveProfile.isPending ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ الحفظ...</> : "حفظ البيانات"}</Button></form>}</section>
      <section className="rounded-[24px] border border-[#e2e8ee] bg-white p-6 shadow-[0_8px_24px_rgba(16,42,67,.04)]"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eaf0fb] text-[#2563eb]"><KeyRound className="h-5 w-5" /></span><div><h2 className="font-black">تغيير كلمة المرور</h2><p className="mt-1 text-xs leading-5 text-[#64748b]">نتحقق من كلمة المرور الحالية عبر Supabase Auth قبل تطبيق كلمة مرور جديدة.</p></div></div><div className="mt-7 space-y-4"><label className="block text-sm font-extrabold">كلمة المرور الحالية<Input value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} type="password" autoComplete="current-password" className="mt-2 h-11 rounded-xl" /></label><label className="block text-sm font-extrabold">كلمة المرور الجديدة<Input value={password} onChange={event => setPassword(event.target.value)} type="password" minLength={8} autoComplete="new-password" className="mt-2 h-11 rounded-xl" /></label><label className="block text-sm font-extrabold">تأكيد كلمة المرور<Input value={passwordConfirmation} onChange={event => setPasswordConfirmation(event.target.value)} type="password" minLength={8} autoComplete="new-password" className="mt-2 h-11 rounded-xl" /></label><div className="rounded-xl bg-[#f8fafc] p-3 text-xs leading-6 text-[#657b90]"><CheckCircle2 className="ml-1 inline h-3.5 w-3.5 text-[#059669]" />استخدم كلمة مرور جديدة بطول 8 أحرف على الأقل ولا تشاركها مع أي شخص.</div><Button type="button" onClick={() => void updatePassword()} disabled={passwordBusy || !currentPassword || !password || !passwordConfirmation} className="h-11 rounded-xl bg-[#0f172a] px-5 font-extrabold hover:bg-[#1e3a8a]"><KeyRound className="ml-2 h-4 w-4" />{passwordBusy ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ التحقق والتحديث...</> : "التحقق وتحديث كلمة المرور"}</Button></div></section></div>
  </WorkspaceShell>;
}
