import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "client/src/components/OwnerPropertyCreateWizard.tsx"), "utf8");

describe("owner property wizard validation feedback", () => {
  it("keeps bathrooms validation inline until the submit handler runs", () => {
    expect(source).toContain("aria-invalid={!validBathrooms}");
    expect(source).toContain("const reportSubmitError");
    expect(source).toContain("!validBathrooms ? \"يرجى إدخال عدد الحمامات بشكل صحيح");
  });

  it("does not toast for invalid verification files during selection", () => {
    const selectionBlock = source.slice(source.indexOf("const selectVerificationDocument"), source.indexOf("const reportSubmitError"));
    expect(selectionBlock).not.toContain("toast.error");
    expect(selectionBlock).toContain("setFormError");
  });
});
