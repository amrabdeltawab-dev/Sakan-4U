import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), "utf8");

describe("booking email success toast wiring", () => {
  it("shows the exact success toast after a student booking succeeds", () => {
    const source = readSource("client/src/components/BookingRequestPanel.tsx");
    expect(source).toContain("toast.success('Email sent successfully!')");
    expect(source).toMatch(/onSuccess:\s*\(\)\s*=>[^\n]*toast\.success\('Email sent successfully!'\)/);
  });

  it("shows the exact success toast only for owner accept/reject outcomes", () => {
    const source = readSource("client/src/pages/Owner.tsx");
    expect(source).toContain("toast.success('Email sent successfully!')");
    expect(source).toContain('variables.status === "OWNER_CONFIRMED" || variables.status === "REJECTED"');
  });
});
