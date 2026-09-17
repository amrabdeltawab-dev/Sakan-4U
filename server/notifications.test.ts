import { afterEach, describe, expect, it, vi } from "vitest";
import { sendBookingNotification, sendBookingNotificationToOwner, sendBookingNotificationToStudent, type BookingNotificationKind } from "./bookingNotifications";
import { sendPropertyReviewEmail, sendPropertySubmittedEmail, sendOwnerLeadEmail } from "./propertyNotifications";

const mockEnv = { RESEND_API_KEY: "re_test_key" };

function mockFetch() {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email_123" }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockGetBookingNotificationDetails(details: {
  property: { id: string; title: string; ownerId: string };
  student: { name: string; email: string | null; phone: string };
  owner: { name: string; email: string | null; phone: string | null };
  requestedViewingAt: string;
}) {
  vi.doMock("./db", () => ({
    getBookingNotificationDetails: vi.fn().mockResolvedValue(details),
  }));
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("./db");
  vi.resetModules();
});

describe("Booking email notifications", () => {
  it("sends new_request email to owner", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة فاخرة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToOwner: fn } = await import("./bookingNotifications");
    const result = await fn("new_request", "booking-1", mockEnv);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.to).toEqual(["owner@test.com"]);
    expect(body.subject).toContain("طلب معاينة جديد");
  });

  it("sends contacted email to student", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fn } = await import("./bookingNotifications");
    const result = await fn("contacted", "booking-1", mockEnv);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.to).toEqual(["student@test.com"]);
    expect(body.subject).toContain("متابعة طلب المعاينة");
  });

  it("sends owner_confirmed email to student", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fn } = await import("./bookingNotifications");
    const result = await fn("owner_confirmed", "booking-1", mockEnv);
    expect(result).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.subject).toContain("تم تأكيد طلب المعاينة");
  });

  it("sends completed email to both student and owner", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fnStudent, sendBookingNotificationToOwner: fnOwner } = await import("./bookingNotifications");
    await fnStudent("completed", "booking-1", mockEnv);
    await fnOwner("completed", "booking-1", mockEnv);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends rejected email to student", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fn } = await import("./bookingNotifications");
    const result = await fn("rejected", "booking-1", mockEnv);
    expect(result).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.subject).toContain("تحديث طلب المعاينة");
  });

  it("sends cancelled email to student and owner", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fnStudent, sendBookingNotificationToOwner: fnOwner } = await import("./bookingNotifications");
    await fnStudent("cancelled", "booking-1", mockEnv);
    await fnOwner("cancelled", "booking-1", mockEnv);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends rescheduled email to student and owner", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fnStudent, sendBookingNotificationToOwner: fnOwner } = await import("./bookingNotifications");
    await fnStudent("rescheduled", "booking-1", mockEnv);
    await fnOwner("rescheduled", "booking-1", mockEnv);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.subject).toContain("تم تغيير موعد المعاينة");
  });

  it("sends student_confirmed email to owner", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToOwner: fn } = await import("./bookingNotifications");
    const result = await fn("student_confirmed", "booking-1", mockEnv);
    expect(result).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.to).toEqual(["owner@test.com"]);
    expect(body.subject).toContain("تأكيد الطالب");
  });

  it("skips sending when recipient email is null", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: null, phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fn } = await import("./bookingNotifications");
    const result = await fn("contacted", "booking-1", mockEnv);
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw when email send fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("NODE_ENV", "production");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fn } = await import("./bookingNotifications");
    const result = await fn("contacted", "booking-1", mockEnv);
    expect(result).toBe(false);
  });

  it("skips in test environment", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "test");
    mockGetBookingNotificationDetails({
      property: { id: "p1", title: "شقة", ownerId: "o1" },
      student: { name: "أحمد", email: "student@test.com", phone: "010" },
      owner: { name: "مالك", email: "owner@test.com", phone: "020" },
      requestedViewingAt: "2026-01-01T10:00:00Z",
    });
    const { sendBookingNotificationToStudent: fn } = await import("./bookingNotifications");
    const result = await fn("contacted", "booking-1", mockEnv);
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Property review email notifications", () => {
  function mockSupabaseAdmin(propertyData: any, ownerData: any, staffData: any[] = []) {
    const propertyResult = { data: propertyData, error: null };
    const ownerResult = { data: ownerData, error: null };
    const staffResult = { data: staffData, error: null };
    vi.doMock("./supabase", () => ({
      supabaseAdmin: {
        from: vi.fn().mockImplementation((table: string) => ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(
                table === "properties" ? propertyResult : ownerResult,
              ),
            }),
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue(staffResult),
            }),
          }),
        })),
      },
    }));
  }

  it("sends verified email to owner", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockSupabaseAdmin(
      { id: "p1", title: "شقة", owner_id: "o1", review_reason: null },
      { full_name: "مالك", email: "owner@test.com" },
    );
    const { sendPropertyReviewEmail: fn } = await import("./propertyNotifications");
    const result = await fn("p1", "verified", undefined, mockEnv);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.to).toEqual(["owner@test.com"]);
    expect(body.subject).toContain("تم اعتماد إعلانك");
  });

  it("sends needs_changes email to owner with reason", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockSupabaseAdmin(
      { id: "p1", title: "شقة", owner_id: "o1", review_reason: null },
      { full_name: "مالك", email: "owner@test.com" },
    );
    const { sendPropertyReviewEmail: fn } = await import("./propertyNotifications");
    const result = await fn("p1", "needs_changes", "الصور غير واضحة", mockEnv);
    expect(result).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.subject).toContain("تعديل مطلوب");
    expect(body.html).toContain("الصور غير واضحة");
  });

  it("sends rejected email to owner", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockSupabaseAdmin(
      { id: "p1", title: "شقة", owner_id: "o1", review_reason: "مخالف" },
      { full_name: "مالك", email: "owner@test.com" },
    );
    const { sendPropertyReviewEmail: fn } = await import("./propertyNotifications");
    const result = await fn("p1", "rejected", undefined, mockEnv);
    expect(result).toBe(true);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.subject).toContain("تم رفض إعلانك");
  });

  it("does not throw when owner email is missing", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    mockSupabaseAdmin(
      { id: "p1", title: "شقة", owner_id: "o1", review_reason: null },
      { full_name: "مالك", email: null },
    );
    const { sendPropertyReviewEmail: fn } = await import("./propertyNotifications");
    const result = await fn("p1", "verified", undefined, mockEnv);
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("Owner lead email notifications", () => {
  it("sends owner lead email to staff", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("./supabase", () => ({
      supabaseAdmin: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({
                data: [{ email: "admin@test.com" }, { email: "super@test.com" }],
                error: null,
              }),
            }),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      },
    }));
    const { sendOwnerLeadEmail: fn } = await import("./propertyNotifications");
    const result = await fn("lead-1", "محمد", "01012345678", "بني سويف", mockEnv);
    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body1 = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body1.subject).toContain("طلب مالك جديد");
    expect(body1.html).toContain("محمد");
  });

  it("returns false when no staff emails exist", async () => {
    const fetchMock = mockFetch();
    vi.stubEnv("NODE_ENV", "production");
    vi.doMock("./supabase", () => ({
      supabaseAdmin: {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      },
    }));
    const { sendOwnerLeadEmail: fn } = await import("./propertyNotifications");
    const result = await fn("lead-1", "محمد", "010", "بني سويف", mockEnv);
    expect(result).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
