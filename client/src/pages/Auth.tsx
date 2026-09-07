import { Brand } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { authErrorMessage, canShowRegistrationSuccess } from "@/lib/authErrors";
import { CheckCircle2, Eye, EyeOff, KeyRound, LoaderCircle, Mail, ShieldCheck, UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";

type Mode = "login" | "student" | "owner" | "forgot";
const roleRoute = (role?: string) => role === "super_admin" || role === "admin" ? "/admin" : role === "owner" ? "/owner" : "/account";
const bookingReturnRoute = () => {
  const value = new URLSearchParams(window.location.search).get("returnTo");
  return value?.startsWith("/property/") ? value : null;
};

export default function Auth({ mode }: { mode: Mode }) {
  const [, navigate] = useLocation();
  const returnTo = bookingReturnRoute();
  const destinationFor = (role?: string) => role === "student" && returnTo ? returnTo : roleRoute(role);
  const [fullName, setFullName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [confirmPassword, setConfirmPassword] = useState(""); const [phone, setPhone] = useState(""); const [experience, setExperience] = useState(""); const [legalConsent, setLegalConsent] = useState(false); const [showPassword, setShowPassword] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const [success, setSuccess] = useState("");
  const isRegistration = mode === "student" || mode === "owner";

  useEffect(() => { supabase.auth.getSession().then(async ({ data }) => { if (!data.session) return; const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.session.user.id).maybeSingle(); navigate(destinationFor(profile?.role)); }); }, [navigate, returnTo]);

  const signIn = async () => {
    if (!email || !password) return setError("أدخل البريد الإلكتروني وكلمة المرور.");
    setBusy(true); setError("");
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError || !data.user) { setBusy(false); return setError(authErrorMessage(authError)); }
    if (!data.user.email_confirmed_at) { setBusy(false); return setError("يرجى تأكيد بريدك الإلكتروني قبل الدخول."); }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
    setBusy(false); navigate(destinationFor(profile?.role));
  };

  const signUp = async () => {
    if (fullName.trim().length < 2) return setError("اكتب الاسم الكامل كما سيظهر في حسابك.");
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("أدخل بريدًا إلكترونيًا صحيحًا.");
    if (password.length < 8) return setError("اختر كلمة مرور من 8 أحرف على الأقل.");
    if (password !== confirmPassword) return setError("كلمتا المرور غير متطابقتين.");
    if (!legalConsent) return setError("يجب الموافقة على الشروط والأحكام وسياسة الخصوصية لإنشاء الحساب.");
    if (mode === "owner" && (phone.trim().length < 6 || experience.trim().length < 10)) return setError("أدخل رقم هاتف صحيحًا ووصفًا موجزًا لخبرتك في إدارة السكن.");
    setBusy(true); setError("");
    const metadata = mode === "owner" ? { full_name: fullName.trim(), legal_consent: true, legal_consent_at: new Date().toISOString(), desired_role: "owner", owner_request: { phone: phone.trim(), experience: experience.trim(), preferred_contact: phone.trim() } } : { full_name: fullName.trim(), legal_consent: true, legal_consent_at: new Date().toISOString() };
    const { data, error: authError } = await supabase.auth.signUp({ email, password, options: { data: metadata, emailRedirectTo: `${window.location.origin}/login?verified=1` } });
    setBusy(false);
    if (authError || !canShowRegistrationSuccess(data.user?.id)) return setError(authErrorMessage(authError));
    setSuccess("تم إنشاء الحساب. راجع بريدك الإلكتروني لتأكيده، ثم عد لتسجيل الدخول. يظل طلب حساب المالك قيد مراجعة الإدارة بعد التحقق.");
  };

  const sendReset = async () => {
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError("أدخل بريدًا إلكترونيًا صحيحًا لإرسال رابط الاستعادة.");
    setBusy(true); setError(""); const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` }); setBusy(false);
    if (resetError) return setError(authErrorMessage(resetError)); setSuccess("إذا كان البريد مسجلاً، ستصلك رسالة آمنة لإعادة تعيين كلمة المرور.");
  };

  const title = mode === "login" ? "مرحباً بعودتك" : mode === "student" ? "ابدأ رحلة سكنك" : mode === "owner" ? "اعرض سكنك بثقة" : "استعادة كلمة المرور";
  const subtitle = mode === "login" ? "أدخل إلى طلباتك أو مساحة إدارة السكن." : mode === "student" ? "حساب طالب واحد، وطلبات سكن واضحة وآمنة." : mode === "owner" ? "أنشئ حسابك ثم نراجع طلب اعتماد المالك قبل النشر." : "سنرسل رابطاً آمناً إلى بريدك الإلكتروني.";
  const submit = mode === "login" ? signIn : mode === "forgot" ? sendReset : signUp;
  return <main dir="rtl" className="relative min-h-screen w-full overflow-x-hidden bg-[#f8fafc] text-[#0f172a]"><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,#dbeafe_0,transparent_28%),radial-gradient(circle_at_86%_80%,#ecfdf5_0,transparent_26%)]" /><div className="relative mx-auto grid min-h-screen w-full min-w-0 place-items-center px-5 py-10"><section className="w-full min-w-0 max-w-[520px]"><div className="sakeno-surface w-full min-w-0 p-6 sm:p-9"><div className="mb-10 flex items-center justify-between lg:hidden"><Brand /><Link href="/" className="text-sm font-bold text-[#475569]">الرئيسية</Link></div><Link href="/" className="hidden text-sm font-bold text-[#475569] hover:text-[#2563eb] lg:inline-flex">← العودة إلى الاستكشاف</Link><div className="mt-7"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#eff6ff] text-[#2563eb]">{mode === "forgot" ? <KeyRound className="h-6 w-6" /> : <UserRound className="h-6 w-6" />}</span><h2 className="mt-5 text-3xl font-black">{title}</h2><p className="mt-3 leading-7 text-[#475569]">{subtitle}</p></div>{success ? <div className="mt-8 rounded-2xl border border-[#a7f3d0] bg-[#ecfdf5] p-5 text-sm leading-7 text-[#059669]"><CheckCircle2 className="mb-2 h-5 w-5" />{success}<div><Link href="/login" className="mt-4 inline-flex font-black underline">الذهاب لتسجيل الدخول</Link></div></div> : <form className="mt-8 min-w-0 space-y-4" onSubmit={event => { event.preventDefault(); void submit(); }}>{isRegistration && <Field label="الاسم الكامل"><Input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" placeholder="مثال: أحمد محمد علي" className="h-12 rounded-xl" /></Field>}<Field label="البريد الإلكتروني"><Input value={email} onChange={event => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="name@example.com" className="h-12 rounded-xl" /></Field>{mode !== "forgot" && <><Field label="كلمة المرور"><div className="relative min-w-0"><Input value={password} onChange={event => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={isRegistration ? "new-password" : "current-password"} placeholder="8 أحرف على الأقل" className="h-12 rounded-xl pl-12" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-3 text-[#475569]" aria-label="إظهار كلمة المرور">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div></Field>{isRegistration && <Field label="تأكيد كلمة المرور"><Input value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} type="password" autoComplete="new-password" className="h-12 rounded-xl" /></Field>}</>}{mode === "owner" && <><Field label="رقم الهاتف"><Input value={phone} onChange={event => setPhone(event.target.value)} type="tel" autoComplete="tel" placeholder="01xxxxxxxxx" className="h-12 rounded-xl" /></Field><Field label="نبذة عن خبرتك في إدارة السكن"><textarea value={experience} onChange={event => setExperience(event.target.value)} placeholder="نوع السكن الذي تديره وخبرتك في استقبال الطلاب..." className="min-h-28 w-full rounded-xl border border-[#cbd5e1] bg-white p-3 text-sm outline-none focus:border-[#2563eb]" /></Field></>}{isRegistration && <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#cbd5e1] bg-[#fbfcfd] p-4 text-right text-sm leading-6 text-[#475569]"><input type="checkbox" checked={legalConsent} onChange={event => setLegalConsent(event.target.checked)} className="mt-1 h-4 w-4 shrink-0 accent-[#2563eb]" required /><span>أوافق على <Link href="/terms" className="font-black text-[#2563eb] underline">الشروط والأحكام</Link> و<Link href="/privacy" className="font-black text-[#2563eb] underline">سياسة الخصوصية</Link>.</span></label>}{error && <p role="alert" className="rounded-xl bg-[#fef2f2] px-4 py-3 text-sm font-bold text-[#b91c1c]">{error}</p>}<Button type="submit" disabled={busy || (isRegistration && !legalConsent)} className="sakeno-primary-action h-12 w-full rounded-xl text-base font-extrabold">{busy ? <><LoaderCircle className="ml-2 h-4 w-4 animate-spin" />جارٍ المعالجة...</> : mode === "login" ? "تسجيل الدخول" : mode === "forgot" ? "إرسال رابط الاستعادة" : "إنشاء الحساب"}</Button></form>}<div className="mt-6 text-center text-sm text-[#475569]">{mode === "login" ? <>ليس لديك حساب؟ <Link href="/signup/student" className="font-black text-[#2563eb]">إنشاء حساب طالب</Link><span className="mx-2">·</span><Link href="/signup/owner" className="font-black text-[#2563eb]">حساب مالك</Link><div className="mt-3"><Link href="/forgot-password" className="font-bold hover:text-[#2563eb]">هل نسيت كلمة المرور؟</Link></div></> : mode === "forgot" ? <Link href="/login" className="font-black text-[#2563eb]">العودة لتسجيل الدخول</Link> : <><p>لديك حساب بالفعل؟ <Link href="/login" className="font-black text-[#2563eb]">تسجيل الدخول</Link></p><Link href={mode === "student" ? "/signup/owner" : "/signup/student"} className="mt-4 inline-flex h-10 items-center rounded-xl border border-[#bfdbfe] bg-[#eff6ff] px-4 font-black text-[#1d4ed8] transition hover:bg-[#dbeafe]">{mode === "student" ? "إنشاء حساب مالك" : "إنشاء حساب طالب"}</Link></>}</div><p className="mt-8 flex flex-wrap items-center justify-center gap-2 text-center text-xs leading-6 text-[#64748b]"><Mail className="h-3.5 w-3.5" />تصلك رسائل تأكيد البريد واستعادة كلمة المرور إلى بريدك بأمان.<span>·</span><Link href="/terms" className="font-bold underline">الشروط</Link><Link href="/privacy" className="font-bold underline">الخصوصية</Link></p></div></section></div></main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-right text-sm font-extrabold"><span>{label}</span><div className="mt-2">{children}</div></label>; }
