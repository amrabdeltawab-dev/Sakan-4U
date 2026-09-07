import { Brand } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

export default function ResetPassword() {
  const [, navigate] = useLocation(); const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [valid, setValid] = useState<boolean | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState(false);
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("error") || hash.get("error_code")) { setValid(false); return; }
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY" && active) setValid(true); });
    supabase.auth.getSession().then(({ data }) => { if (!active) return; const isRecoveryCallback = hash.get("type") === "recovery"; setValid(Boolean(isRecoveryCallback && data.session)); });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  const updatePassword = async () => { if (password.length < 8) return setError("اختر كلمة مرور من 8 أحرف على الأقل."); if (password !== confirm) return setError("كلمتا المرور غير متطابقتين."); setBusy(true); setError(""); const { error: updateError } = await supabase.auth.updateUser({ password }); setBusy(false); if (updateError) return setError("رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطاً جديداً."); setSuccess(true); setTimeout(() => navigate("/account"), 1200); };
  return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#f8fafc] p-5"><section className="w-full max-w-md rounded-[30px] border border-[#e2e8f0] bg-white p-7 shadow-[0_18px_48px_rgba(16,42,67,.08)] sm:p-10"><Brand /><span className="mt-9 grid h-12 w-12 place-items-center rounded-2xl bg-[#eff6ff] text-[#2563eb]"><KeyRound className="h-6 w-6" /></span><h1 className="mt-5 text-2xl font-black">كلمة مرور جديدة</h1>{valid === null ? <p className="mt-4 text-sm text-[#64748b]">جارٍ التحقق من رابط الاستعادة...</p> : !valid ? <div className="mt-5 rounded-2xl bg-[#eff6ff] p-5 text-sm leading-7 text-[#b91c1c]">رابط الاستعادة غير صالح أو انتهت صلاحيته.<Link href="/forgot-password" className="mt-3 block font-black underline">اطلب رابط استعادة جديداً</Link></div> : success ? <div className="mt-5 rounded-2xl bg-[#ecfdf5] p-5 text-sm leading-7 text-[#059669]"><CheckCircle2 className="mb-2 h-5 w-5" />تم تحديث كلمة المرور بنجاح. جارٍ توجيهك إلى حسابك...</div> : <form onSubmit={event => { event.preventDefault(); void updatePassword(); }} className="mt-6 space-y-4"><label className="block text-sm font-bold">كلمة المرور الجديدة<Input value={password} onChange={event => setPassword(event.target.value)} type="password" autoComplete="new-password" className="mt-2 h-12 rounded-xl" /></label><label className="block text-sm font-bold">تأكيد كلمة المرور<Input value={confirm} onChange={event => setConfirm(event.target.value)} type="password" autoComplete="new-password" className="mt-2 h-12 rounded-xl" /></label>{error && <p role="alert" className="rounded-xl bg-[#fef2f2] p-3 text-sm font-bold text-[#b91c1c]">{error}</p>}<Button disabled={busy} className="h-12 w-full rounded-xl bg-[#2563eb] font-extrabold hover:bg-[#1d4ed8]">{busy ? "جارٍ الحفظ..." : "حفظ كلمة المرور"}</Button></form>}</section></main>;
}
