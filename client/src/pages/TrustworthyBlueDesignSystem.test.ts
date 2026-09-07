import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("Sakan 4U trustworthy blue design system", () => {
  it("defines the requested blue, slate, emerald, and elevated-surface tokens", () => {
    const css = read("client/src/index.css");
    expect(css).toContain("--primary: #2563eb");
    expect(css).toContain("--foreground: #0f172a");
    expect(css).toContain("--background: #f8fafc");
    expect(css).toContain("--accent: #ecfdf5");
    expect(css).toContain(".sakeno-surface");
    expect(css).toContain("transition: all .3s");
  });

  it("uses a light discovery hero and a centered, non-split authentication card", () => {
    const home = read("client/src/pages/Home.tsx");
    const auth = read("client/src/pages/Auth.tsx");
    expect(home).toContain('bg-[#f8fafc]');
    expect(home).toContain('sakeno-primary-action h-12');
    expect(auth).toContain('grid min-h-screen w-full min-w-0 place-items-center');
    expect(auth).toContain('sakeno-surface w-full min-w-0 p-6 sm:p-9');
    expect(auth).not.toContain('lg:grid-cols-[.85fr_1.15fr]');
  });

  it("uses soft, rounded property cards with emerald prices and blue navigation states", () => {
    const card = read("client/src/components/PropertyCard.tsx");
    const shell = read("client/src/components/WorkspaceShell.tsx");
    expect(card).toContain('rounded-2xl border border-transparent bg-white shadow-sm transition-all duration-300');
    expect(card).toContain('text-[#059669]');
    expect(shell).toContain('bg-[#2563eb] text-white shadow-lg shadow-[#2563eb]/20');
  });
});
