import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native property view analytics", () => {
  const migration = source("supabase/migrations/20260828003000_property_view_analytics.sql");
  const db = source("server/db.ts");
  const router = source("server/routers.ts");
  const details = source("client/src/pages/PropertyDetails.tsx");
  const ownerCard = source("client/src/components/OwnerPropertyManagementCard.tsx");
  const superAdmin = source("client/src/pages/SuperAdmin.tsx");

  it("stores a non-negative counter and de-duplicates one public property view per opaque browser session", () => {
    expect(migration).toContain("add column if not exists views_count integer not null default 0");
    expect(migration).toContain("properties_views_count_nonnegative_check check (views_count >= 0)");
    expect(migration).toContain("create table if not exists public.property_view_sessions");
    expect(migration).toContain("primary key (property_id, visitor_session_id)");
    expect(migration).toContain("on conflict (property_id, visitor_session_id) do nothing");
    expect(migration).toContain("if not found then return false; end if;");
  });

  it("uses a security-definer RPC that counts only live public listings and blocks direct counter updates", () => {
    expect(migration).toContain("create or replace function public.record_property_view(target_property_id uuid, p_visitor_session_id uuid)");
    expect(migration).toContain("values (property_row.id, p_visitor_session_id)");
    expect(migration).toContain("security definer set search_path = ''");
    expect(migration).toContain("verification_status = 'verified'::public.verification_status");
    expect(migration).toContain("availability_status in ('available'::public.availability_status, 'reserved'::public.availability_status)");
    expect(migration).toContain("create or replace function private.enforce_property_view_counter()");
    expect(migration).toContain("لا يمكن تعديل عداد مشاهدات العقار مباشرة.");
    expect(migration).toContain("revoke all on table public.property_view_sessions from public, anon, authenticated");
    expect(migration).toContain("revoke all on function public.record_property_view(uuid, uuid) from anon, authenticated");
    expect(migration).toContain("grant execute on function public.record_property_view(uuid, uuid) to service_role");
  });

  it("keeps public property projections counter-free while owners and the Super Admin receive only their intended analytics", () => {
    expect(db).toContain("views_count: _viewsCount");
    expect(db).toContain("supabaseAdmin.rpc(\"record_property_view\", { target_property_id: propertyId, p_visitor_session_id: visitorSessionId })");
    expect(router).toContain("trackView: publicProcedure");
    expect(router).toContain("propertyViewStats: superAdminProcedure");
    expect(details).toContain("getPropertyViewSessionId");
    expect(details).toContain("trackView.mutate({ propertyId: property.id, sessionId })");
    expect(ownerCard).toContain("property.viewsCount ?? 0");
    expect(superAdmin).toContain("totalPropertyViews");
  });
});
