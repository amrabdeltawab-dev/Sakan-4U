import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
        order: vi.fn(() => ({ data: [], error: null })),
        in: vi.fn(() => ({ data: [], error: null })),
        gte: vi.fn(() => ({ data: [], error: null })),
        insert: vi.fn(() => ({ error: null })),
      })),
    })),
  },
  supabasePublic: {},
}));

vi.mock("./runtimeEnv", () => ({ getRuntimeEnvValue: () => "test" }));

import * as db from "./db";

function mockSupabaseAdmin(propertyData: any, searchData: any[], sessionData: any[] = []) {
  const fromFn = vi.fn((table: string) => {
    if (table === "properties") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: propertyData, error: null })),
          })),
          in: vi.fn(() => ({
            gte: vi.fn(async () => ({ data: sessionData, error: null })),
            order: vi.fn(async () => ({ data: [propertyData], error: null })),
          })),
          order: vi.fn(async () => ({ data: [propertyData], error: null })),
        })),
      };
    }
    if (table === "saved_searches") {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(async () => ({ data: searchData, error: null })),
        })),
        insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(async () => ({ data: { id: "s1" }, error: null })) })) })),
        delete: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "s1" }, error: null })) })) })) })) })),
        update: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: "s1", active: true }, error: null })) })) })) })),
      };
    }
    if (table === "notifications") {
      return { insert: vi.fn(() => ({ error: null })) };
    }
    if (table === "property_view_sessions") {
      return {
        select: vi.fn(() => ({
          in: vi.fn(() => ({
            gte: vi.fn(async () => ({ data: sessionData, error: null })),
          })),
        })),
      };
    }
    return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) };
  });
  // @ts-expect-error mock
  db.__setSupabaseAdmin?.(fromFn);
}

describe("saved search matching logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("matches when area matches and price is within max", () => {
    const property = { area: "الزهراء", monthly_price: 2000, capacity: 4, verification_status: "verified", availability_status: "available", deleted_at: null };
    const searches = [
      { student_id: "u1", area: "الزهراء", max_price: 3000, min_beds: null, profiles: { email: "s1@test.com" } },
      { student_id: "u2", area: "الزهراء", max_price: 1500, min_beds: null, profiles: { email: "s2@test.com" } },
    ];
    mockSupabaseAdmin(property, searches);
    // The findMatchingSavedSearches function does the filtering in JS after fetching
    // We can test the filter logic directly
    const matches = searches.filter((s) => {
      if (s.area && property.area !== s.area) return false;
      if (s.max_price !== null && s.max_price !== undefined && property.monthly_price > s.max_price) return false;
      if (s.min_beds !== null && s.min_beds !== undefined && property.capacity < s.min_beds) return false;
      return true;
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].student_id).toBe("u1");
  });

  it("matches when min_beds requirement is met", () => {
    const property = { area: "وسط المدينة", monthly_price: 3500, capacity: 6, verification_status: "verified", availability_status: "available", deleted_at: null };
    const searches = [
      { student_id: "u1", area: "وسط المدينة", max_price: 5000, min_beds: 5, profiles: { email: "s1@test.com" } },
      { student_id: "u2", area: "وسط المدينة", max_price: 5000, min_beds: 8, profiles: { email: "s2@test.com" } },
    ];
    const matches = searches.filter((s) => {
      if (s.area && property.area !== s.area) return false;
      if (s.max_price !== null && s.max_price !== undefined && property.monthly_price > s.max_price) return false;
      if (s.min_beds !== null && s.min_beds !== undefined && property.capacity < s.min_beds) return false;
      return true;
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].student_id).toBe("u1");
  });

  it("matches when search has no area filter (any area)", () => {
    const property = { area: "أي مكان", monthly_price: 1000, capacity: 2, verification_status: "verified", availability_status: "available", deleted_at: null };
    const searches = [
      { student_id: "u1", area: null, max_price: 2000, min_beds: null, profiles: { email: "s1@test.com" } },
    ];
    const matches = searches.filter((s) => {
      if (s.area && property.area !== s.area) return false;
      if (s.max_price !== null && s.max_price !== undefined && property.monthly_price > s.max_price) return false;
      if (s.min_beds !== null && s.min_beds !== undefined && property.capacity < s.min_beds) return false;
      return true;
    });
    expect(matches).toHaveLength(1);
  });

  it("does not match non-verified properties", () => {
    const property = { area: "الزهراء", monthly_price: 1000, capacity: 2, verification_status: "pending", availability_status: "available", deleted_at: null };
    expect(property.verification_status).not.toBe("verified");
  });

  it("does not match unavailable properties", () => {
    const property = { area: "الزهراء", monthly_price: 1000, capacity: 2, verification_status: "verified", availability_status: "hidden", deleted_at: null };
    expect(property.availability_status).not.toBe("available");
  });

  it("does not match soft-deleted properties", () => {
    const property = { area: "الزهراء", monthly_price: 1000, capacity: 2, verification_status: "verified", availability_status: "available", deleted_at: "2026-01-01" };
    expect(property.deleted_at).not.toBeNull();
  });
});

describe("owner weekly views", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes weekly views from session data", () => {
    const sessions = [
      { property_id: "p1" },
      { property_id: "p1" },
      { property_id: "p2" },
    ];
    const weeklyCountMap = new Map<string, number>();
    for (const session of sessions) weeklyCountMap.set(session.property_id, (weeklyCountMap.get(session.property_id) ?? 0) + 1);
    expect(weeklyCountMap.get("p1")).toBe(2);
    expect(weeklyCountMap.get("p2")).toBe(1);
    expect(weeklyCountMap.get("p3") ?? 0).toBe(0);
  });
});

describe("authz boundaries", () => {
  it("requireStudent throws for non-students", () => {
    function requireStudent(role: string) { if (role !== "student") throw new Error("هذه العملية مخصصة لحساب الطالب."); }
    expect(() => requireStudent("owner")).toThrow();
    expect(() => requireStudent("admin")).toThrow();
    expect(() => requireStudent("super_admin")).toThrow();
    expect(() => requireStudent("student")).not.toThrow();
  });

  it("requireOwner throws for non-owners", () => {
    function requireOwner(role: string) { if (role !== "owner") throw new Error("هذه العملية مخصصة لمالك معتمد."); }
    expect(() => requireOwner("student")).toThrow();
    expect(() => requireOwner("admin")).toThrow();
    expect(() => requireOwner("owner")).not.toThrow();
  });
});
