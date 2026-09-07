import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { publicNavigationItems } from "@/lib/publicNavigation";
import { Menu, UserRound, X } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className={`group inline-flex items-center gap-2.5 ${light ? "text-white" : "text-[#0f172a]"}`}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#2563eb] text-base font-black text-white shadow-[0_8px_20px_rgba(37,99,235,.24)] transition-transform group-hover:rotate-[-5deg]">س</span>
      <span className="leading-none">
        <b className="block text-[17px] tracking-[.09em]">Sakan 4U</b>
        <span className={`mt-1 block text-[10px] font-bold tracking-[.18em] ${light ? "text-white/55" : "text-[#475569]"}`}>Sakan 4U</span>
      </span>
    </Link>
  );
}

export default function SiteHeader({ transparent = false }: { transparent?: boolean }) {
  const { user, isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const text = transparent ? "text-white" : "text-[#0f172a]";
  const goAccount = () => navigate(user?.appRole === "super_admin" ? "/super-admin" : user?.appRole === "admin" ? "/admin" : user?.appRole === "owner" ? "/owner" : "/account");
  const closeMobileMenu = () => setMobileMenuOpen(false);

  return (
    <header className={`relative z-30 ${transparent ? "" : "border-b border-[#e2e8f0] bg-[#ffffff]/95 backdrop-blur"}`}>
      <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 md:px-10">
        <Brand light={transparent} />
        <nav className={`hidden items-center gap-7 text-sm font-bold md:flex ${transparent ? "text-white/75" : "text-[#475569]"}`} aria-label="التنقل الرئيسي">
          <a href="/#listings" className="transition-colors hover:text-[#2563eb]">اكتشف السكن</a>
          <a href="/#how" className="transition-colors hover:text-[#2563eb]">كيف يعمل</a>
          <Link href="/signup/owner" className="transition-colors hover:text-[#2563eb]">للملاك</Link>
        </nav>
        <div className="flex items-center gap-2">
          {!loading && isAuthenticated ? (
            <Button onClick={goAccount} variant="outline" className={`hidden h-10 rounded-xl border-white/25 px-4 font-bold sm:flex ${transparent ? "bg-white/10 text-white hover:bg-white/20 hover:text-white" : "border-[#cbd5e1] bg-white text-[#0f172a]"}`}>
              <UserRound className="ml-2 h-4 w-4" />حسابي
            </Button>
          ) : (
            <>
              <Link href="/login" className={`hidden h-10 items-center rounded-xl px-4 text-sm font-bold sm:inline-flex ${transparent ? "text-white" : "text-[#0f172a]"}`}>تسجيل الدخول</Link>
              <Link href="/signup/student" className="hidden h-10 items-center rounded-xl bg-[#2563eb] px-4 text-sm font-bold text-white shadow-[0_8px_20px_rgba(37,99,235,.22)] hover:bg-[#1d4ed8] sm:inline-flex">إنشاء حساب</Link>
            </>
          )}
          <Button variant="ghost" onClick={() => setMobileMenuOpen(true)} className={`h-10 w-10 rounded-xl p-0 md:hidden ${text}`} aria-label="فتح قائمة التنقل">
            <Menu className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="right" dir="rtl" className="w-[86vw] max-w-sm border-l-0 bg-[#ffffff] p-0 text-right sm:max-w-sm">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] px-5 py-5">
            <Brand />
            <Button variant="ghost" onClick={closeMobileMenu} className="h-10 w-10 rounded-xl p-0 text-[#0f172a]" aria-label="إغلاق قائمة التنقل">
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="sr-only">
            <SheetTitle>قائمة التنقل</SheetTitle>
            <SheetDescription>روابط Sakan 4U العامة والحساب.</SheetDescription>
          </div>
          <nav className="grid gap-1 p-4" aria-label="التنقل على الجوال">
            {publicNavigationItems.map(item => (
              <Link key={item.href} href={item.href} onClick={closeMobileMenu} className="rounded-xl px-4 py-3.5 text-sm font-black text-[#0f172a] transition-colors hover:bg-[#eff6ff] hover:text-[#1d4ed8]">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto border-t border-[#e2e8f0] p-4">
            {!loading && isAuthenticated ? (
              <Button onClick={() => { closeMobileMenu(); goAccount(); }} className="h-11 w-full rounded-xl bg-[#0f172a] font-black hover:bg-[#1e3a8a]">
                <UserRound className="ml-2 h-4 w-4" />الانتقال إلى حسابي
              </Button>
            ) : (
              <div className="grid gap-2">
                <Link href="/login" onClick={closeMobileMenu} className="flex h-11 items-center justify-center rounded-xl border border-[#cbd5e1] bg-white text-sm font-black text-[#0f172a]">تسجيل الدخول</Link>
                <Link href="/signup/student" onClick={closeMobileMenu} className="flex h-11 items-center justify-center rounded-xl bg-[#2563eb] text-sm font-black text-white shadow-[0_8px_20px_rgba(37,99,235,.22)]">إنشاء حساب طالب</Link>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
