import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const authSource = readFileSync(fileURLToPath(new URL("./Auth.tsx", import.meta.url)), "utf8");

describe("Auth responsive layout containment", () => {
  it("keeps the authentication shell and form shrinkable on narrow RTL viewports", () => {
    expect(authSource).toContain('min-h-screen w-full overflow-x-hidden');
    expect(authSource).toContain('grid min-h-screen w-full min-w-0 place-items-center px-5 py-10');
    expect(authSource).toContain('w-full min-w-0 max-w-[520px]');
    expect(authSource).toContain('sakeno-surface w-full min-w-0 p-6 sm:p-9');
    expect(authSource).not.toContain('lg:grid-cols-[.85fr_1.15fr]');
    expect(authSource).toContain('form className="mt-8 min-w-0 space-y-4"');
  });
});
