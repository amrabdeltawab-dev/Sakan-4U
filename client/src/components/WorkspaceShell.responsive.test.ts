import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WorkspaceShell responsive access gate", () => {
  it("constrains the unauthenticated RTL gate card to the available mobile width", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/components/WorkspaceShell.tsx"), "utf8");
    expect(source).toContain('className="fixed inset-0 z-50 grid min-h-screen w-screen place-items-center overflow-hidden bg-[#f8fafc] p-4"');
    expect(source).toContain('className="box-border w-full min-w-0 max-w-[calc(100vw-2rem)] break-words rounded-[28px]');
  });
});
