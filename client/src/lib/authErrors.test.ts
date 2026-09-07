import { describe, expect, it } from "vitest";
import { authErrorMessage, canShowRegistrationSuccess } from "./authErrors";

describe("Supabase registration error handling", () => {
  it("translates Supabase email delivery rate limiting into clear Arabic guidance", () => {
    expect(authErrorMessage({ message: "Email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 })).toContain("الحد المؤقت");
    expect(authErrorMessage({ message: "Email rate limit exceeded" })).toContain("لم يكتمل إنشاء الحساب");
  });

  it("only permits the registration confirmation state after Supabase returns a user", () => {
    expect(canShowRegistrationSuccess("user-id")).toBe(true);
    expect(canShowRegistrationSuccess()).toBe(false);
  });
});
