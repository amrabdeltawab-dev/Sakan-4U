import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("bed-rental booking inventory migration", () => {
  const migration = source("supabase/migrations/20260827200000_bed_rental_booking_inventory.sql");
  const noShowReleaseMigration = source("supabase/migrations/20260827210000_restore_bed_inventory_on_no_show.sql");
  const db = source("server/db.ts");

  it("adds a counter tied to total bed capacity and derives it instead of accepting client-controlled inventory", () => {
    expect(migration).toContain("add column if not exists available_beds smallint");
    expect(migration).toContain("set available_beds = total_beds");
    expect(migration).toContain("available_beds between 0 and total_beds");
    expect(migration).toContain("new.available_beds := new.total_beds");
    expect(migration).toContain("لا يمكن تغيير الأسرة المتاحة إلا من خلال تأكيد طلب سرير أو إلغائه.");
  });

  it("takes exactly one bed only for an authorized owner confirmation and rolls back the transition when inventory is depleted", () => {
    expect(migration).toContain("old.requested_rent_type = 'bed'::public.rent_type");
    expect(migration).toContain("set available_beds = available_beds - 1");
    expect(migration).toContain("and available_beds > 0");
    expect(migration).toContain("get diagnostics inventory_changed = row_count");
    expect(migration).toContain("if inventory_changed <> 1 then raise exception 'لا يوجد سرير متاح لتأكيد هذا الطلب.'");
    expect(migration).toContain("set available_beds = least(total_beds, available_beds + 1)");
  });

  it("takes an immutable rental-mode snapshot at request creation and blocks zero-inventory requests at the database gate", () => {
    expect(migration).toContain("add column if not exists requested_rent_type public.rent_type not null default 'full'");
    expect(migration).toContain("requested_rent_type is distinct from new.requested_rent_type");
    expect(migration).toContain("requested_rent_type)\n    values");
    expect(migration).toContain("property_record.rent_type");
    expect(migration).toContain("and (rent_type = 'full'::public.rent_type or available_beds > 0)");
  });

  it("restores a previously confirmed bed only for cancellation, rejection, or a no-show terminal transition", () => {
    expect(noShowReleaseMigration).toContain("'cancelled'::public.booking_status, 'rejected'::public.booking_status, 'no_show'::public.booking_status");
    expect(noShowReleaseMigration).toContain("and old.status = 'owner_confirmed'::public.booking_status");
    expect(noShowReleaseMigration).toContain("set available_beds = least(total_beds, available_beds + 1)");
    expect(noShowReleaseMigration).toContain("availability_status = case when availability_status = 'hidden'::public.availability_status then 'available'");
    expect(noShowReleaseMigration).not.toContain("'completed'::public.booking_status)");
  });

  it("excludes sold-out bed rentals from public discovery, individual details, similar listings, and favorites", () => {
    expect(db).toContain('return row.rent_type !== "bed" || Number(row.available_beds) > 0;');
    expect(db).toContain("isPubliclyAvailableProperty(item)");
    expect(db).toContain("data && isPubliclyAvailableProperty(data)");
    expect(db).toContain("similarPrice ?? []) if (isPubliclyAvailableProperty(property)");
  });
});
