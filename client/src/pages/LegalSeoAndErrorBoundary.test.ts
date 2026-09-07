import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Legal, metadata, and crash-fallback readiness", () => {
  const app = readFileSync(resolve(process.cwd(), "client/src/App.tsx"), "utf8");
  const auth = readFileSync(resolve(process.cwd(), "client/src/pages/Auth.tsx"), "utf8");
  const detail = readFileSync(resolve(process.cwd(), "client/src/pages/PropertyDetails.tsx"), "utf8");
  const boundary = readFileSync(resolve(process.cwd(), "client/src/components/ErrorBoundary.tsx"), "utf8");
  const html = readFileSync(resolve(process.cwd(), "client/index.html"), "utf8");
  const vite = readFileSync(resolve(process.cwd(), "server/_core/vite.ts"), "utf8");
  const robots = readFileSync(resolve(process.cwd(), "client/public/robots.txt"), "utf8");
  const sitemap = readFileSync(resolve(process.cwd(), "client/public/sitemap.xml"), "utf8");

  it("provides terms and privacy routes plus mandatory linked registration consent", () => {
    expect(app).toContain('path="/terms"');
    expect(app).toContain('path="/privacy"');
    expect(auth).toContain("legalConsent");
    expect(auth).toContain("يجب الموافقة على الشروط والأحكام وسياسة الخصوصية");
    expect(auth).toContain('disabled={busy || (isRegistration && !legalConsent)}');
  });

  it("sets safe default and dynamic property Open Graph metadata without a Next.js dependency", () => {
    expect(html).toContain("<title>Sakan 4U | سكن طلابي موثوق</title>");
    expect(html).toContain('name="description" content="Sakan 4U — منصة سكن طلابي موثوق تساعد الطلاب على اكتشاف إعلانات موثقة وطلب معاينات آمنة في بني سويف."');
    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:description"');
    expect(html).toContain('property="og:url" content="/"');
    expect(robots).toContain("Disallow: /admin");
    expect(robots).toContain("Sitemap: /sitemap.xml");
    expect(sitemap).toContain("<loc>/</loc>");
    expect(sitemap).toContain("<loc>/terms</loc>");
    expect(sitemap).toContain("<loc>/privacy</loc>");
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(detail).toContain("document.title = `${property.title} | Sakan 4U`");
    expect(detail).toContain("property.approximateLocation");
    expect(vite).toContain("getPublicProperty");
    expect(vite).toContain('media.isPrimary)?.url ?? property.media?.[0]?.url');
    expect(vite).toContain('property="og:image"');
    expect(vite).toContain('property="og:url"');
    expect(vite).toContain('name="twitter:image"');
    expect(vite).toContain("escapeHtml");
    expect(vite).toContain("requestOrigin");
  });

  it("keeps a non-technical branded Arabic reload fallback around the React tree", () => {
    const serverError = readFileSync(resolve(process.cwd(), "client/src/pages/ServerError.tsx"), "utf8");
    expect(boundary).toContain("<ServerError onRetry={() => window.location.reload()} />");
    expect(serverError).toContain("عذراً، حدث خطأ غير متوقع");
    expect(serverError).toContain("إعادة تحميل الصفحة");
    expect(boundary).not.toContain("error?.stack");
  });
});
