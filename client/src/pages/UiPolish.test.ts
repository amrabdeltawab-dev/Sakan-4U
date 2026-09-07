import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Arabic marketplace UI polish", () => {
  const home = source("client/src/pages/Home.tsx");
  const css = source("client/src/index.css");
  const notFound = source("client/src/pages/NotFound.tsx");
  const serverError = source("client/src/pages/ServerError.tsx");
  const app = source("client/src/App.tsx");

  it("renders four bounded shimmer cards while marketplace data is loading", () => {
    expect(home).toContain("Array.from({ length: 4 }");
    expect(home).toContain("sakeno-skeleton aspect-[16/9]");
    expect(home).toContain("w-full max-w-[320px] justify-self-start");
    expect(css).toContain(".sakeno-skeleton::after");
    expect(css).toContain("@keyframes sakeno-shimmer");
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("keeps branded Arabic 404 and 500 views with a direct homepage return", () => {
    expect(notFound).toContain('dir="rtl"');
    expect(notFound).toContain("لم نعثر على هذه الصفحة");
    expect(notFound).toContain("العودة للصفحة الرئيسية");
    expect(serverError).toContain("Sakan 4U");
    expect(serverError).toContain("تعذر إتمام الطلب الآن");
    expect(serverError).toContain("العودة للصفحة الرئيسية");
    expect(notFound).toContain("min-h-screen w-full min-w-0 max-w-full");
    expect(serverError).toContain("min-h-screen w-full min-w-0 max-w-full");
    expect(app).toContain('path="/500"');
  });
});
