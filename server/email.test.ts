import { afterEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "./email";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Resend fetch email utility", () => {
  it("posts the notification payload through the standard global fetch API", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail({ to: "owner@example.com", subject: "New Booking Request", html: "<p>Request</p>" }, { RESEND_API_KEY: "re_test_key" })).resolves.toEqual({ id: "email_123" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ Authorization: "Bearer re_test_key", "Content-Type": "application/json" });
    expect(JSON.parse(String(init.body))).toMatchObject({ from: "onboarding@resend.dev", to: ["owner@example.com"], subject: "New Booking Request", html: "<p>Request</p>" });
  });

  it("rejects before making a request when the server-only API key is missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendEmail({ to: "student@example.com", subject: "Update", html: "<p>Update</p>" }, {})).rejects.toThrow("RESEND_API_KEY is missing");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
