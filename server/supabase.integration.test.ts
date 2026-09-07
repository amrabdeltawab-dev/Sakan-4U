import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createSupabaseClients, setSupabaseRuntime, supabaseAdmin, supabaseForAccessToken, supabasePublic } from "./supabase";
import { getRuntimeEnvValue } from "./runtimeEnv";
import { cleanupPropertyStorage, listSimilarPublicProperties } from "./db";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const password = "SakenoTest!2026";
const testRuntimeEnv = { VITE_SUPABASE_URL: getRuntimeEnvValue("VITE_SUPABASE_URL"), VITE_SUPABASE_PUBLISHABLE_KEY: getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY"), SUPABASE_SERVICE_ROLE_KEY: getRuntimeEnvValue("SUPABASE_SERVICE_ROLE_KEY"), SUPABASE_BOOTSTRAP_SUPER_ADMIN_EMAIL: getRuntimeEnvValue("SUPABASE_BOOTSTRAP_SUPER_ADMIN_EMAIL") };
setSupabaseRuntime(createSupabaseClients(testRuntimeEnv));
const anonymousClient = createClient(getRuntimeEnvValue("VITE_SUPABASE_URL")!, getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
const createdIds: string[] = [];
let student: { id: string; token: string; email: string }; let otherStudent: { id: string; token: string; email: string }; let owner: { id: string; token: string; email: string }; let intruderOwner: { id: string; token: string; email: string }; let admin: { id: string; token: string; email: string }; let superAdmin: { id: string; token: string; email: string }; let propertyId = ""; let privatePath = ""; let publicPath = "";

async function createConfirmedUser(label: string) {
  const email = `sakeno-${label}-${suffix}@example.com`;
  const { data, error } = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `SAKENO ${label}`, legal_consent: true } });
  if (error || !data.user) throw error ?? new Error("Could not create Supabase test user");
  createdIds.push(data.user.id);
  const { data: sessionData, error: loginError } = await supabasePublic.auth.signInWithPassword({ email, password });
  if (loginError || !sessionData.session) throw loginError ?? new Error("Could not obtain Supabase test session");
  return { id: data.user.id, token: sessionData.session.access_token, email };
}

async function createBookingFixture() {
  const ownerClient = supabaseForAccessToken(owner.token);
  const studentClient = supabaseForAccessToken(student.token);
  const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: `تدفق حجز آمن ${crypto.randomUUID().slice(0, 8)}`, property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار مخصص للتحقق من تسلسل حالات الحجز المصرح به.", monthly_price: 3500, bedrooms: 4, bathrooms: 1, capacity: 4, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"], verification_status: "draft" }).select().single();
  expect(propertyError).toBeNull();
  expect((await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", property!.id)).error).toBeNull();
  const { data: booking, error: bookingError } = await studentClient.rpc("create_viewing_request", { target_property_id: property!.id, target_requested_viewing_at: new Date(Date.now() + 172_800_000).toISOString(), target_contact_name: "طالب اختبار", target_phone: "01000000000", target_people_count: 1, target_notes: "ملاحظة تنسيق داخلية", target_terms_accepted: true });
  expect(bookingError).toBeNull();
  return booking!;
}

async function transition(client: any, bookingId: string, status: string) {
  return client.rpc("transition_booking_status", { target_booking_id: bookingId, target_status: status });
}

async function moveToOwnerConfirmed(bookingId: string) {
  const ownerClient = supabaseForAccessToken(owner.token);
  expect((await transition(ownerClient, bookingId, "contacted")).error).toBeNull();
  expect((await transition(ownerClient, bookingId, "owner_confirmed")).error).toBeNull();
}

async function completeViewingForDecision(bookingId: string) {
  const adminClient = supabaseForAccessToken(admin.token);
  expect((await adminClient.rpc("record_manual_inspection_payment", { target_booking_id: bookingId, target_reference: `MAN-${crypto.randomUUID()}` })).error).toBeNull();
  expect((await adminClient.rpc("schedule_viewing", { target_booking_id: bookingId, target_viewing_at: new Date(Date.now() + 172_800_000).toISOString() })).error).toBeNull();
  expect((await adminClient.rpc("complete_viewing", { target_booking_id: bookingId })).error).toBeNull();
}

describe.sequential("Supabase Auth and RLS integration", () => {
  beforeAll(async () => {
    student = await createConfirmedUser("student"); otherStudent = await createConfirmedUser("other-student"); owner = await createConfirmedUser("owner"); intruderOwner = await createConfirmedUser("intruder-owner"); admin = await createConfirmedUser("admin"); superAdmin = await createConfirmedUser("super-admin");
    await supabaseAdmin.from("profiles").update({ role: "owner" }).eq("id", owner.id);
    await supabaseAdmin.from("profiles").update({ role: "owner" }).eq("id", intruderOwner.id);
    await supabaseAdmin.from("profiles").update({ role: "admin" }).eq("id", admin.id);
    await supabaseAdmin.from("profiles").update({ role: "super_admin" }).eq("id", superAdmin.id);
  }, 30_000);

  it("decrements available bed inventory only after authorized owner confirmations and hides a sold-out bed rental", async () => {
    const ownerClient = supabaseForAccessToken(owner.token);
    const studentClient = supabaseForAccessToken(student.token);
    const otherStudentClient = supabaseForAccessToken(otherStudent.token);
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: `سكن سرير آمن ${crypto.randomUUID().slice(0, 8)}`, property_type: "shared_room", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "سكن مشترك مخصص للتحقق من مخزون الأسرة ومنع تجاوز السعة عند التأكيد.", monthly_price: 1800, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "male", gender_preference: "male", furnished: true, amenities: ["واي فاي"], verification_status: "draft", rent_type: "bed", total_beds: 2 }).select("id, rent_type, total_beds, available_beds").single();
    expect(propertyError).toBeNull(); expect(property).toMatchObject({ rent_type: "bed", total_beds: 2, available_beds: 2 });
    expect((await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", property!.id)).error).toBeNull();
    const makeRequest = (client: any, name: string) => client.rpc("create_viewing_request", { target_property_id: property!.id, target_requested_viewing_at: new Date(Date.now() + 172_800_000).toISOString(), target_contact_name: name, target_phone: "01000000000", target_people_count: 1, target_notes: "طلب سرير واحد", target_terms_accepted: true });
    const first = await makeRequest(studentClient, "طالب السرير الأول");
    expect(first.error).toBeNull(); expect(first.data?.requested_rent_type).toBe("bed");
    expect((await transition(ownerClient, first.data!.id, "contacted")).error).toBeNull();
    expect((await transition(ownerClient, first.data!.id, "owner_confirmed")).error).toBeNull();
    const oneRemaining = await supabaseAdmin.from("properties").select("available_beds, availability_status").eq("id", property!.id).single();
    expect(oneRemaining.data).toMatchObject({ available_beds: 1, availability_status: "available" });
    const second = await makeRequest(otherStudentClient, "طالب السرير الثاني");
    expect(second.error).toBeNull();
    expect((await transition(ownerClient, second.data!.id, "contacted")).error).toBeNull();
    expect((await transition(ownerClient, second.data!.id, "owner_confirmed")).error).toBeNull();
    const soldOut = await supabaseAdmin.from("properties").select("available_beds, availability_status").eq("id", property!.id).single();
    expect(soldOut.data).toMatchObject({ available_beds: 0, availability_status: "hidden" });
    expect((await anonymousClient.from("properties").select("id").eq("id", property!.id)).data).toEqual([]);
    expect((await makeRequest(studentClient, "طلب بعد الاكتمال")).error).toBeTruthy();
    const adminClient = supabaseForAccessToken(admin.token);
    expect((await adminClient.rpc("staff_cancel_viewing", { target_booking_id: second.data!.id, target_reason: "إلغاء مؤكد لاختبار استعادة سرير محجوز" })).error).toBeNull();
    const restoredAfterCancellation = await supabaseAdmin.from("properties").select("available_beds, availability_status").eq("id", property!.id).single();
    expect(restoredAfterCancellation.data).toMatchObject({ available_beds: 1, availability_status: "available" });
    const third = await makeRequest(otherStudentClient, "طالب عدم الحضور");
    expect(third.error).toBeNull();
    expect((await transition(ownerClient, third.data!.id, "contacted")).error).toBeNull();
    expect((await transition(ownerClient, third.data!.id, "owner_confirmed")).error).toBeNull();
    expect((await adminClient.rpc("record_manual_inspection_payment", { target_booking_id: third.data!.id, target_reference: `MAN-${crypto.randomUUID()}` })).error).toBeNull();
    expect((await adminClient.rpc("schedule_viewing", { target_booking_id: third.data!.id, target_viewing_at: new Date(Date.now() + 2_000).toISOString() })).error).toBeNull();
    await new Promise(resolve => setTimeout(resolve, 2_500));
    expect((await adminClient.rpc("record_viewing_no_show", { target_booking_id: third.data!.id, target_party: "student", target_reason: "عدم حضور الطالب بعد تأكيد السرير" })).error).toBeNull();
    const restoredAfterNoShow = await supabaseAdmin.from("properties").select("available_beds, availability_status").eq("id", property!.id).single();
    expect(restoredAfterNoShow.data).toMatchObject({ available_beds: 1, availability_status: "available" });
  }, 45_000);

  it("rejects public student and owner signup without legal consent before any Auth user or profile is created", async () => {
    const cases = [
      { label: "student", metadata: { full_name: "طالب دون موافقة", legal_consent: false } },
      { label: "owner", metadata: { full_name: "مالك دون موافقة", legal_consent: false, desired_role: "owner", owner_request: { phone: "01000000000", experience: "إدارة سكن طلابي لمدة عام", preferred_contact: "01000000000" } } },
    ];
    for (const candidate of cases) {
      const email = `sakeno-legal-rejection-${candidate.label}-${suffix}@example.com`;
      const signup = await supabasePublic.auth.signUp({ email, password, options: { data: candidate.metadata } });
      expect(signup.error).toBeTruthy(); expect(signup.data.user).toBeNull();
      expect((await supabaseAdmin.from("profiles").select("id").eq("email", email)).data).toEqual([]);
      const authUsers = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      expect(authUsers.data.users.some(user => user.email === email)).toBe(false);
    }
  }, 30_000);

  it("requires a valid current Supabase password before a password change can succeed", async () => {
    const email = `sakeno-current-password-${suffix}@example.com`;
    const created = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "SAKENO current-password", legal_consent: true } });
    expect(created.error).toBeNull(); expect(created.data.user).toBeTruthy();
    const account = { id: created.data.user!.id, email };
    createdIds.push(account.id);
    const client = createClient(getRuntimeEnvValue("VITE_SUPABASE_URL")!, getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY")!, { auth: { autoRefreshToken: false, persistSession: false } });
    const rejected = await client.auth.signInWithPassword({ email: account.email, password: "WrongCurrent!2026" });
    expect(rejected.error).toBeTruthy(); expect(rejected.data.user).toBeNull();
    const verified = await client.auth.signInWithPassword({ email: account.email, password });
    expect(verified.error).toBeNull(); expect(verified.data.user?.id).toBe(account.id);
    const newPassword = `UpdatedSakeno!${suffix}`;
    const updated = await client.auth.updateUser({ password: newPassword });
    expect(updated.error).toBeNull();
    await client.auth.signOut();
    expect((await client.auth.signInWithPassword({ email: account.email, password })).error).toBeTruthy();
    expect((await client.auth.signInWithPassword({ email: account.email, password: newPassword })).data.user?.id).toBe(account.id);
  }, 30_000);

  afterAll(async () => {
    if (privatePath) await supabaseAdmin.storage.from("verification-documents").remove([privatePath]);
    if (publicPath) await supabaseAdmin.storage.from("property-images").remove([publicPath]);
    const { data: testProperties, error: testPropertiesError } = await supabaseAdmin.from("properties").select("id").in("owner_id", createdIds);
    if (testPropertiesError) throw testPropertiesError;
    const { data: auditedTestProperties, error: auditedTestPropertiesError } = await supabaseAdmin.from("property_lifecycle_audit").select("property_id").in("owner_id", createdIds);
    if (auditedTestPropertiesError) throw auditedTestPropertiesError;
    const propertyIds = Array.from(new Set([...(testProperties ?? []).map(property => property.id), ...(auditedTestProperties ?? []).map(audit => audit.property_id)]));
    if (propertyIds.length) {
      const { error: notificationsError } = await supabaseAdmin.from("notifications").delete().in("related_property_id", propertyIds);
      if (notificationsError) throw notificationsError;
      for (const propertyId of propertyIds) await cleanupPropertyStorage(propertyId);
      const { error: reviewEventsError } = await supabaseAdmin.from("property_review_events").delete().in("property_id", propertyIds);
      if (reviewEventsError) throw reviewEventsError;
      const { error: propertiesError } = await supabaseAdmin.from("properties").delete().in("id", propertyIds);
      if (propertiesError) throw propertiesError;
      const { error: auditError } = await supabaseAdmin.from("property_lifecycle_audit").delete().in("property_id", propertyIds);
      if (auditError) throw auditError;
    }
    const { data: testApplications, error: testApplicationsError } = await supabaseAdmin.from("owner_applications").select("id").in("user_id", createdIds);
    if (testApplicationsError) throw testApplicationsError;
    for (const application of testApplications ?? []) {
      const { error: notificationsError } = await supabaseAdmin.from("notifications").delete().like("event_key", `owner-application:${application.id}:%`);
      if (notificationsError) throw notificationsError;
    }
    const applicationIds = (testApplications ?? []).map(application => application.id);
    if (applicationIds.length) {
      const { error: applicationsError } = await supabaseAdmin.from("owner_applications").delete().in("id", applicationIds);
      if (applicationsError) throw applicationsError;
    }
    const { error: actorAuditError } = await supabaseAdmin.from("super_admin_user_management_audit").delete().in("actor_id", createdIds);
    if (actorAuditError) throw actorAuditError;
    const { error: targetAuditError } = await supabaseAdmin.from("super_admin_user_management_audit").delete().in("target_user_id", createdIds);
    if (targetAuditError) throw targetAuditError;
    const { error: bootstrapError } = await supabaseAdmin.from("super_admin_bootstrap").delete().in("user_id", createdIds);
    if (bootstrapError) throw bootstrapError;
    await Promise.all(createdIds.map(async id => {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (error && !error.message.includes("User not found")) throw new Error(`تعذر حذف مستخدم الاختبار ${id}: ${error.message}`);
    }));
  }, 30_000);

  it("creates a persistent authenticated session and rejects an invalid token", async () => {
    const valid = await supabaseAdmin.auth.getUser(student.token); expect(valid.data.user?.id).toBe(student.id);
    const invalid = await supabaseAdmin.auth.getUser("not-a-valid-jwt"); expect(invalid.error).toBeTruthy();
    const browserKeyAdminProbe = await supabasePublic.auth.admin.listUsers({ page: 1, perPage: 1 }); expect(browserKeyAdminProbe.error).toBeTruthy();
  });

  it("supports email-password login, session restoration, and logout through Supabase Auth", async () => {
    const memory = new Map<string, string>();
    const storage = { getItem: async (key: string) => memory.get(key) ?? null, setItem: async (key: string, value: string) => { memory.set(key, value); }, removeItem: async (key: string) => { memory.delete(key); } };
    const firstClient = createClient(getRuntimeEnvValue("VITE_SUPABASE_URL")!, getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY")!, { auth: { persistSession: true, autoRefreshToken: false, storage } });
    const login = await firstClient.auth.signInWithPassword({ email: student.email, password }); expect(login.error).toBeNull(); expect(login.data.session?.user.id).toBe(student.id);
    const restoredClient = createClient(getRuntimeEnvValue("VITE_SUPABASE_URL")!, getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY")!, { auth: { persistSession: true, autoRefreshToken: false, storage } });
    const restored = await restoredClient.auth.getSession(); expect(restored.data.session?.user.id).toBe(student.id);
    const logout = await firstClient.auth.signOut(); expect(logout.error).toBeNull();
    const clearedClient = createClient(getRuntimeEnvValue("VITE_SUPABASE_URL")!, getRuntimeEnvValue("VITE_SUPABASE_PUBLISHABLE_KEY")!, { auth: { persistSession: true, autoRefreshToken: false, storage } });
    const cleared = await clearedClient.auth.getSession(); expect(cleared.data.session).toBeNull();
  });

  it("enforces RLS visibility and booking authorization across student, owner, and anonymous sessions", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token);
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "شقة اختبار آمنة", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار آمن لإثبات سياسات الوصول في ساكينو.", monthly_price: 3000, bedrooms: 4, bathrooms: 1, capacity: 4, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select().single();
    expect(propertyError).toBeNull(); expect(property.verification_status).toBe("draft"); propertyId = property.id;
    const anonymousBeforeReview = await anonymousClient.from("properties").select("id").eq("id", propertyId); expect(anonymousBeforeReview.data).toEqual([]);
    await supabaseForAccessToken(admin.token).from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", propertyId);
    const { data: booking, error: bookingError } = await studentClient.rpc("create_viewing_request", { target_property_id: propertyId, target_requested_viewing_at: new Date(Date.now() + 172_800_000).toISOString(), target_contact_name: "طالب اختبار", target_phone: "01000000000", target_people_count: 1, target_notes: "ملاحظة داخلية", target_terms_accepted: true });
    expect(bookingError).toBeNull(); expect(booking.student_id).toBe(student.id);
    const ownerBookings = await ownerClient.rpc("list_owner_viewing_requests"); expect(ownerBookings.data).toEqual(expect.arrayContaining([expect.objectContaining({ id: booking.id })]));
    const anonymousAfterReview = await anonymousClient.from("properties").select("id").eq("id", propertyId); expect(anonymousAfterReview.data).toHaveLength(1);
  }, 30_000);

  it("keeps property favorites student-owned, RLS-restricted, and limited to the public property projection", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const otherStudentClient = supabaseForAccessToken(otherStudent.token);
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "عقار مفضل آمن", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", street: "عنوان داخلي لا يظهر", exact_lat: 29.1234567, exact_lng: 31.2345678, description: "عقار اختبار لمفضلة الطالب مع حماية الموقع والبيانات الداخلية.", monthly_price: 3600, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
    expect(propertyError).toBeNull();
    expect((await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", property!.id)).error).toBeNull();
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: studentClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });

    await expect(studentCaller.favorites.set({ propertyId: property!.id, saved: true })).resolves.toMatchObject({ propertyId: property!.id, saved: true });
    expect(await studentCaller.favorites.ids()).toContain(property!.id);
    const favorites = await studentCaller.favorites.list(); const savedProperty = favorites.find((item: any) => item.id === property!.id);
    expect(savedProperty).toBeTruthy(); expect(savedProperty).not.toHaveProperty("exactLat"); expect(savedProperty).not.toHaveProperty("exactLng"); expect(savedProperty).not.toHaveProperty("street");
    expect((await otherStudentClient.from("property_favorites").select("property_id").eq("property_id", property!.id)).data).toEqual([]);
    expect((await otherStudentClient.from("property_favorites").insert({ user_id: student.id, property_id: property!.id })).error).toBeTruthy();
    await expect(ownerCaller.favorites.list()).rejects.toThrow("مخصصة لحساب الطالب");
    await expect(studentCaller.favorites.set({ propertyId: property!.id, saved: false })).resolves.toMatchObject({ saved: false });
    expect(await studentCaller.favorites.ids()).not.toContain(property!.id);
  }, 30_000);

  it("archives properties without deleting booking history, excludes them from public access and similarity, and keeps staff contacts protected", async () => {
    const ownerClient = supabaseForAccessToken(owner.token);
    const studentClient = supabaseForAccessToken(student.token);
    const adminClient = supabaseForAccessToken(admin.token);
    const createProperty = async (title: string, price: number) => {
      const { data, error } = await ownerClient.from("properties").insert({ owner_id: owner.id, title, property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار للتحقق من الأرشفة الآمنة والظهور العام والسجل التاريخي.", monthly_price: price, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
      expect(error).toBeNull();
      expect((await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", data!.id)).error).toBeNull();
      return data!.id;
    };
    const archivedId = await createProperty("عقار للأرشفة الآمنة", 3900);
    const similarId = await createProperty("عقار مشابه متاح", 4000);
    expect((await supabaseAdmin.from("profiles").update({ phone: "01076543210" }).eq("id", owner.id)).error).toBeNull();
    expect((await ownerClient.from("properties").delete().eq("id", archivedId)).error).toBeTruthy();
    const booking = await studentClient.rpc("create_viewing_request", { target_property_id: archivedId, target_requested_viewing_at: new Date(Date.now() + 172_800_000).toISOString(), target_contact_name: "طالب أرشفة", target_phone: "01012345678", target_people_count: 1, target_notes: "تحقق من السجل بعد الأرشفة", target_terms_accepted: true });
    expect(booking.error).toBeNull();
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(ownerCaller.properties.delete({ id: archivedId })).resolves.toMatchObject({ propertyId: archivedId, archived: true });
    const archived = await supabaseAdmin.from("properties").select("id, deleted_at, availability_status").eq("id", archivedId).single();
    expect(archived.error).toBeNull(); expect(archived.data?.deleted_at).toBeTruthy(); expect(archived.data?.availability_status).toBe("hidden");
    expect((await supabaseAdmin.from("bookings").select("id").eq("id", booking.data!.id)).data).toHaveLength(1);
    expect((await anonymousClient.from("properties").select("id").eq("id", archivedId)).data).toEqual([]);
    expect((await anonymousClient.rpc("quote_viewing_fee", { target_property_id: archivedId })).error).toBeTruthy();
    expect((await ownerClient.from("properties").update({ deleted_at: null }).eq("id", archivedId)).error).toBeTruthy();
    const similar = await listSimilarPublicProperties(similarId);
    expect(similar.some((item: any) => item.id === archivedId)).toBe(false);
    expect(similar.every((item: any) => item.id !== similarId)).toBe(true);
    const staffRequests = await adminClient.rpc("list_staff_viewing_requests");
    expect(staffRequests.error).toBeNull(); expect(staffRequests.data?.some((item: any) => item.id === booking.data!.id && item.ownerContact?.phone)).toBe(true);
    const nonstaffRequests = await studentClient.rpc("list_staff_viewing_requests");
    expect(nonstaffRequests.error).toBeNull(); expect(nonstaffRequests.data).toEqual([]);
  }, 30_000);

  it("allows only self contact updates while restricting aggregate platform statistics to staff", async () => {
    const studentClient = supabaseForAccessToken(student.token); const otherStudentClient = supabaseForAccessToken(otherStudent.token); const adminClient = supabaseForAccessToken(admin.token);
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: studentClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: adminClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const updated = await studentCaller.profile.update({ fullName: "طالب إعدادات آمن", phone: "01012345678" });
    expect(updated).toMatchObject({ id: student.id, fullName: "طالب إعدادات آمن", phone: "01012345678", role: "student" });
    expect(await studentCaller.profile.me()).toMatchObject({ id: student.id, fullName: "طالب إعدادات آمن", phone: "01012345678" });
    const crossUserContactUpdate = await otherStudentClient.from("profiles").update({ full_name: "انتحال بيانات" }).eq("id", student.id);
    expect(crossUserContactUpdate.error).toBeNull();
    expect((await supabaseAdmin.from("profiles").select("full_name").eq("id", student.id).single()).data?.full_name).toBe("طالب إعدادات آمن");
    expect((await studentClient.from("profiles").update({ role: "admin" }).eq("id", student.id)).error).toBeTruthy();
    const stats = await adminCaller.admin.stats();
    expect(stats).toMatchObject({ totalStudents: expect.any(Number), totalOwners: expect.any(Number), pendingProperties: expect.any(Number), approvedProperties: expect.any(Number) });
    await expect(studentCaller.admin.stats()).rejects.toThrow();
  }, 30_000);

  it("creates one secure pending request for an eligible property and rejects duplicate, self-owned, unavailable, and cross-student attempts", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const otherStudentClient = supabaseForAccessToken(otherStudent.token);
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "طلب معاينة طالب آمن", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار متاح ومتحقق منه لطلب المعاينة من واجهة الطالب الآمنة.", monthly_price: 4100, bedrooms: 4, bathrooms: 1, capacity: 4, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
    expect(propertyError).toBeNull();
    expect((await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", property!.id)).error).toBeNull();
    const quote = await anonymousClient.rpc("quote_viewing_fee", { target_property_id: property!.id });
    expect(quote.error).toBeNull(); expect(quote.data?.[0]).toMatchObject({ fee_amount: 600, capacity: 4 });
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: studentClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const requestedViewingAt = new Date(Date.now() + 172_800_000).toISOString();
    await expect(studentCaller.bookings.create({ propertyId: property!.id, requestedViewingAt, name: "طالب حجز", phone: "01000000000", peopleCount: 1, termsAccepted: false })).rejects.toThrow("الموافقة على شروط المعاينة");
    const created = await studentCaller.bookings.create({ propertyId: property!.id, requestedViewingAt, name: "طالب حجز", phone: "01000000000", peopleCount: 1, notes: "أرغب في معرفة موعد المعاينة.", termsAccepted: true });
    expect(created).toMatchObject({ studentId: student.id, propertyId: property!.id, status: "pending", feeAmount: 600 });
    await expect(studentCaller.bookings.create({ propertyId: property!.id, requestedViewingAt, name: "طالب حجز", phone: "01000000000", peopleCount: 1, termsAccepted: true })).rejects.toThrow("طلب معاينة نشط");
    expect((await studentCaller.bookings.mine()).some((item: any) => item.id === created.id && item.status === "pending")).toBe(true);
    const ownerProjection = (await ownerCaller.bookings.ownerList()).find((item: any) => item.id === created.id);
    expect(ownerProjection).toMatchObject({ id: created.id, propertyId: property!.id });
    expect(ownerProjection).not.toHaveProperty("studentId"); expect(ownerProjection).not.toHaveProperty("phone"); expect(ownerProjection).not.toHaveProperty("email"); expect(ownerProjection).not.toHaveProperty("notes");
    expect((await otherStudentClient.from("bookings").insert({ property_id: property!.id, student_id: student.id, contact_name: "انتحال طالب", phone: "01000000000", people_count: 1, preferred_contact_time: "any" })).error).toBeTruthy();
    const intruderOwnerBookings = await supabaseForAccessToken(intruderOwner.token).from("bookings").select("id").eq("id", created.id); expect(intruderOwnerBookings.error).toBeTruthy(); expect(intruderOwnerBookings.data).toBeNull();
    const initialCancellation = await studentClient.rpc("request_viewing_cancellation", { target_booking_id: created.id, target_reason: "يرغب الطالب في إلغاء الطلب قبل بدء ترتيبات المعاينة." });
    expect(initialCancellation.error).toBeNull();
    expect((await supabaseForAccessToken(admin.token).rpc("confirm_viewing_cancellation", { target_request_id: initialCancellation.data!.id })).error).toBeNull();
    await expect(studentCaller.bookings.create({ propertyId: property!.id, requestedViewingAt, name: "طالب حجز", phone: "01000000000", peopleCount: 3, termsAccepted: true })).resolves.toMatchObject({ status: "pending", feeAmount: 600 });
    expect((await supabaseAdmin.from("properties").update({ capacity: 6 }).eq("id", property!.id)).error).toBeNull();
    const historical = await supabaseAdmin.from("bookings").select("fee_amount").eq("id", created.id).single();
    expect(historical.data?.fee_amount).toBe(600);

    for (const [capacity, expectedFee] of [[6, 900], [7, 1000]] as const) {
      const { data: tierProperty, error: tierPropertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: `شريحة رسوم ${capacity}`, property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار لحساب رسوم المعاينة حسب السعة المسجلة فقط.", monthly_price: 4100, bedrooms: 1, bathrooms: 1, capacity, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
      expect(tierPropertyError).toBeNull();
      expect((await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", tierProperty!.id)).error).toBeNull();
      const tierQuote = await anonymousClient.rpc("quote_viewing_fee", { target_property_id: tierProperty!.id });
      expect(tierQuote.error).toBeNull(); expect(tierQuote.data?.[0]).toMatchObject({ fee_amount: expectedFee, capacity });
      const tierBooking = await studentCaller.bookings.create({ propertyId: tierProperty!.id, requestedViewingAt, name: "طالب حجز", phone: "01000000000", peopleCount: capacity === 6 ? 1 : 3, notes: "تأكيد أن عدد الحضور لا يغيّر الرسوم.", termsAccepted: true, feeAmount: 1 } as any);
      expect(tierBooking).toMatchObject({ feeAmount: expectedFee, status: "pending" });
    }

    const { data: unavailableProperty } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "عقار غير متاح للحجز", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار غير متحقق لا يجب أن يقبل أي طلب حجز من الطالب.", monthly_price: 4200, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
    await expect(studentCaller.bookings.create({ propertyId: unavailableProperty!.id, requestedViewingAt, name: "طالب حجز", phone: "01000000000", peopleCount: 1, termsAccepted: true })).rejects.toThrow("غير متاح");
    const { data: ownProperty } = await supabaseAdmin.from("properties").insert({ owner_id: student.id, title: "عقار الطالب نفسه", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار مملوك للطالب نفسه ويجب ألا يقبل طلب حجز منه.", monthly_price: 4300, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"], verification_status: "verified", availability_status: "available" }).select("id").single();
    await expect(studentCaller.bookings.create({ propertyId: ownProperty!.id, requestedViewingAt, name: "طالب حجز", phone: "01000000000", peopleCount: 1, termsAccepted: true })).rejects.toThrow("تملكه");
  }, 30_000);

  it("persists a single 200–300m public location point while removing exact coordinates from public and student data", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token);
    const exactLatitude = 29.1234567; const exactLongitude = 31.2345678;
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "خصوصية الموقع", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", street: "شارع خاص 12", approximate_location: "صلاح سالم، بني سويف", exact_lat: exactLatitude, exact_lng: exactLongitude, description: "عقار اختبار للتأكد من عدم ظهور الموقع الدقيق في الواجهات أو واجهات البيانات العامة.", monthly_price: 3900, bedrooms: 4, bathrooms: 1, capacity: 4, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
    expect(propertyError).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert(["privacy-cover", "privacy-room", "privacy-kitchen"].map((name, index) => ({ property_id: property!.id, storage_bucket: "property-media-staging", storage_path: `${owner.id}/${property!.id}/${name}.png`, original_name: `${name}.png`, mime_type: "image/png", media_type: "image", is_primary: index === 0, is_public: false })))).error).toBeNull();
    expect((await supabaseAdmin.from("properties").update({ verification_status: "pending" }).eq("id", property!.id)).error).toBeNull();
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: supabaseForAccessToken(admin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const pendingReview = await adminCaller.admin.reviewQueue(); expect(pendingReview.find((item: any) => item.id === property!.id)).toMatchObject({ exactLat: exactLatitude, exactLng: exactLongitude, street: "شارع خاص 12" });
    await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", property!.id);
    const publicCaller = appRouter.createCaller({ user: null, accessToken: null, supabase: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const detail = await publicCaller.properties.detail({ id: property!.id });
    const listing = await publicCaller.properties.list({});
    const publicListing = listing.find((item: any) => item.id === property!.id);
    for (const response of [detail, publicListing]) {
      expect(response).not.toHaveProperty("latitude"); expect(response).not.toHaveProperty("longitude"); expect(response).not.toHaveProperty("exactLat"); expect(response).not.toHaveProperty("exactLng"); expect(response).not.toHaveProperty("street");
      expect(response).toMatchObject({ approximateLocation: "صلاح سالم، بني سويف" });
      expect(response.publicLat).toBeTypeOf("number"); expect(response.publicLng).toBeTypeOf("number");
    }
    const publicPoint = { lat: detail.publicLat, lng: detail.publicLng };
    const distanceInMeters = (left: { lat: number; lng: number }, right: { lat: number; lng: number }) => {
      const radians = (degrees: number) => degrees * Math.PI / 180; const earthRadius = 6371000;
      const deltaLat = radians(right.lat - left.lat); const deltaLng = radians(right.lng - left.lng);
      const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(left.lat)) * Math.cos(radians(right.lat)) * Math.sin(deltaLng / 2) ** 2;
      return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };
    expect(distanceInMeters({ lat: exactLatitude, lng: exactLongitude }, publicPoint)).toBeGreaterThanOrEqual(199);
    expect(distanceInMeters({ lat: exactLatitude, lng: exactLongitude }, publicPoint)).toBeLessThanOrEqual(301);
    const repeatedDetail = await publicCaller.properties.detail({ id: property!.id }); expect(repeatedDetail).toMatchObject({ publicLat: detail.publicLat, publicLng: detail.publicLng });
    expect((await anonymousClient.from("properties").select("latitude, longitude, exact_lat, exact_lng, street").eq("id", property!.id)).error).toBeTruthy();
    const studentCoordinateAttempt = await studentClient.from("properties").select("latitude, longitude, exact_lat, exact_lng, street").eq("id", property!.id);
    expect(Boolean(studentCoordinateAttempt.error) || (studentCoordinateAttempt.data ?? []).length === 0).toBe(true);
    const ownerProperties = await ownerCaller.properties.ownerList(); expect(ownerProperties.find((item: any) => item.id === property!.id)).toMatchObject({ exactLat: exactLatitude, exactLng: exactLongitude, street: "شارع خاص 12" });
    const updatedExactLatitude = 29.2234567; const updatedExactLongitude = 31.3345678;
    await ownerCaller.properties.updateExactLocation({ id: property!.id, exactLat: updatedExactLatitude, exactLng: updatedExactLongitude });
    const beforeApproval = await publicCaller.properties.detail({ id: property!.id }); expect(beforeApproval).toMatchObject({ publicLat: detail.publicLat, publicLng: detail.publicLng });
    expect((await ownerCaller.properties.ownerList()).find((item: any) => item.id === property!.id)).toMatchObject({ hasPendingUpdates: true, pendingEdits: { exactLat: updatedExactLatitude, exactLng: updatedExactLongitude } });
    await expect(adminCaller.admin.review({ propertyId: property!.id, status: "VERIFIED" })).resolves.toMatchObject({ hasPendingUpdates: false });
    const updatedDetail = await publicCaller.properties.detail({ id: property!.id }); expect(updatedDetail).not.toMatchObject({ publicLat: detail.publicLat, publicLng: detail.publicLng });
    expect(distanceInMeters({ lat: updatedExactLatitude, lng: updatedExactLongitude }, { lat: updatedDetail.publicLat, lng: updatedDetail.publicLng })).toBeGreaterThanOrEqual(199);
    expect(distanceInMeters({ lat: updatedExactLatitude, lng: updatedExactLongitude }, { lat: updatedDetail.publicLat, lng: updatedDetail.publicLng })).toBeLessThanOrEqual(301);
    const { data: booking, error: bookingError } = await studentClient.rpc("create_viewing_request", { target_property_id: property!.id, target_requested_viewing_at: new Date(Date.now() + 172_800_000).toISOString(), target_contact_name: "طالب موقع", target_phone: "01000000000", target_people_count: 1, target_notes: null, target_terms_accepted: true });
    expect(bookingError).toBeNull();
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: studentClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const studentBooking = await studentCaller.bookings.mine(); expect(studentBooking.find((item: any) => item.id === booking!.id)?.property).not.toHaveProperty("latitude");
  }, 30_000);

  it("permits the existing status transitions together with the staff-coordinated paid-viewing flow", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const adminClient = supabaseForAccessToken(admin.token); const superAdminClient = supabaseForAccessToken(superAdmin.token);

    const contacted = await createBookingFixture(); expect((await transition(ownerClient, contacted.id, "contacted")).data?.status).toBe("contacted");
    const rejected = await createBookingFixture(); expect((await transition(ownerClient, rejected.id, "rejected")).data?.status).toBe("rejected");
    const ownerCancelled = await createBookingFixture(); const ownerCancelledRequest = await ownerClient.rpc("request_viewing_cancellation", { target_booking_id: ownerCancelled.id, target_reason: "يتعذر على المالك تجهيز العقار للمعاينة في هذه المرحلة." }); expect(ownerCancelledRequest.error).toBeNull(); expect((await adminClient.rpc("confirm_viewing_cancellation", { target_request_id: ownerCancelledRequest.data!.id })).data?.status).toBe("cancelled");
    const ownerConfirmed = await createBookingFixture(); expect((await transition(ownerClient, ownerConfirmed.id, "contacted")).error).toBeNull(); expect((await transition(ownerClient, ownerConfirmed.id, "owner_confirmed")).data?.status).toBe("owner_confirmed");

    const studentPendingCancelled = await createBookingFixture(); const studentPendingRequest = await studentClient.rpc("request_viewing_cancellation", { target_booking_id: studentPendingCancelled.id, target_reason: "لن يتمكن الطالب من متابعة طلب المعاينة الحالي." }); expect((await adminClient.rpc("confirm_viewing_cancellation", { target_request_id: studentPendingRequest.data!.id })).data?.status).toBe("cancelled");
    const studentContactedCancelled = await createBookingFixture(); expect((await transition(ownerClient, studentContactedCancelled.id, "contacted")).error).toBeNull(); const studentContactedRequest = await studentClient.rpc("request_viewing_cancellation", { target_booking_id: studentContactedCancelled.id, target_reason: "تغيرت ظروف الطالب بعد بدء التواصل مع المالك." }); expect((await adminClient.rpc("confirm_viewing_cancellation", { target_request_id: studentContactedRequest.data!.id })).data?.status).toBe("cancelled");
    const studentOwnerConfirmedCancelled = await createBookingFixture(); await moveToOwnerConfirmed(studentOwnerConfirmedCancelled.id); const studentOwnerConfirmedRequest = await studentClient.rpc("request_viewing_cancellation", { target_booking_id: studentOwnerConfirmedCancelled.id, target_reason: "يطلب الطالب إلغاء المعاينة قبل حدوثها لسبب موثق." }); expect((await adminClient.rpc("confirm_viewing_cancellation", { target_request_id: studentOwnerConfirmedRequest.data!.id })).data?.status).toBe("cancelled");
    const accepted = await createBookingFixture(); await moveToOwnerConfirmed(accepted.id); await completeViewingForDecision(accepted.id); expect((await studentClient.rpc("record_student_viewing_decision", { target_booking_id: accepted.id, target_decision: "accepted" })).data?.status).toBe("student_confirmed"); expect((await adminClient.rpc("transition_booking_status", { target_booking_id: accepted.id, target_status: "completed" })).data?.status).toBe("completed");
    const rejectedAfterViewing = await createBookingFixture(); await moveToOwnerConfirmed(rejectedAfterViewing.id); await completeViewingForDecision(rejectedAfterViewing.id); const rejectedDecision = await studentClient.rpc("record_student_viewing_decision", { target_booking_id: rejectedAfterViewing.id, target_decision: "rejected" }); expect(rejectedDecision.data).toMatchObject({ status: "cancelled", fee_credit_status: "not_credited" });
    const superAdminCompleted = await createBookingFixture(); await moveToOwnerConfirmed(superAdminCompleted.id); await completeViewingForDecision(superAdminCompleted.id); expect((await studentClient.rpc("record_student_viewing_decision", { target_booking_id: superAdminCompleted.id, target_decision: "accepted" })).data?.status).toBe("student_confirmed"); expect((await superAdminClient.rpc("transition_booking_status", { target_booking_id: superAdminCompleted.id, target_status: "completed" })).data?.status).toBe("completed");
  }, 30_000);

  it("serves dynamic Open Graph property metadata with an approved public image in raw HTML before client JavaScript runs", async () => {
    const booking = await createBookingFixture();
    const { data: property, error } = await supabaseAdmin.from("properties").select("title, monthly_price, approximate_location, area").eq("id", booking.property_id).single();
    expect(error).toBeNull();
    const ogSourcePath = `${owner.id}/${booking.property_id}/open-graph-source.png`;
    const ogImagePath = `${booking.property_id}/open-graph-cover.png`;
    expect((await supabaseAdmin.storage.from("property-media-staging").upload(ogSourcePath, new Blob(["source"], { type: "image/png" }), { contentType: "image/png" })).error).toBeNull();
    expect((await supabaseAdmin.storage.from("property-images").upload(ogImagePath, new Blob(["preview"], { type: "image/png" }), { contentType: "image/png" })).error).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert({ property_id: booking.property_id, storage_bucket: "property-media-staging", storage_path: ogSourcePath, public_storage_bucket: "property-images", public_storage_path: ogImagePath, original_name: "open-graph-cover.png", mime_type: "image/png", public_mime_type: "image/png", media_type: "image", is_primary: true, is_public: true, watermark_status: "watermarked", sort_order: 0 })).error).toBeNull();
    const expectedImage = supabaseAdmin.storage.from("property-images").getPublicUrl(ogImagePath).data.publicUrl;
    const expectedDescription = `${new Intl.NumberFormat("ar-EG").format(Number(property!.monthly_price))} جنيه شهرياً · ${property!.approximate_location ?? property!.area}`;
    const response = await fetch(`http://127.0.0.1:3000/property/${booking.property_id}`);
    const html = await response.text();
    expect(response.ok).toBe(true);
    expect(html).toContain(`<title>${property!.title} | Sakan 4U</title>`);
    expect(html).toContain(`<meta name="description" content="${expectedDescription}" />`);
    expect(html).toContain(`<meta property="og:title" content="${property!.title} | Sakan 4U" />`);
    expect(html).toContain(`<meta property="og:description" content="${expectedDescription}" />`);
    expect(html).toContain(`<meta property="og:image" content="${expectedImage}" />`);
    expect(html).toContain(`<meta property="og:url" content="http://127.0.0.1:3000/property/${booking.property_id}" />`);
    expect(html).toContain(`<meta name="twitter:title" content="${property!.title} | Sakan 4U" />`);
    expect(html).toContain(`<meta name="twitter:description" content="${expectedDescription}" />`);
    expect(html).toContain(`<meta name="twitter:image" content="${expectedImage}" />`);
  }, 30_000);

  it("reserves an owner-accepted viewing property while keeping it public and blocking new requests", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const otherStudentClient = supabaseForAccessToken(otherStudent.token); const booking = await createBookingFixture();
    await moveToOwnerConfirmed(booking.id);
    const { data: reservedProperty, error: reservedError } = await supabaseAdmin.from("properties").select("id, availability_status").eq("id", booking.property_id).single();
    expect(reservedError).toBeNull(); expect(reservedProperty?.availability_status).toBe("reserved");
    const publicReserved = await supabasePublic.from("properties").select("id, availability_status").eq("id", booking.property_id).maybeSingle();
    expect(publicReserved.error).toBeNull(); expect(publicReserved.data).toMatchObject({ id: booking.property_id, availability_status: "reserved" });
    const blocked = await otherStudentClient.rpc("create_viewing_request", { target_property_id: booking.property_id, target_requested_viewing_at: new Date(Date.now() + 172_800_000).toISOString(), target_contact_name: "طالب آخر", target_phone: "01111111111", target_people_count: 1, target_notes: null, target_terms_accepted: true });
    expect(blocked.error).toBeTruthy();
    const cancellation = await studentClient.rpc("request_viewing_cancellation", { target_booking_id: booking.id, target_reason: "لن يتمكن الطالب من متابعة المعاينة المحجوزة في الموعد." });
    expect(cancellation.error).toBeNull(); expect((await supabaseForAccessToken(admin.token).rpc("confirm_viewing_cancellation", { target_request_id: cancellation.data!.id })).error).toBeNull();
    expect((await supabaseAdmin.from("properties").select("availability_status").eq("id", booking.property_id).single()).data?.availability_status).toBe("available");
    expect(ownerClient).toBeTruthy();
  }, 30_000);

  it("generates recipient-isolated, idempotent workflow notifications for every authorized staff account", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const otherStudentClient = supabaseForAccessToken(otherStudent.token); const intruderOwnerClient = supabaseForAccessToken(intruderOwner.token); const adminClient = supabaseForAccessToken(admin.token); const superAdminClient = supabaseForAccessToken(superAdmin.token);
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: studentClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: adminClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const superAdminCaller = appRouter.createCaller({ user: { id: superAdmin.id, name: "SAKENO super admin", email: superAdmin.email, phone: null, appRole: "super_admin", role: "admin", marketplaceRole: "student" }, accessToken: superAdmin.token, supabase: superAdminClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const booking = await createBookingFixture();

    const studentNotifications = await studentCaller.notifications.list();
    const ownerNotifications = await ownerCaller.notifications.list();
    const adminNotifications = await adminCaller.notifications.list();
    const superAdminNotifications = await superAdminCaller.notifications.list();
    const studentNotification = studentNotifications.items.find((item: any) => item.relatedBookingId === booking.id && item.notificationType === "booking_submitted");
    const ownerNotification = ownerNotifications.items.find((item: any) => item.relatedBookingId === booking.id && item.notificationType === "booking_submitted");
    const adminStaffNotification = adminNotifications.items.find((item: any) => item.relatedBookingId === booking.id && item.notificationType === "booking_submitted");
    const superAdminStaffNotification = superAdminNotifications.items.find((item: any) => item.relatedBookingId === booking.id && item.notificationType === "booking_submitted");
    expect(studentNotification).toBeTruthy(); expect(ownerNotification).toBeTruthy();
    expect(adminStaffNotification).toBeTruthy(); expect(superAdminStaffNotification).toBeTruthy(); expect(adminStaffNotification.id).not.toBe(superAdminStaffNotification.id);
    expect(adminNotifications.items.some((item: any) => item.relatedPropertyId === booking.property_id && item.notificationType === "staff_action_required")).toBe(true);
    expect(superAdminNotifications.items.some((item: any) => item.relatedPropertyId === booking.property_id && item.notificationType === "staff_action_required")).toBe(true);
    expect(ownerNotifications.items.some((item: any) => item.relatedPropertyId === booking.property_id && item.notificationType === "property_review")).toBe(true);
    expect(ownerNotification.message).not.toContain(student.email); expect(ownerNotification.message).not.toContain("01000000000"); expect(ownerNotification.message).not.toContain("ملاحظة تنسيق داخلية");
    expect((await studentClient.from("notifications").select("id").eq("id", ownerNotification.id)).data).toEqual([]);
    expect((await otherStudentClient.from("notifications").select("id").eq("id", studentNotification.id)).data).toEqual([]);
    expect((await intruderOwnerClient.from("notifications").select("id").eq("id", ownerNotification.id)).data).toEqual([]);
    expect((await ownerClient.from("notifications").select("id").eq("id", studentNotification.id)).data).toEqual([]);
    expect((await studentClient.from("notifications").select("id").eq("id", adminStaffNotification.id)).data).toEqual([]);
    expect((await ownerClient.from("notifications").select("id").eq("id", adminStaffNotification.id)).data).toEqual([]);
    expect((await adminClient.from("notifications").select("id").eq("id", superAdminStaffNotification.id)).data).toEqual([]);
    expect((await superAdminClient.from("notifications").select("id").eq("id", adminStaffNotification.id)).data).toEqual([]);
    expect((await studentClient.from("notifications").insert({ recipient_id: owner.id, notification_type: "booking_submitted", title: "محاولة", message: "محاولة", event_key: `client-${crypto.randomUUID()}` })).error).toBeTruthy();
    await expect(studentCaller.notifications.markRead({ notificationId: ownerNotification.id })).resolves.toMatchObject({ changed: false });
    await expect(ownerCaller.notifications.markRead({ notificationId: ownerNotification.id })).resolves.toMatchObject({ changed: true });
    await expect(adminCaller.notifications.markRead({ notificationId: superAdminStaffNotification.id })).resolves.toMatchObject({ changed: false });
    const ownerUnreadAfterOne = await ownerCaller.notifications.list(); expect(ownerUnreadAfterOne.unreadCount).toBeLessThan(ownerNotifications.unreadCount);
    await expect(ownerCaller.notifications.markAllRead()).resolves.toMatchObject({ markedCount: expect.any(Number) });
    expect((await ownerCaller.notifications.list()).unreadCount).toBe(0);

    expect((await transition(ownerClient, booking.id, "contacted")).error).toBeNull();
    const responseCount = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).like("event_key", `booking:${booking.id}:contacted:%`);
    expect((await transition(ownerClient, booking.id, "contacted")).error).toBeNull();
    const responseCountAfterRetry = await supabaseAdmin.from("notifications").select("id", { count: "exact", head: true }).like("event_key", `booking:${booking.id}:contacted:%`);
    expect(responseCountAfterRetry.count).toBe(responseCount.count);

    await supabaseAdmin.from("profiles").update({ role: "admin" }).eq("id", intruderOwner.id);
    const { data: whileStaffProperty, error: whileStaffError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "عقار تحقق وصول الموظف", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار لتأكيد أن كل موظف مخول يتلقى سجلاً مستقلاً خاصاً به.", monthly_price: 3600, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
    expect(whileStaffError).toBeNull();
    expect((await supabaseAdmin.from("notifications").select("id").eq("event_key", `property:${whileStaffProperty!.id}:submitted:staff:${intruderOwner.id}`).maybeSingle()).data).toBeTruthy();
    await supabaseAdmin.from("profiles").update({ role: "owner" }).eq("id", intruderOwner.id);
    const { data: afterRevocationProperty, error: afterRevocationError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "عقار تحقق إلغاء دور الموظف", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار لتأكيد عدم حصول الموظف السابق على إشعارات موظفين جديدة بعد الإلغاء.", monthly_price: 3700, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select("id").single();
    expect(afterRevocationError).toBeNull();
    expect((await supabaseAdmin.from("notifications").select("id").eq("event_key", `property:${afterRevocationProperty!.id}:submitted:staff:${intruderOwner.id}`).maybeSingle()).data).toBeNull();
  }, 30_000);

  it("keeps notification preferences server-side, recipient-owned, and isolated by RLS", async () => {
    const studentClient = supabaseForAccessToken(student.token); const otherStudentClient = supabaseForAccessToken(otherStudent.token);
    const { data: created, error: createError } = await studentClient.from("notification_preferences").insert({ user_id: student.id, booking_updates: true, property_updates: true, owner_application_updates: true, general_account_updates: true }).select("user_id, booking_updates, property_updates").single();
    expect(createError).toBeNull(); expect(created).toMatchObject({ user_id: student.id, booking_updates: true, property_updates: true });
    expect((await otherStudentClient.from("notification_preferences").select("user_id").eq("user_id", student.id)).data).toEqual([]);
    const crossUserUpdate = await otherStudentClient.from("notification_preferences").update({ booking_updates: false }).eq("user_id", student.id).select("user_id");
    expect(crossUserUpdate.error).toBeNull(); expect(crossUserUpdate.data).toEqual([]);
    const unchangedAfterCrossUserAttempt = await studentClient.from("notification_preferences").select("booking_updates").eq("user_id", student.id).single(); expect(unchangedAfterCrossUserAttempt.data?.booking_updates).toBe(true);
    expect((await studentClient.from("notification_preferences").update({ booking_updates: false }).eq("user_id", student.id)).error).toBeNull();
    const visible = await studentClient.from("notification_preferences").select("booking_updates").eq("user_id", student.id).single(); expect(visible.data?.booking_updates).toBe(false);
    expect((await studentClient.from("notification_preferences").update({ booking_updates: true }).eq("user_id", student.id)).error).toBeNull();
  });

  it("rejects skipped, role-inappropriate, direct table, and cross-user booking updates", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const intruderOwnerClient = supabaseForAccessToken(intruderOwner.token); const otherStudentClient = supabaseForAccessToken(otherStudent.token); const adminClient = supabaseForAccessToken(admin.token);
    const booking = await createBookingFixture();

    expect((await transition(ownerClient, booking.id, "owner_confirmed")).error).toBeTruthy();
    expect((await transition(studentClient, booking.id, "contacted")).error).toBeTruthy();
    expect((await transition(ownerClient, booking.id, "student_confirmed")).error).toBeTruthy();
    expect((await transition(adminClient, booking.id, "completed")).error).toBeTruthy();
    expect((await studentClient.from("bookings").update({ status: "completed" }).eq("id", booking.id)).error).toBeTruthy();
    expect((await ownerClient.from("bookings").update({ status: "owner_confirmed" }).eq("id", booking.id)).error).toBeTruthy();
    expect((await adminClient.from("bookings").update({ status: "completed" }).eq("id", booking.id)).error).toBeTruthy();
    expect((await adminClient.from("bookings").insert({ property_id: booking.property_id, student_id: student.id, contact_name: "تجاوز إداري", phone: "01000000000", people_count: 1, preferred_contact_time: "any", status: "completed" })).error).toBeTruthy();
    expect((await intruderOwnerClient.rpc("transition_booking_status", { target_booking_id: booking.id, target_status: "contacted" })).error).toBeTruthy();
    expect((await otherStudentClient.rpc("transition_booking_status", { target_booking_id: booking.id, target_status: "cancelled" })).error).toBeTruthy();
    const current = await supabaseAdmin.from("bookings").select("status").eq("id", booking.id).single(); expect(current.data?.status).toBe("pending");

    expect((await ownerClient.rpc("record_manual_inspection_payment", { target_booking_id: booking.id, target_reference: "MAN-OWNER-ATTEMPT" })).error).toBeTruthy();
    expect((await studentClient.rpc("record_manual_inspection_payment", { target_booking_id: booking.id, target_reference: "MAN-STUDENT-ATTEMPT" })).error).toBeTruthy();
    expect((await studentClient.from("booking_financials").update({ amount_paid: 600 }).eq("booking_id", booking.id)).error).toBeTruthy();
    expect((await ownerClient.from("booking_payment_transactions").insert({ booking_id: booking.id, transaction_type: "inspection_fee", status: "verified", amount: 600, provider_name: "manual", provider_reference: "MAN-OWNER-TABLE" })).error).toBeTruthy();
    expect((await studentClient.from("payment_webhook_events").insert({ provider_name: "fake", provider_event_id: "evt-123", provider_reference: "fake-ref", booking_id: booking.id, status: "processed" })).error).toBeTruthy();
    const firstWebhookEvent = await supabaseAdmin.from("payment_webhook_events").insert({ provider_name: "provider-adapter", provider_event_id: `evt-${crypto.randomUUID()}`, provider_reference: "provider-reference", booking_id: booking.id, status: "received" }).select("provider_name, provider_event_id").single();
    expect(firstWebhookEvent.error).toBeNull();
    expect((await supabaseAdmin.from("payment_webhook_events").insert({ provider_name: firstWebhookEvent.data!.provider_name, provider_event_id: firstWebhookEvent.data!.provider_event_id, provider_reference: "provider-reference", booking_id: booking.id, status: "received" })).error).toBeTruthy();
    const terminal = await createBookingFixture(); await moveToOwnerConfirmed(terminal.id); await completeViewingForDecision(terminal.id); expect((await studentClient.rpc("record_student_viewing_decision", { target_booking_id: terminal.id, target_decision: "accepted" })).error).toBeNull(); expect((await transition(studentClient, terminal.id, "cancelled")).error).toBeTruthy(); expect((await transition(ownerClient, terminal.id, "rejected")).error).toBeTruthy();
  }, 30_000);

  it("accepts only service-role provider confirmation with matching amount and handles duplicate callbacks idempotently", async () => {
    const studentClient = supabaseForAccessToken(student.token);
    const deniedBooking = await createBookingFixture();
    expect((await studentClient.rpc("process_provider_inspection_payment", { target_provider: "provider-adapter", target_event_id: `evt-${crypto.randomUUID()}`, target_reference: `ref-${crypto.randomUUID()}`, target_booking_id: deniedBooking.id, target_amount: 600 })).error).toBeTruthy();

    const rejectedBooking = await createBookingFixture();
    const rejected = await supabaseAdmin.rpc("process_provider_inspection_payment", { target_provider: "provider-adapter", target_event_id: `evt-${crypto.randomUUID()}`, target_reference: `ref-${crypto.randomUUID()}`, target_booking_id: rejectedBooking.id, target_amount: 999 });
    expect(rejected.error).toBeNull(); expect(rejected.data).toMatchObject({ eventStatus: "rejected", idempotent: false });
    expect((await supabaseAdmin.from("bookings").select("payment_status").eq("id", rejectedBooking.id).single()).data?.payment_status).toBe("pending");

    const paidBooking = await createBookingFixture(); const eventId = `evt-${crypto.randomUUID()}`; const reference = `ref-${crypto.randomUUID()}`;
    const first = await supabaseAdmin.rpc("process_provider_inspection_payment", { target_provider: "provider-adapter", target_event_id: eventId, target_reference: reference, target_booking_id: paidBooking.id, target_amount: 600 });
    expect(first.error).toBeNull(); expect(first.data).toMatchObject({ bookingId: paidBooking.id, eventStatus: "processed", idempotent: false });
    const duplicate = await supabaseAdmin.rpc("process_provider_inspection_payment", { target_provider: "provider-adapter", target_event_id: eventId, target_reference: reference, target_booking_id: paidBooking.id, target_amount: 600 });
    expect(duplicate.error).toBeNull(); expect(duplicate.data).toMatchObject({ bookingId: paidBooking.id, eventStatus: "processed", idempotent: true });
    const bookingAfter = await supabaseAdmin.from("bookings").select("payment_status, payment_recorded_by").eq("id", paidBooking.id).single();
    expect(bookingAfter.data).toMatchObject({ payment_status: "paid", payment_recorded_by: null });
    const ledger = await supabaseAdmin.from("booking_financials").select("amount_paid").eq("booking_id", paidBooking.id).single(); expect(ledger.data?.amount_paid).toBe(600);
    const transactions = await supabaseAdmin.from("booking_payment_transactions").select("id").eq("booking_id", paidBooking.id); expect(transactions.data).toHaveLength(1);
  }, 30_000);

  it("routes tRPC booking mutations through the same database transition enforcement", async () => {
    const booking = await createBookingFixture();
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: supabaseForAccessToken(owner.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: supabaseForAccessToken(student.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: supabaseForAccessToken(admin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const superAdminCaller = appRouter.createCaller({ user: { id: superAdmin.id, name: "SAKENO super admin", email: superAdmin.email, phone: null, appRole: "super_admin", role: "super_admin", marketplaceRole: "student" }, accessToken: superAdmin.token, supabase: supabaseForAccessToken(superAdmin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(ownerCaller.bookings.updateByStudent({ bookingId: booking.id, status: "CANCELLED" })).rejects.toThrow("مخصصة لحساب الطالب");
    await expect(studentCaller.bookings.updateByOwner({ bookingId: booking.id, status: "CONTACTED" })).rejects.toThrow("مخصصة لمالك معتمد");
    await expect(ownerCaller.bookings.updateByOwner({ bookingId: booking.id, status: "OWNER_CONFIRMED" })).rejects.toThrow();
    await expect(adminCaller.bookings.staffList()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: booking.id, status: "pending" })]));
    await expect(superAdminCaller.bookings.staffList()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: booking.id, status: "pending" })]));
    await expect(ownerCaller.bookings.updateByOwner({ bookingId: booking.id, status: "CONTACTED" })).resolves.toMatchObject({ status: "contacted" });
    await expect(ownerCaller.bookings.updateByOwner({ bookingId: booking.id, status: "OWNER_CONFIRMED" })).resolves.toMatchObject({ status: "owner_confirmed" });
    const trpcCancellation = await studentCaller.bookings.requestCancellation({ bookingId: booking.id, reason: "يرغب الطالب في إلغاء طلبه وفق المسار التشغيلي الموثق." });
    await expect(adminCaller.bookings.confirmCancellation({ requestId: trpcCancellation.id })).resolves.toMatchObject({ status: "cancelled" });
    const paidBooking = await createBookingFixture(); await moveToOwnerConfirmed(paidBooking.id);
    await expect(adminCaller.bookings.recordFeePayment({ bookingId: paidBooking.id, reference: "fake-payment-id" })).rejects.toThrow();
    await expect(adminCaller.bookings.recordFeePayment({ bookingId: paidBooking.id, reference: `MAN-${crypto.randomUUID()}` })).resolves.toMatchObject({ paymentStatus: "paid" });
    const paidFinancials = await supabaseAdmin.from("booking_financials").select("inspection_fee_amount, amount_paid, amount_credited_toward_final").eq("booking_id", paidBooking.id).single();
    expect(paidFinancials.data).toMatchObject({ inspection_fee_amount: 600, amount_paid: 600, amount_credited_toward_final: 0 });
    await expect(adminCaller.bookings.scheduleViewing({ bookingId: paidBooking.id, viewingAt: new Date(Date.now() + 172_800_000).toISOString() })).resolves.toMatchObject({ status: "owner_confirmed" });
    await expect(adminCaller.bookings.completeViewing({ bookingId: paidBooking.id })).resolves.toMatchObject({ status: "owner_confirmed" });
    await expect(studentCaller.bookings.recordStudentDecision({ bookingId: paidBooking.id, decision: "ACCEPTED" })).resolves.toMatchObject({ status: "student_confirmed", feeCreditStatus: "credited" });
    const creditedFinancials = await supabaseAdmin.from("booking_financials").select("amount_credited_toward_final, final_settlement_status").eq("booking_id", paidBooking.id).single();
    expect(creditedFinancials.data).toMatchObject({ amount_credited_toward_final: 600, final_settlement_status: "pending" });
    await expect(adminCaller.bookings.updateByStaff({ bookingId: paidBooking.id, status: "COMPLETED" })).resolves.toMatchObject({ status: "completed" });
    const superAdminBooking = await createBookingFixture(); await moveToOwnerConfirmed(superAdminBooking.id);
    await expect(superAdminCaller.bookings.recordFeePayment({ bookingId: superAdminBooking.id, reference: `MAN-${crypto.randomUUID()}` })).resolves.toMatchObject({ paymentStatus: "paid" });
    await expect(superAdminCaller.bookings.scheduleViewing({ bookingId: superAdminBooking.id, viewingAt: new Date(Date.now() + 172_800_000).toISOString() })).resolves.toMatchObject({ status: "owner_confirmed" });
    await expect(superAdminCaller.bookings.completeViewing({ bookingId: superAdminBooking.id })).resolves.toMatchObject({ status: "owner_confirmed" });
    await expect(studentCaller.bookings.recordStudentDecision({ bookingId: superAdminBooking.id, decision: "ACCEPTED" })).resolves.toMatchObject({ status: "student_confirmed" });
    await expect(superAdminCaller.bookings.updateByStaff({ bookingId: superAdminBooking.id, status: "COMPLETED" })).resolves.toMatchObject({ status: "completed" });
  }, 30_000);

  it("keeps verification documents private and prevents client-side role promotion", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); privatePath = `${owner.id}/${propertyId}/integration-proof.pdf`;
    const upload = await ownerClient.storage.from("verification-documents").upload(privatePath, new Blob(["test"], { type: "application/pdf" }), { contentType: "application/pdf" }); expect(upload.error).toBeNull();
    const forbiddenRead = await studentClient.storage.from("verification-documents").download(privatePath); expect(forbiddenRead.error).toBeTruthy();
    const promote = await studentClient.from("profiles").update({ role: "admin" }).eq("id", student.id); expect(promote.error).toBeTruthy();
    const { data: checkedProfile } = await supabaseAdmin.from("profiles").select("role").eq("id", student.id).single(); expect(checkedProfile?.role).toBe("student");
  }, 30_000);

  it("blocks cross-owner property UUID updates before any privileged public-image withdrawal", async () => {
    const ownerClient = supabaseForAccessToken(owner.token);
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "عقار منع IDOR", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار يحمي صور المالك من محاولة تعديل معرف عقار أجنبي.", monthly_price: 3200, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select().single();
    expect(propertyError).toBeNull();
    await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", property.id);
    publicPath = `${property.id}/idor-regression.png`;
    expect((await supabaseAdmin.storage.from("property-images").upload(publicPath, new Blob(["image"], { type: "image/png" }), { contentType: "image/png" })).error).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert({ property_id: property.id, storage_bucket: "property-images", storage_path: publicPath, original_name: "idor-regression.png", mime_type: "image/png", media_type: "image", is_public: true })).error).toBeNull();
    const intruderCaller = appRouter.createCaller({ user: { id: intruderOwner.id, name: "Intruder Owner", email: intruderOwner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: intruderOwner.token, supabase: supabaseForAccessToken(intruderOwner.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });

    await expect(intruderCaller.properties.update({ id: property.id, changes: { title: "محاولة غير مصرّح بها" } })).rejects.toThrow("لا تملك صلاحية تعديله");
    const media = await supabaseAdmin.from("property_media").select("storage_bucket, storage_path").eq("property_id", property.id).single();
    expect(media.data).toMatchObject({ storage_bucket: "property-images", storage_path: publicPath });
    expect((await supabaseAdmin.storage.from("property-images").download(publicPath)).error).toBeNull();
  }, 30_000);

  it("denies an owner direct creation of a public property-image object", async () => {
    const ownerClient = supabaseForAccessToken(owner.token);
    const attempted = await ownerClient.storage.from("property-images").upload(`${owner.id}/unmoderated-direct-upload.png`, new Blob(["image"], { type: "image/png" }), { contentType: "image/png" });
    expect(attempted.error).toBeTruthy();
  });

  it("preserves public, staging, private, and missing media records when an owner archives their own property", async () => {
    const ownerClient = supabaseForAccessToken(owner.token);
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "حذف وسائط العقار", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار للتحقق من حذف الملفات المرتبطة به من جميع مساحات التخزين.", monthly_price: 3600, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select().single();
    expect(propertyError).toBeNull();
    const paths = {
      public: `${property!.id}/cleanup-public.png`,
      staging: `${owner.id}/${property!.id}/cleanup-staging.png`,
      private: `${owner.id}/${property!.id}/cleanup-verification.pdf`,
      missing: `${owner.id}/${property!.id}/already-missing.png`,
    };
    expect((await supabaseAdmin.storage.from("property-images").upload(paths.public, new Blob(["public"], { type: "image/png" }), { contentType: "image/png" })).error).toBeNull();
    expect((await supabaseAdmin.storage.from("property-media-staging").upload(paths.staging, new Blob(["staging"], { type: "image/png" }), { contentType: "image/png" })).error).toBeNull();
    expect((await supabaseAdmin.storage.from("verification-documents").upload(paths.private, new Blob(["private"], { type: "application/pdf" }), { contentType: "application/pdf" })).error).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert([
      { property_id: property!.id, storage_bucket: "property-images", storage_path: paths.public, original_name: "cleanup-public.png", mime_type: "image/png", media_type: "image", is_public: true },
      { property_id: property!.id, storage_bucket: "property-media-staging", storage_path: paths.staging, original_name: "cleanup-staging.png", mime_type: "image/png", media_type: "image", is_public: false },
      { property_id: property!.id, storage_bucket: "verification-documents", storage_path: paths.private, original_name: "cleanup-verification.pdf", mime_type: "application/pdf", media_type: "verification_document", is_public: false },
      { property_id: property!.id, storage_bucket: "property-media-staging", storage_path: paths.missing, original_name: "already-missing.png", mime_type: "image/png", media_type: "image", is_public: false },
    ])).error).toBeNull();
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(ownerCaller.properties.delete({ id: property!.id })).resolves.toMatchObject({ propertyId: property!.id, archived: true });
    expect((await supabaseAdmin.from("properties").select("deleted_at").eq("id", property!.id).single()).data?.deleted_at).toBeTruthy();
    expect((await supabaseAdmin.from("property_media").select("id").eq("property_id", property!.id)).data).toHaveLength(4);
    expect((await supabaseAdmin.storage.from("property-images").download(paths.public)).error).toBeNull();
    expect((await supabaseAdmin.storage.from("property-media-staging").download(paths.staging)).error).toBeNull();
    expect((await supabaseAdmin.storage.from("verification-documents").download(paths.private)).error).toBeNull();
  }, 30_000);

  it("does not permit an owner to clean another owner's property objects, while only Super Admin safe cleanup remains authorized", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const intruderClient = supabaseForAccessToken(intruderOwner.token);
    const { data: protectedProperty, error: protectedError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "عقار منع حذف أجنبي", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار يمنع مالكاً آخر من حذف ملفاته أو سجلاته المرتبطة.", monthly_price: 3700, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select().single();
    expect(protectedError).toBeNull();
    const protectedPath = `${protectedProperty!.id}/protected-cleanup.png`;
    expect((await supabaseAdmin.storage.from("property-images").upload(protectedPath, new Blob(["protected"], { type: "image/png" }), { contentType: "image/png" })).error).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert({ property_id: protectedProperty!.id, storage_bucket: "property-images", storage_path: protectedPath, original_name: "protected-cleanup.png", mime_type: "image/png", media_type: "image", is_public: true })).error).toBeNull();
    const intruderCaller = appRouter.createCaller({ user: { id: intruderOwner.id, name: "Intruder owner", email: intruderOwner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: intruderOwner.token, supabase: intruderClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(intruderCaller.properties.delete({ id: protectedProperty!.id })).rejects.toThrow("لا تملك صلاحية حذفه");
    expect((await supabaseAdmin.storage.from("property-images").download(protectedPath)).error).toBeNull();
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: supabaseForAccessToken(admin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const superAdminCaller = appRouter.createCaller({ user: { id: superAdmin.id, name: "SAKENO super admin", email: superAdmin.email, phone: null, appRole: "super_admin", role: "admin", marketplaceRole: "student" }, accessToken: superAdmin.token, supabase: supabaseForAccessToken(superAdmin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(adminCaller.superAdmin.deleteProperty({ propertyId: protectedProperty!.id })).rejects.toThrow("مدير عام");
    await expect(superAdminCaller.superAdmin.deleteProperty({ propertyId: protectedProperty!.id })).resolves.toMatchObject({ propertyId: protectedProperty!.id, archived: true });
    expect((await supabaseAdmin.from("properties").select("deleted_at").eq("id", protectedProperty!.id).single()).data?.deleted_at).toBeTruthy();
    expect((await supabaseAdmin.storage.from("property-images").download(protectedPath)).error).toBeNull();
  }, 30_000);

  it("blocks Super Admin account deletion when an owner has preserved property history", async () => {
    const profileOwner = await createConfirmedUser("profile-cleanup-owner");
    await supabaseAdmin.from("profiles").update({ role: "owner" }).eq("id", profileOwner.id);
    const profileOwnerClient = supabaseForAccessToken(profileOwner.token);
    const { data: profileProperty, error: propertyError } = await profileOwnerClient.from("properties").insert({ owner_id: profileOwner.id, title: "حذف ملف مالك", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "عقار اختبار لتنظيف ملفات المالك قبل حذف ملفه الشخصي بشكل موثوق.", monthly_price: 3800, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"] }).select().single();
    expect(propertyError).toBeNull();
    const verificationPath = `${profileOwner.id}/${profileProperty!.id}/profile-cleanup.pdf`;
    expect((await supabaseAdmin.storage.from("verification-documents").upload(verificationPath, new Blob(["verification"], { type: "application/pdf" }), { contentType: "application/pdf" })).error).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert({ property_id: profileProperty!.id, storage_bucket: "verification-documents", storage_path: verificationPath, original_name: "profile-cleanup.pdf", mime_type: "application/pdf", media_type: "verification_document", is_public: false })).error).toBeNull();
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: supabaseForAccessToken(admin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(adminCaller.superAdmin.deleteUser({ userId: profileOwner.id })).rejects.toThrow("مدير عام");
    const superAdminCaller = appRouter.createCaller({ user: { id: superAdmin.id, name: "SAKENO super admin", email: superAdmin.email, phone: null, appRole: "super_admin", role: "admin", marketplaceRole: "student" }, accessToken: superAdmin.token, supabase: supabaseForAccessToken(superAdmin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(superAdminCaller.superAdmin.deleteUser({ userId: profileOwner.id })).rejects.toThrow("عقارات محفوظة تاريخياً");
    expect((await supabaseAdmin.from("profiles").select("id").eq("id", profileOwner.id).maybeSingle()).data?.id).toBe(profileOwner.id);
    expect((await supabaseAdmin.from("properties").select("id").eq("id", profileProperty!.id).maybeSingle()).data?.id).toBe(profileProperty!.id);
    expect((await supabaseAdmin.storage.from("verification-documents").download(verificationPath)).error).toBeNull();
    const { data: auditEvent } = await supabaseAdmin.from("super_admin_user_management_audit").select("action, result, target_user_id, details").eq("target_user_id", profileOwner.id).order("created_at", { ascending: false }).limit(1).single();
    expect(auditEvent).toMatchObject({ action: "delete_user", result: "failed", target_user_id: profileOwner.id, details: { reason: "owned_properties_preserved" } });
  }, 30_000);

  it("permits only a Super Admin to list users and blocks self, Super Admin, and historical-record deletion", async () => {
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: supabaseForAccessToken(admin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const superAdminCaller = appRouter.createCaller({ user: { id: superAdmin.id, name: "SAKENO super admin", email: superAdmin.email, phone: null, appRole: "super_admin", role: "admin", marketplaceRole: "student" }, accessToken: superAdmin.token, supabase: supabaseForAccessToken(superAdmin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(adminCaller.superAdmin.listUsers({ offset: 0, limit: 25 })).rejects.toThrow("مدير عام");
    await expect(superAdminCaller.superAdmin.listUsers({ offset: 0, limit: 25, query: student.email })).resolves.toMatchObject({ total: 1, items: [expect.objectContaining({ id: student.id, accountStatus: "active" })] });
    await expect(superAdminCaller.superAdmin.deleteUser({ userId: superAdmin.id })).rejects.toThrow("حسابه الشخصي");
    const protectedSuperAdmin = await createConfirmedUser("protected-super-admin");
    expect((await supabaseAdmin.from("profiles").update({ role: "super_admin" }).eq("id", protectedSuperAdmin.id)).error).toBeNull();
    await expect(superAdminCaller.superAdmin.deleteUser({ userId: protectedSuperAdmin.id })).rejects.toThrow("هويات إدارية محمية");
    await expect(superAdminCaller.superAdmin.deleteUser({ userId: student.id })).rejects.toThrow("عقارات محفوظة تاريخياً");
    expect((await supabaseAdmin.from("profiles").select("id").eq("id", student.id).maybeSingle()).data?.id).toBe(student.id);
  }, 30_000);

  it("submits property data and required staged photos as one owner workflow and requires photo-quality confirmation before approval", async () => {
    const ownerClient = supabaseForAccessToken(owner.token);
    const adminClient = supabaseForAccessToken(admin.token);
    const superAdminClient = supabaseForAccessToken(superAdmin.token);
    const studentClient = supabaseForAccessToken(student.token);
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: adminClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: studentClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const png = (await sharp({ create: { width: 32, height: 24, channels: 3, background: { r: 38, g: 120, b: 180 } } }).png().toBuffer()).toString("base64");
    const input = { title: `إرسال صور موحد ${crypto.randomUUID().slice(0, 8)}`, propertyType: "apartment" as const, governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", exactLat: 29.0661, exactLng: 31.0994, description: "عقار اختبار يتأكد من أن بيانات الإعلان والصور تصل معاً إلى مراجعة الإدارة الآمنة.", monthlyPrice: 3900, bedrooms: 2, bathrooms: 1, capacity: 2, genderSuitability: "mixed" as const, furnished: true, amenities: ["واي فاي"] };
    const nationalIdPdf = Buffer.from("%PDF-1.4\nSAKENO national ID\n%%EOF").toString("base64");
    const nationalIdDocument = { name: "national-id.pdf", mimeType: "application/pdf" as const, dataBase64: nationalIdPdf, kind: "national_id" as const };
    await expect(ownerCaller.properties.submitWithPhotos({ property: { ...input, description: "                    " }, photos: [], nationalIdDocument })).rejects.toThrow("وصف العقار مطلوب");
    await expect(ownerCaller.properties.submitWithPhotos({ property: input, photos: [] })).rejects.toThrow();
    await expect(ownerCaller.properties.submitWithPhotos({ property: input, photos: ["cover.png", "room.png", "kitchen.png"].map(name => ({ name, mimeType: "image/png" as const, dataBase64: png })), nationalIdDocument: { ...nationalIdDocument, kind: "ownership_evidence" as any } })).rejects.toThrow("البطاقة الشخصية");
    const incomplete = await ownerClient.from("properties").insert({ owner_id: owner.id, title: "إعلان ناقص الصور", property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "إعلان اختبار ناقص الصور لا يجوز أن يصبح منشوراً أو موثقاً قبل استكمال وسائطه.", monthly_price: 3100, bedrooms: 1, bathrooms: 1, capacity: 1, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"], verification_status: "draft" }).select("id").single();
    expect(incomplete.error).toBeNull();
    await expect(adminCaller.admin.review({ propertyId: incomplete.data!.id, status: "VERIFIED", propertyPhotosQualityVerified: true })).rejects.toThrow();
    const superAdminCaller = appRouter.createCaller({ user: { id: superAdmin.id, name: "SAKENO super admin", email: superAdmin.email, phone: null, appRole: "super_admin", role: "admin", marketplaceRole: "student" }, accessToken: superAdmin.token, supabase: supabaseForAccessToken(superAdmin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(superAdminCaller.superAdmin.deleteProperty({ propertyId: incomplete.data!.id })).resolves.toMatchObject({ propertyId: incomplete.data!.id, archived: true });
    const ownershipPdf = Buffer.from("%PDF-1.4\nSAKENO ownership proof\n%%EOF").toString("base64");
    const submitted = await ownerCaller.properties.submitWithPhotos({ property: { ...input, description: `  ${input.description}  ` }, photos: ["cover.png", "room.png", "kitchen.png"].map(name => ({ name, mimeType: "image/png" as const, dataBase64: png })), nationalIdDocument, ownershipEvidence: { name: "ownership-proof.pdf", mimeType: "application/pdf", dataBase64: ownershipPdf, kind: "ownership_evidence" } });
    expect(submitted.submittedNationalIdDocument).toBe(true); expect(submitted.submittedOwnershipEvidence).toBe(true);
    const submittedProperty = await supabaseAdmin.from("properties").select("description, verification_status").eq("id", submitted.id).single();
    expect(submittedProperty.data).toMatchObject({ description: input.description, verification_status: "pending" });
    const ownershipDocuments = await supabaseAdmin.from("property_media").select("id, storage_bucket, storage_path, is_public, media_type, verification_document_kind").eq("property_id", submitted.id).eq("media_type", "verification_document").order("verification_document_kind", { ascending: true });
    expect(ownershipDocuments.data).toEqual(expect.arrayContaining([expect.objectContaining({ storage_bucket: "verification_documents", is_public: false, media_type: "verification_document", verification_document_kind: "national_id" }), expect.objectContaining({ verification_document_kind: "ownership_evidence" })]));
    const storedNationalId = ownershipDocuments.data!.find(document => document.verification_document_kind === "national_id")!;
    expect((await ownerClient.storage.from("verification_documents").download(storedNationalId.storage_path)).error).toBeTruthy();
    expect((await adminClient.storage.from("verification_documents").download(storedNationalId.storage_path)).error).toBeNull();
    expect((await superAdminClient.storage.from("verification_documents").download(storedNationalId.storage_path)).error).toBeNull();
    expect((await studentClient.storage.from("verification_documents").download(storedNationalId.storage_path)).error).toBeTruthy();
    expect((await anonymousClient.storage.from("verification_documents").download(storedNationalId.storage_path)).error).toBeTruthy();
    expect((await ownerClient.from("property_media").insert({ property_id: submitted.id, storage_bucket: "verification_documents", storage_path: `${student.id}/${submitted.id}/forged.pdf`, original_name: "forged.pdf", mime_type: "application/pdf", media_type: "verification_document", is_public: false })).error).toBeTruthy();
    const staged = await supabaseAdmin.from("property_media").select("id, storage_bucket, is_public, is_primary").eq("property_id", submitted.id).eq("media_type", "image");
    expect(staged.data).toHaveLength(3); expect(staged.data?.every(media => media.storage_bucket === "property-media-staging" && media.is_public === false)).toBe(true); expect(staged.data?.filter(media => media.is_primary)).toHaveLength(1);
    const reversedIds = [...staged.data!].reverse().map(media => media.id);
    await expect(ownerCaller.media.reorder({ propertyId: submitted.id, mediaIds: reversedIds })).resolves.toMatchObject({ propertyId: submitted.id, mediaIds: reversedIds });
    await expect(ownerCaller.media.updateMetadata({ mediaId: reversedIds[0]!, description: "مطبخ مضاء جيداً", tag: "مطبخ" })).resolves.toMatchObject({ description: "مطبخ مضاء جيداً", tag: "مطبخ" });
    const orderedStaged = await supabaseAdmin.from("property_media").select("id, sort_order, is_primary, description, tag").eq("property_id", submitted.id).eq("media_type", "image").order("sort_order", { ascending: true });
    expect(orderedStaged.data?.map(media => media.id)).toEqual(reversedIds); expect(orderedStaged.data?.[0]).toMatchObject({ sort_order: 0, is_primary: true, description: "مطبخ مضاء جيداً", tag: "مطبخ" });
    const intruderCaller = appRouter.createCaller({ user: { id: intruderOwner.id, name: "Intruder owner", email: intruderOwner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: intruderOwner.token, supabase: supabaseForAccessToken(intruderOwner.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(intruderCaller.media.delete({ mediaId: staged.data![0]!.id })).rejects.toThrow();
    await expect(intruderCaller.media.reorder({ propertyId: submitted.id, mediaIds: reversedIds })).rejects.toThrow();
    await expect(intruderCaller.media.updateMetadata({ mediaId: reversedIds[0]!, description: "اختراق", tag: "أخرى" })).rejects.toThrow();
    await expect(studentCaller.media.upload({ propertyId: submitted.id, name: "intrusion.png", mimeType: "image/png", dataBase64: png, mediaType: "image", isPrimary: false })).rejects.toThrow();
    const queue = await adminCaller.admin.reviewQueue();
    const reviewItem = queue.find((item: any) => item.id === submitted.id);
    expect(reviewItem?.media.filter((media: any) => media.mediaType === "image")).toHaveLength(3); expect(reviewItem?.media.find((media: any) => media.mediaType === "verification_document")).toMatchObject({ storageBucket: "verification_documents", isPublic: false }); expect(typeof reviewItem?.media.find((media: any) => media.mediaType === "verification_document")?.url).toBe("string");
    await expect(studentCaller.admin.reviewQueue()).rejects.toThrow();
    await expect(studentCaller.admin.updatePropertyDescription({ propertyId: submitted.id, description: "وصف من طالب غير مخول بتعديل إعلان المالك أو محتواه الخاص." })).rejects.toThrow();
    await expect(adminCaller.admin.updatePropertyDescription({ propertyId: submitted.id, description: "وصف منقح من الإدارة يزيل أي تفاصيل حساسة ويحافظ على معلومات السكن المفيدة للطلاب." })).resolves.toMatchObject({ id: submitted.id });
    expect((await supabaseAdmin.from("properties").select("description").eq("id", submitted.id).single()).data?.description).toContain("وصف منقح من الإدارة");
    await expect(adminCaller.admin.review({ propertyId: submitted.id, status: "REJECTED", mediaQualityIssue: true, reason: "قصير" })).rejects.toThrow("12 حرفاً");
    await expect(adminCaller.admin.review({ propertyId: submitted.id, status: "NEEDS_CHANGES", reason: "يرجى إعادة رفع صورة مطبخ واضحة تخص العقار الفعلي." })).resolves.toMatchObject({ verificationStatus: "needs_changes" });
    const mediaAfterRequest = await supabaseAdmin.from("property_media").select("is_public, public_storage_path").eq("property_id", submitted.id).eq("media_type", "image");
    expect(mediaAfterRequest.data?.every(media => media.is_public === false && media.public_storage_path === null)).toBe(true);
    await expect(ownerCaller.media.updateMetadata({ mediaId: reversedIds[0]!, description: "صورة مطبخ محدثة وواضحة", tag: "مطبخ" })).resolves.toMatchObject({ description: "صورة مطبخ محدثة وواضحة" });
    await expect(ownerCaller.properties.submitForReview({ id: submitted.id })).resolves.toMatchObject({ verificationStatus: "pending" });
    await expect(adminCaller.admin.review({ propertyId: submitted.id, status: "VERIFIED" })).rejects.toThrow("تأكيد أن الصور");
    await expect(adminCaller.admin.review({ propertyId: submitted.id, status: "VERIFIED", propertyPhotosQualityVerified: true, ownerIdentityVerified: true, locationVerified: true, availabilityVerified: true })).resolves.toMatchObject({ verificationStatus: "verified" });
    const published = await supabaseAdmin.from("property_media").select("storage_bucket, storage_path, public_storage_bucket, public_storage_path, public_mime_type, watermark_status, is_public, sort_order").eq("property_id", submitted.id).eq("media_type", "image").order("sort_order", { ascending: true });
    expect(published.data?.every(media => media.storage_bucket === "property-media-staging" && media.public_storage_bucket === "property-images" && media.public_storage_path && media.public_mime_type === "image/webp" && media.watermark_status === "watermarked" && media.is_public)).toBe(true);
    expect(published.data?.map(media => media.sort_order)).toEqual([0, 1, 2]);
    for (const media of published.data ?? []) {
      expect((await supabaseAdmin.storage.from("property-media-staging").download(media.storage_path)).error).toBeNull();
      expect((await supabaseAdmin.storage.from("property-images").download(media.public_storage_path!)).error).toBeNull();
    }
    await expect(ownerCaller.properties.update({ id: submitted.id, changes: { description: "تمت معالجة الملاحظة مع الحفاظ على سجل المراجعة والصور لتعاد مراجعتها من الإدارة بشكل آمن." } })).resolves.toMatchObject({ id: submitted.id });
    await expect(adminCaller.admin.review({ propertyId: submitted.id, status: "VERIFIED", propertyPhotosQualityVerified: true, ownerIdentityVerified: true, locationVerified: true, availabilityVerified: true })).resolves.toMatchObject({ verificationStatus: "verified" });
    const history = await supabaseAdmin.from("property_review_events").select("id").eq("property_id", submitted.id); expect(history.data?.length).toBe(3);
    expect((await superAdminClient.rpc("super_admin_property_deletion_eligibility", { target_property_id: submitted.id })).data?.canArchive).toBe(true);
    expect((await superAdminClient.rpc("super_admin_delete_property_safely", { target_property_id: submitted.id })).data?.archived).toBe(true);
  }, 60_000);

  it("enforces safe owner property deletion and owner-only media replacement, cover selection, and re-review", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const intruderClient = supabaseForAccessToken(intruderOwner.token); const adminClient = supabaseForAccessToken(admin.token);
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const intruderCaller = appRouter.createCaller({ user: { id: intruderOwner.id, name: "Intruder owner", email: intruderOwner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: intruderOwner.token, supabase: intruderClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const studentCaller = appRouter.createCaller({ user: { id: student.id, name: "SAKENO student", email: student.email, phone: null, appRole: "student", role: "user", marketplaceRole: "student" }, accessToken: student.token, supabase: studentClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: adminClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const png = (await sharp({ create: { width: 24, height: 18, channels: 3, background: { r: 82, g: 132, b: 196 } } }).png().toBuffer()).toString("base64");
    const input = { title: `إدارة مالك ${crypto.randomUUID().slice(0, 8)}`, propertyType: "apartment" as const, governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", exactLat: 29.0662, exactLng: 31.0995, description: "عقار اختبار لإدارة الصور والحذف الآمن دون تجاوز المراجعة أو السجل التاريخي.", monthlyPrice: 4200, bedrooms: 3, bathrooms: 1, capacity: 3, genderSuitability: "mixed" as const, furnished: true, amenities: ["واي فاي"] };
    const managed = await ownerCaller.properties.submitWithPhotos({ property: input, photos: ["one.png", "two.png", "three.png"].map(name => ({ name, mimeType: "image/png" as const, dataBase64: png })), nationalIdDocument: { name: "managed-id.png", mimeType: "image/png", dataBase64: png, kind: "national_id" } });
    await expect(adminCaller.admin.review({ propertyId: managed.id, status: "VERIFIED", propertyPhotosQualityVerified: true, ownerIdentityVerified: true, locationVerified: true, availabilityVerified: true })).resolves.toMatchObject({ verificationStatus: "verified" });
    const before = await supabaseAdmin.from("property_media").select("id, sort_order, is_primary").eq("property_id", managed.id).eq("media_type", "image").order("sort_order", { ascending: true });
    await expect(intruderCaller.media.setCover({ propertyId: managed.id, mediaId: before.data![1]!.id })).rejects.toThrow();
    await expect(studentCaller.media.replace({ mediaId: before.data![1]!.id, name: "blocked.png", mimeType: "image/png", dataBase64: png })).rejects.toThrow("مخصصة لمالك");
    await expect(ownerCaller.media.setCover({ propertyId: managed.id, mediaId: before.data![1]!.id })).resolves.toMatchObject({ propertyId: managed.id });
    const covered = await supabaseAdmin.from("property_media").select("id, is_primary, sort_order, is_public").eq("property_id", managed.id).eq("media_type", "image").order("sort_order", { ascending: true });
    expect(covered.data?.[0]).toMatchObject({ id: before.data![1]!.id, is_primary: true, sort_order: 0, is_public: false });
    await expect(ownerCaller.media.replace({ mediaId: covered.data![1]!.id, name: "replacement.png", mimeType: "image/png", dataBase64: png, description: "صورة بديلة واضحة", tag: "غرفة نوم" })).resolves.toMatchObject({ replacedMediaId: covered.data![1]!.id });
    const afterReplacement = await supabaseAdmin.from("property_media").select("id, description, tag").eq("property_id", managed.id).eq("media_type", "image");
    expect(afterReplacement.data).toHaveLength(3); expect(afterReplacement.data?.some(media => media.description === "صورة بديلة واضحة" && media.tag === "غرفة نوم")).toBe(true);
    const reReview = await supabaseAdmin.from("properties").select("verification_status").eq("id", managed.id).single(); expect(reReview.data?.verification_status).toBe("pending");
    await expect(ownerCaller.properties.setAvailability({ id: managed.id, availabilityStatus: "hidden" })).resolves.toMatchObject({ availabilityStatus: "hidden" });
    await expect(ownerCaller.properties.deletionEligibility({ id: managed.id })).resolves.toMatchObject({ canArchive: true, reviewEventCount: 1 });
    await expect(ownerCaller.properties.delete({ id: managed.id })).resolves.toMatchObject({ propertyId: managed.id, archived: true });
    const booked = await createBookingFixture(); const bookedRow = await supabaseAdmin.from("bookings").select("property_id").eq("id", booked.id).single();
    const bookingPropertyCheck = await ownerCaller.properties.deletionEligibility({ id: bookedRow.data!.property_id }); expect(bookingPropertyCheck).toMatchObject({ canArchive: true, bookingCount: 1 });
    await expect(ownerCaller.properties.delete({ id: bookedRow.data!.property_id })).resolves.toMatchObject({ propertyId: bookedRow.data!.property_id, archived: true });
    await expect(intruderCaller.properties.deletionEligibility({ id: managed.id })).rejects.toThrow();
  }, 60_000);

  it("enforces secure reschedules, reasoned cancellations, no-shows, manual refund decisions, history, and notification isolation", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const studentClient = supabaseForAccessToken(student.token); const intruderClient = supabaseForAccessToken(intruderOwner.token); const adminClient = supabaseForAccessToken(admin.token); const superAdminClient = supabaseForAccessToken(superAdmin.token);

    const rescheduled = await createBookingFixture(); await moveToOwnerConfirmed(rescheduled.id);
    expect((await adminClient.rpc("record_manual_inspection_payment", { target_booking_id: rescheduled.id, target_reference: `MAN-${crypto.randomUUID()}` })).error).toBeNull();
    const originalTime = new Date(Date.now() + 172_800_000).toISOString();
    expect((await adminClient.rpc("schedule_viewing", { target_booking_id: rescheduled.id, target_viewing_at: originalTime })).error).toBeNull();
    const proposedTime = new Date(Date.now() + 259_200_000).toISOString();
    const intruderAttempt = await intruderClient.rpc("request_viewing_reschedule", { target_booking_id: rescheduled.id, target_requested_viewing_at: proposedTime, target_reason: "محاولة مالك غير معني تغيير موعد معاينة." });
    expect(intruderAttempt.error).toBeTruthy();
    const request = await ownerClient.rpc("request_viewing_reschedule", { target_booking_id: rescheduled.id, target_requested_viewing_at: proposedTime, target_reason: "يتعذر تجهيز العقار في الموعد الحالي وأحتاج موعداً آخر." });
    expect(request.error).toBeNull(); expect(request.data?.status).toBe("pending");
    expect((await ownerClient.from("viewing_reschedule_requests").select("id").eq("id", request.data!.id)).error).toBeTruthy();
    expect(new Date((await supabaseAdmin.from("bookings").select("viewing_scheduled_at").eq("id", rescheduled.id).single()).data!.viewing_scheduled_at).toISOString()).toBe(originalTime);
    const acceptedTime = new Date(Date.now() + 345_600_000).toISOString();
    expect((await adminClient.rpc("confirm_viewing_reschedule", { target_request_id: request.data!.id, target_confirmed_viewing_at: acceptedTime })).error).toBeNull();
    const moved = await supabaseAdmin.from("bookings").select("viewing_scheduled_at").eq("id", rescheduled.id).single(); expect(new Date(moved.data!.viewing_scheduled_at).toISOString()).toBe(acceptedTime);
    const history = await supabaseAdmin.from("viewing_operational_history").select("id, event_type, previous_viewing_at, new_viewing_at, reason").eq("booking_id", rescheduled.id).order("created_at", { ascending: true });
    const requestedHistory = history.data?.find(entry => entry.event_type === "reschedule_requested"); const confirmedHistory = history.data?.find(entry => entry.event_type === "reschedule_confirmed");
    expect(new Date(requestedHistory!.previous_viewing_at!).toISOString()).toBe(originalTime); expect(new Date(requestedHistory!.new_viewing_at!).toISOString()).toBe(proposedTime);
    expect(new Date(confirmedHistory!.previous_viewing_at!).toISOString()).toBe(originalTime); expect(new Date(confirmedHistory!.new_viewing_at!).toISOString()).toBe(acceptedTime);
    expect((await supabaseAdmin.from("viewing_operational_history").update({ reason: "محاولة تعديل السجل" }).eq("booking_id", rescheduled.id)).error).toBeTruthy();
    const studentRescheduleNotification = await studentClient.from("notifications").select("id").eq("related_booking_id", rescheduled.id).eq("notification_type", "viewing_scheduled"); expect(studentRescheduleNotification.data?.length).toBeGreaterThan(0);
    const studentRequestNotification = await studentClient.from("notifications").select("id").eq("related_booking_id", rescheduled.id).eq("notification_type", "viewing_reschedule_requested").maybeSingle(); expect(studentRequestNotification.data).toBeTruthy();
    const staffRequestNotification = await adminClient.from("notifications").select("id").eq("related_booking_id", rescheduled.id).eq("notification_type", "staff_action_required").order("created_at", { ascending: false }).limit(1).maybeSingle(); expect(staffRequestNotification.data).toBeTruthy();
    expect((await studentClient.from("notifications").select("id").eq("id", staffRequestNotification.data!.id)).data).toEqual([]);

    const cancelled = await createBookingFixture(); await moveToOwnerConfirmed(cancelled.id);
    expect((await adminClient.rpc("record_manual_inspection_payment", { target_booking_id: cancelled.id, target_reference: `MAN-${crypto.randomUUID()}` })).error).toBeNull();
    expect((await adminClient.rpc("schedule_viewing", { target_booking_id: cancelled.id, target_viewing_at: new Date(Date.now() + 172_800_000).toISOString() })).error).toBeNull();
    const cancellationRequest = await studentClient.rpc("request_viewing_cancellation", { target_booking_id: cancelled.id, target_reason: "تغيرت ظروف الطالب ولا يستطيع حضور المعاينة في هذا الأسبوع." });
    expect(cancellationRequest.error).toBeNull(); expect((await adminClient.rpc("confirm_viewing_cancellation", { target_request_id: cancellationRequest.data!.id })).error).toBeNull();
    const cancelledRecord = await supabaseAdmin.from("bookings").select("status").eq("id", cancelled.id).single(); expect(cancelledRecord.data?.status).toBe("cancelled");
    const cancellationFinancials = await supabaseAdmin.from("booking_financials").select("amount_refunded, refund_status, refund_review_status").eq("booking_id", cancelled.id).single(); expect(cancellationFinancials.data).toMatchObject({ amount_refunded: 0, refund_status: "pending", refund_review_status: "pending" });
    expect((await studentClient.from("booking_financials").update({ amount_refunded: 600 }).eq("booking_id", cancelled.id)).error).toBeTruthy();
    expect((await adminClient.rpc("record_manual_refund_decision", { target_booking_id: cancelled.id, target_decision: "approved", target_amount: 200, target_reason: "اعتمدت الإدارة استرداداً جزئياً بعد مراجعة الإلغاء.", target_reference: `REF-${crypto.randomUUID()}` })).error).toBeNull();
    const refunded = await supabaseAdmin.from("booking_financials").select("amount_refunded, refund_status, refund_review_status").eq("booking_id", cancelled.id).single(); expect(refunded.data).toMatchObject({ amount_refunded: 200, refund_status: "refunded", refund_review_status: "approved" });
    expect((await ownerClient.rpc("record_manual_refund_decision", { target_booking_id: cancelled.id, target_decision: "approved", target_amount: 100, target_reason: "محاولة غير مصرح بها", target_reference: "REF-DENIED" })).error).toBeTruthy();

    const completed = await createBookingFixture(); await moveToOwnerConfirmed(completed.id); await completeViewingForDecision(completed.id);
    expect((await studentClient.rpc("request_viewing_cancellation", { target_booking_id: completed.id, target_reason: "محاولة إلغاء بعد إتمام المعاينة يجب رفضها." })).error).toBeTruthy();
    expect((await ownerClient.rpc("request_viewing_reschedule", { target_booking_id: completed.id, target_requested_viewing_at: new Date(Date.now() + 345_600_000).toISOString(), target_reason: "محاولة تغيير موعد بعد الإتمام يجب رفضها." })).error).toBeTruthy();

    const noShow = await createBookingFixture(); await moveToOwnerConfirmed(noShow.id);
    expect((await superAdminClient.rpc("record_manual_inspection_payment", { target_booking_id: noShow.id, target_reference: `MAN-${crypto.randomUUID()}` })).error).toBeNull();
    const noShowTime = new Date(Date.now() + 2_500).toISOString();
    expect((await superAdminClient.rpc("schedule_viewing", { target_booking_id: noShow.id, target_viewing_at: noShowTime })).error).toBeNull();
    expect((await adminClient.rpc("record_viewing_no_show", { target_booking_id: noShow.id, target_party: "student", target_reason: "محاولة مبكرة يجب رفضها قبل الموعد المحدد." })).error).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 3_000));
    expect((await superAdminClient.rpc("record_viewing_no_show", { target_booking_id: noShow.id, target_party: "both", target_reason: "تأكدت الإدارة من عدم حضور الطرفين في الموعد المحدد." })).error).toBeNull();
    const noShowRecord = await supabaseAdmin.from("viewing_no_show_records").select("no_show_party, reason").eq("booking_id", noShow.id).single(); expect(noShowRecord.data).toMatchObject({ no_show_party: "both" });
    expect((await supabaseAdmin.from("bookings").select("status").eq("id", noShow.id).single()).data?.status).toBe("no_show");
    const noShowStudentNotification = await studentClient.from("notifications").select("id").eq("related_booking_id", noShow.id).eq("notification_type", "viewing_no_show").maybeSingle(); expect(noShowStudentNotification.data).toBeTruthy();
    const noShowOwnerNotification = await ownerClient.from("notifications").select("id").eq("related_booking_id", noShow.id).eq("notification_type", "viewing_no_show").maybeSingle(); expect(noShowOwnerNotification.data).toBeTruthy();
    expect((await studentClient.from("notifications").select("id").eq("id", noShowOwnerNotification.data!.id)).data).toEqual([]);
  }, 90_000);

  it("enforces draft submission, lifecycle audit immutability, owner-only resubmission, and Super Admin safe deletion", async () => {
    const ownerClient = supabaseForAccessToken(owner.token); const intruderClient = supabaseForAccessToken(intruderOwner.token); const adminClient = supabaseForAccessToken(admin.token); const superAdminClient = supabaseForAccessToken(superAdmin.token);
    const baseProperty = { owner_id: owner.id, title: `مسودة دورة حياة ${crypto.randomUUID().slice(0, 8)}`, property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: "مسودة اختبارية متكاملة للتحقق من دورة حياة العقار والسجل التشغيلي المحمي.", monthly_price: 3400, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"], verification_status: "draft" };
    const { data: draft, error: draftError } = await ownerClient.from("properties").insert(baseProperty).select("id, verification_status").single();
    expect(draftError).toBeNull(); expect(draft?.verification_status).toBe("draft");
    expect((await anonymousClient.from("properties").select("id").eq("id", draft!.id)).data).toEqual([]);
    expect((await ownerClient.rpc("owner_submit_property_for_review", { target_property_id: draft!.id })).error).toBeTruthy();
    expect((await supabaseAdmin.from("property_media").insert([0, 1, 2].map(index => ({ property_id: draft!.id, storage_bucket: "property-media-staging", storage_path: `${owner.id}/${draft!.id}/lifecycle-${index}.png`, original_name: `lifecycle-${index}.png`, mime_type: "image/png", media_type: "image", is_primary: index === 0, is_public: false, sort_order: index })))).error).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert({ property_id: draft!.id, storage_bucket: "verification_documents", storage_path: `${owner.id}/${draft!.id}/lifecycle-national-id.pdf`, original_name: "lifecycle-national-id.pdf", mime_type: "application/pdf", media_type: "verification_document", verification_document_kind: "national_id", is_primary: false, is_public: false, sort_order: 0 })).error).toBeNull();
    expect((await intruderClient.rpc("owner_submit_property_for_review", { target_property_id: draft!.id })).error).toBeTruthy();
    expect((await ownerClient.rpc("owner_submit_property_for_review", { target_property_id: draft!.id })).data?.verification_status).toBe("pending");
    expect((await adminClient.from("properties").update({ verification_status: "rejected", review_reason: "يرجى إعادة رفع صور أوضح للمطبخ." }).eq("id", draft!.id)).error).toBeNull();
    expect((await ownerClient.rpc("owner_submit_property_for_review", { target_property_id: draft!.id })).data?.verification_status).toBe("pending");
    const lifecycle = await ownerClient.from("property_lifecycle_audit").select("id, action").eq("property_id", draft!.id);
    expect(lifecycle.data?.map(item => item.action)).toEqual(expect.arrayContaining(["created", "media_added", "submitted", "rejected", "resubmitted"]));
    expect((await ownerClient.from("property_lifecycle_audit").insert({ property_id: draft!.id, owner_id: owner.id, action: "edited" })).error).toBeTruthy();
    expect((await ownerClient.from("property_lifecycle_audit").update({ action: "deleted" }).eq("property_id", draft!.id)).error).toBeTruthy();
    expect((await intruderClient.from("property_lifecycle_audit").select("id").eq("property_id", draft!.id)).data).toEqual([]);
    const safeEligibility = await superAdminClient.rpc("super_admin_property_deletion_eligibility", { target_property_id: draft!.id }); expect(safeEligibility.data?.canArchive).toBe(true);
    const deleted = await superAdminClient.rpc("super_admin_delete_property_safely", { target_property_id: draft!.id }); expect(deleted.data?.archived).toBe(true);
    expect((await supabaseAdmin.from("properties").select("deleted_at").eq("id", draft!.id).single()).data?.deleted_at).toBeTruthy();
    expect((await supabaseAdmin.from("property_media").select("id").eq("property_id", draft!.id)).data).toHaveLength(4);
    expect((await supabaseAdmin.from("property_lifecycle_audit").select("action").eq("property_id", draft!.id)).data?.some(row => row.action === "archived")).toBe(true);
    const booked = await createBookingFixture();
    expect((await superAdminClient.rpc("super_admin_property_deletion_eligibility", { target_property_id: booked.property_id })).data?.canArchive).toBe(true);
    expect((await superAdminClient.rpc("super_admin_delete_property_safely", { target_property_id: booked.property_id })).data?.archived).toBe(true);
  }, 60_000);

  it("stages verified-owner changes privately until staff approval without changing the live public listing", async () => {
    const ownerClient = supabaseForAccessToken(owner.token);
    const intruderClient = supabaseForAccessToken(intruderOwner.token);
    const adminClient = supabaseForAccessToken(admin.token);
    const ownerCaller = appRouter.createCaller({ user: { id: owner.id, name: "SAKENO owner", email: owner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: owner.token, supabase: ownerClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const intruderCaller = appRouter.createCaller({ user: { id: intruderOwner.id, name: "SAKENO intruder", email: intruderOwner.email, phone: null, appRole: "owner", role: "user", marketplaceRole: "owner" }, accessToken: intruderOwner.token, supabase: intruderClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: admin.email, phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: adminClient, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const publicCaller = appRouter.createCaller({ user: null, accessToken: null, supabase: null, req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    const liveDescription = "وصف منشور ثابت لا ينبغي تغييره قبل اعتماد الإدارة للتعديلات المقترحة من المالك.";
    const proposedDescription = "وصف مقترح جديد لا يجب أن يراه الطلاب قبل اعتماد الإدارة بشكل صريح وآمن.";
    const { data: property, error: propertyError } = await ownerClient.from("properties").insert({ owner_id: owner.id, title: `تعديل مرحلي ${crypto.randomUUID().slice(0, 8)}`, property_type: "apartment", governorate: "بني سويف", city: "بني سويف", area: "صلاح سالم", description: liveDescription, monthly_price: 3500, bedrooms: 2, bathrooms: 1, capacity: 2, gender_suitability: "mixed", furnished: true, amenities: ["واي فاي"], verification_status: "draft" }).select("id").single();
    expect(propertyError).toBeNull();
    expect((await supabaseAdmin.from("properties").update({ verification_status: "verified", availability_status: "available" }).eq("id", property!.id)).error).toBeNull();
    expect((await supabaseAdmin.from("property_media").insert([0, 1, 2].map(index => ({ property_id: property!.id, storage_bucket: "property-media-staging", storage_path: `${owner.id}/${property!.id}/staged-${index}.png`, original_name: `staged-${index}.png`, mime_type: "image/png", media_type: "image", is_primary: index === 0, is_public: false, sort_order: index })))).error).toBeNull();
    await expect(ownerCaller.properties.update({ id: property!.id, changes: { description: proposedDescription, monthlyPrice: 4100 } })).resolves.toMatchObject({ id: property!.id, hasPendingUpdates: true });
    const staged = await supabaseAdmin.from("properties").select("description, monthly_price, verification_status, has_pending_updates, pending_edits").eq("id", property!.id).single();
    expect(staged.data).toMatchObject({ description: liveDescription, monthly_price: 3500, verification_status: "verified", has_pending_updates: true, pending_edits: { description: proposedDescription, monthly_price: 4100 } });
    await expect(intruderCaller.properties.update({ id: property!.id, changes: { description: "محاولة تغيير غير مصرح بها يجب أن تفشل دائماً على مستوى المالك.", monthlyPrice: 1 } })).rejects.toThrow();
    expect((await ownerClient.from("properties").update({ pending_edits: { description: "تجاوز مباشر" } }).eq("id", property!.id)).error).toBeTruthy();
    const detailBeforeApproval = await publicCaller.properties.detail({ id: property!.id });
    expect(detailBeforeApproval).toMatchObject({ description: liveDescription, monthlyPrice: 3500 });
    expect(detailBeforeApproval).not.toHaveProperty("pendingEdits");
    const queue = await adminCaller.admin.reviewQueue();
    expect(queue.find((item: any) => item.id === property!.id)).toMatchObject({ hasPendingUpdates: true, pendingEdits: { description: proposedDescription, monthlyPrice: 4100 } });
    await expect(adminCaller.admin.review({ propertyId: property!.id, status: "VERIFIED" })).resolves.toMatchObject({ id: property!.id, hasPendingUpdates: false, description: proposedDescription, monthlyPrice: 4100 });
    const detailAfterApproval = await publicCaller.properties.detail({ id: property!.id });
    expect(detailAfterApproval).toMatchObject({ description: proposedDescription, monthlyPrice: 4100 });
    expect(detailAfterApproval).not.toHaveProperty("pendingEdits");
    const audit = await supabaseAdmin.from("property_lifecycle_audit").select("action").eq("property_id", property!.id);
    expect(audit.data?.map(event => event.action)).toEqual(expect.arrayContaining(["updates_staged", "updates_approved"]));
  }, 30_000);

  it("records owner registration onboarding while keeping the newly created profile nonprivileged", async () => {
    const email = `sakeno-owner-registration-${suffix}@gmail.com`;
    const created = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: false, user_metadata: { full_name: "مالك تسجيل", legal_consent: true, desired_role: "owner", owner_request: { phone: "01000000000", experience: "إدارة سكن طلابي لمدة عام", preferred_contact: "phone" } } });
    expect(created.error).toBeNull(); expect(created.data.user?.id).toBeTruthy(); createdIds.push(created.data.user!.id);
    const { data: profile } = await supabaseAdmin.from("profiles").select("role").eq("id", created.data.user!.id).single(); expect(profile?.role).toBe("student");
    const { data: application } = await supabaseAdmin.from("owner_applications").select("id, status, phone").eq("user_id", created.data.user!.id).single(); expect(application).toMatchObject({ status: "pending", phone: "01000000000" });
    const { data: ownerApplicationNotification } = await supabaseAdmin.from("notifications").select("notification_type, title, message").eq("recipient_id", admin.id).eq("notification_type", "owner_application").order("created_at", { ascending: false }).limit(1).maybeSingle();
    expect(ownerApplicationNotification).toMatchObject({ notification_type: "owner_application", title: "طلب اعتماد مالك جديد" });
    const adminCaller = appRouter.createCaller({ user: { id: admin.id, name: "SAKENO admin", email: "admin@example.com", phone: null, appRole: "admin", role: "admin", marketplaceRole: "student" }, accessToken: admin.token, supabase: supabaseForAccessToken(admin.token), req: {} as TrpcContext["req"], res: {} as TrpcContext["res"] });
    await expect(adminCaller.admin.reviewOwnerApplication({ applicationId: application!.id, decision: "approved" })).resolves.toMatchObject({ status: "approved" });
    const { data: approvedProfile } = await supabaseAdmin.from("profiles").select("role").eq("id", created.data.user!.id).single(); expect(approvedProfile?.role).toBe("owner");
    const recovery = await anonymousClient.auth.resetPasswordForEmail(email, { redirectTo: `${getRuntimeEnvValue("VITE_SUPABASE_URL")}/auth/v1/verify` });
    expect(recovery.error === null || recovery.error.message.includes("rate limit")).toBe(true);
  }, 30_000);
});
