import { Brand } from "@/components/SiteHeader";
import { Heart, Home, LayoutDashboard, LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import NotificationBell from "@/components/NotificationBell";

const tabs = [
  { href: "/account", label: "طلباتي", icon: UserRound, roles: ["student"] },
  { href: "/favorites", label: "مفضلتي", icon: Heart, roles: ["student"] },
  { href: "/settings", label: "إعدادات الحساب", icon: Settings, roles: ["student", "owner"] },
  { href: "/owner", label: "مساحة المالك", icon: LayoutDashboard, roles: ["owner"] },
  { href: "/admin", label: "مراجعة الإدارة", icon: ShieldCheck, roles: ["admin", "super_admin"] },
  { href: "/super-admin", label: "إدارة الصلاحيات", icon: ShieldCheck, roles: ["super_admin"] },
];

export default function WorkspaceShell({ children, active }: { children: React.ReactNode; active: "/account" | "/favorites" | "/settings" | "/owner" | "/admin" | "/super-admin" }) {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const signOut = async () => { await logout(); navigate("/"); };

  if (loading) return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#f8fafc] text-sm font-bold text-[#475569]">جارٍ استعادة جلستك الآمنة...</main>;
  if (!isAuthenticated) return <main dir="rtl" className="fixed inset-0 z-50 grid min-h-screen w-screen place-items-center overflow-hidden bg-[#f8fafc] p-4"><section className="box-border w-full min-w-0 max-w-[calc(100vw-2rem)] break-words rounded-[28px] border border-[#e2e8f0] bg-white p-5 text-center shadow-[0_18px_50px_rgba(15,23,42,.1)] sm:max-w-md sm:p-9"><Brand /><h1 className="mt-9 text-2xl font-extrabold text-[#0f172a]">مساحتك الخاصة في Sakan 4U</h1><p className="mt-3 leading-7 text-[#475569]">سجّل الدخول لمتابعة طلبات السكن أو إدارة الإعلانات.</p><Link href="/login" className="sakeno-primary-action mt-7 inline-flex h-12 w-full items-center justify-center rounded-xl font-bold">متابعة إلى تسجيل الدخول</Link><Link href="/" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#0f172a]"><Home className="h-4 w-4" />العودة للرئيسية</Link></section></main>;

  const visibleTabs = tabs.filter(tab => tab.roles.includes(user!.appRole));
  return <div dir="rtl" className="min-h-screen bg-[#f8fafc] text-[#0f172a]"><aside className="fixed inset-y-0 right-0 z-20 hidden w-[272px] border-l border-[#e2e8f0] bg-white p-6 lg:block"><Brand /><div className="mt-12 space-y-2">{visibleTabs.map(tab => { const Icon = tab.icon; const selected = active === tab.href; return <button key={tab.href} onClick={() => navigate(tab.href)} className={`flex h-12 w-full items-center gap-3 rounded-xl px-4 text-right text-sm font-extrabold transition ${selected ? "bg-[#2563eb] text-white shadow-lg shadow-[#2563eb]/20" : "text-[#475569] hover:bg-[#eff6ff] hover:text-[#1d4ed8]"}`}><Icon className="h-4.5 w-4.5" />{tab.label}</button>; })}</div><div className="absolute bottom-6 left-6 right-6 rounded-2xl bg-[#f8fafc] p-3"><p className="truncate text-sm font-extrabold">{user?.name ?? "حساب Sakan 4U"}</p><p className="mt-1 text-xs text-[#64748b]">{user?.appRole === "owner" ? "مالك معتمد" : user?.appRole === "super_admin" ? "مدير عام" : user?.appRole === "admin" ? "إدارة المنصة" : "طالب"}</p><button onClick={() => void signOut()} className="mt-3 flex items-center gap-2 text-xs font-bold text-[#1d4ed8]"><LogOut className="h-3.5 w-3.5" />تسجيل الخروج</button></div></aside><main className="lg:mr-[272px]"><header className="flex h-[76px] items-center justify-between border-b border-[#e2e8f0] bg-white px-5 md:px-10"><div className="flex items-center gap-1"><Link href="/" className="flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-extrabold text-[#475569] hover:bg-[#f1f5f8]"><Home className="h-4 w-4" />اكتشف السكن</Link><NotificationBell /></div><div className="flex items-center gap-2 lg:hidden"><Brand /></div><span className="hidden text-sm text-[#64748b] md:block">إدارة آمنة، تجربة واضحة.</span></header><div className="mx-auto max-w-[1280px] p-5 md:p-9">{children}</div></main></div>;
}
