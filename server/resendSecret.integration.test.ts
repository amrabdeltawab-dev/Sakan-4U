import { describe, expect, it } from "vitest";
import { runtimeEnv } from "../scripts/runtime-env.mjs";

const hasResendKey = Boolean(runtimeEnv.RESEND_API_KEY);

describe.skipIf(!hasResendKey)("Resend runtime secret", () => {
  it("authenticates against Resend without sending an email", async () => {
    const apiKey = runtimeEnv.RESEND_API_KEY;
    expect(apiKey, "RESEND_API_KEY must be configured for this validation").toBeTruthy();

    const response = await fetch("https://api.resend.com/domains", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type") ?? "").toContain("application/json");
  }, 30_000);
});

describe.skipIf(hasResendKey)("Resend runtime secret (skipped)", () => {
  it("skips when RESEND_API_KEY is not configured", () => {
    expect(true).toBe(true);
  });
});
