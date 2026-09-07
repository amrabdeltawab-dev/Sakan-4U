import { z } from "zod";
import { adminProcedure, protectedProcedure, publicProcedure, router, superAdminProcedure } from "./_core/trpc";
import * as db from "./db";
import { sendBookingNotification } from "./bookingNotifications";

const propertyType = z.enum(["apartment", "studio", "room", "shared_room"]);
const suitability = z.enum(["male", "female", "mixed"]);
const genderPreference = z.enum(["male", "female", "anyone"]);
const videoUrl = z.string().trim().url("أدخل رابط فيديو صحيحاً.").max(500).refine(value => { try { const host = new URL(value).hostname.toLowerCase(); return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be" || host === "vimeo.com" || host.endsWith(".vimeo.com"); } catch { return false; } }, "استخدم رابط فيديو من YouTube أو Vimeo فقط.");
const availability = z.enum(["available", "reserved", "rented", "hidden"]);
const rentType = z.enum(["full", "bed"]);
const bookingStatus = z.enum(["pending", "contacted", "owner_confirmed", "student_confirmed", "completed", "rejected", "cancelled"]);
const appointmentExceptionReason = z.string().trim().min(5, "اكتب سبباً واضحاً من 5 أحرف على الأقل.").max(800);
const bathroomValidationMessage = "أدخل عدد الحمامات بشكل صحيح. يجب أن يكون حماماً واحداً على الأقل.";
const propertyInput = z.object({ title: z.string().min(4).max(180), propertyType, governorate: z.string().min(2), city: z.string().min(2), area: z.string().min(2), street: z.string().max(180).optional(), approximateLocation: z.string().max(255).optional(), latitude: z.number().optional(), longitude: z.number().optional(), description: z.string().trim().min(db.MIN_PROPERTY_DESCRIPTION_LENGTH, db.PROPERTY_DESCRIPTION_VALIDATION_MESSAGE), monthlyPrice: z.number().int().positive(), bedrooms: z.number().int().positive(), bathrooms: z.number({ error: bathroomValidationMessage }).int(bathroomValidationMessage).min(1, bathroomValidationMessage), capacity: z.number().int().positive(), rentType, totalBeds: z.number().int().positive().max(100).nullable().optional(), genderPreference: genderPreference.optional(), genderSuitability: suitability.optional(), distanceToCampus: z.string().trim().max(120).optional(), utilitiesIncluded: z.array(z.string().trim().min(1).max(60)).max(12).optional(), videoUrl: videoUrl.nullable().optional(), furnished: z.boolean(), amenities: z.array(z.string()).min(1), availabilityStatus: availability.optional() });
const rentConfigurationIssue = (input: { rentType: "full" | "bed"; totalBeds?: number | null; capacity: number }, context: z.RefinementCtx) => { if (input.rentType === "bed" && (!Number.isInteger(input.totalBeds) || !input.totalBeds || input.totalBeds > input.capacity)) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalBeds"], message: "أدخل عدد الأسرة المتاحة، ويجب ألا يزيد عن سعة العقار." }); if (input.rentType === "full" && input.totalBeds !== null && input.totalBeds !== undefined) context.addIssue({ code: z.ZodIssueCode.custom, path: ["totalBeds"], message: "عدد الأسرة المتاحة يخص التأجير بالسرير فقط." }); };
const propertyCreateInput = propertyInput.omit({ latitude: true, longitude: true, rentType: true }).extend({ rentType: rentType.default("full"), exactLat: z.number().min(-90).max(90), exactLng: z.number().min(-180).max(180) }).superRefine((input, context) => { const effectiveGender = input.genderPreference ?? (input.genderSuitability === "male" || input.genderSuitability === "female" ? input.genderSuitability : input.genderSuitability === "mixed" ? "anyone" : undefined); if (!effectiveGender) context.addIssue({ code: z.ZodIssueCode.custom, path: ["genderPreference"], message: "اختر الفئة المناسبة للعقار قبل الإرسال." }); if (input.rentType === "bed" && effectiveGender === "anyone") context.addIssue({ code: z.ZodIssueCode.custom, path: ["genderPreference"], message: "اختر شباب أو طالبات لتأجير العقار بالسرير؛ لا يمكن اختيار مناسب للجميع." }); rentConfigurationIssue(input, context); });
const propertyPhotoInput = z.object({ name: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(1), description: z.string().trim().max(160).optional(), tag: z.string().trim().max(48).optional() });
const propertyVerificationDocumentInput = z.object({ name: z.string().min(1).max(255), mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]), dataBase64: z.string().min(1), kind: z.enum(["national_id", "ownership_evidence"]) });

function requireStudent(role: string) { if (role !== "student") throw new Error("هذه العملية مخصصة لحساب الطالب."); }
function requireOwner(role: string) { if (role !== "owner") throw new Error("هذه العملية مخصصة لمالك معتمد."); }

export const appRouter = router({
  auth: router({
    me: publicProcedure.query(({ ctx }) => ctx.user),
    logout: publicProcedure.mutation(() => ({ success: true })),
  }),
  profile: router({
    me: protectedProcedure.query(({ ctx }) => db.getOwnProfile(ctx.supabase, ctx.user.id)),
    update: protectedProcedure.input(z.object({ fullName: z.string().trim().min(2, "الاسم يجب أن يتكون من حرفين على الأقل.").max(160), phone: z.string().trim().min(6, "رقم الهاتف يجب أن يتكون من 6 أحرف على الأقل.").max(32).nullable() })).mutation(({ ctx, input }) => db.updateOwnProfile(ctx.supabase, ctx.user.id, input)),
    requestOwnerRole: protectedProcedure.input(z.object({ phone: z.string().min(6).max(32), onboarding: z.object({ nationalIdLast4: z.string().length(4).optional(), experience: z.string().min(10).max(700), preferredContact: z.string().min(2).max(64) }) })).mutation(({ ctx, input }) => db.requestOwnerApplication(ctx.supabase, ctx.user.id, input)),
  }),
  properties: router({
    list: publicProcedure.input(z.object({ query: z.string().optional(), area: z.string().optional(), propertyType: propertyType.optional(), rentType: rentType.optional(), genderSuitability: suitability.optional(), minPrice: z.number().int().positive().optional(), maxPrice: z.number().int().positive().optional(), minBedrooms: z.number().int().positive().optional(), amenities: z.array(z.string()).optional() })).query(({ input }) => db.listPublicProperties(input)),
    detail: publicProcedure.input(z.object({ id: z.union([z.string(), z.number().int().positive()]) })).query(({ input }) => db.getPublicProperty(String(input.id))),
    trackView: publicProcedure.input(z.object({ propertyId: z.string().uuid(), sessionId: z.string().uuid() })).mutation(({ input }) => db.trackPublicPropertyView(input.propertyId, input.sessionId)),
    similar: publicProcedure.input(z.object({ id: z.string().uuid() })).query(({ input }) => db.listSimilarPublicProperties(input.id)),
    ownerList: protectedProcedure.query(({ ctx }) => { requireOwner(ctx.user.appRole); return db.listOwnerProperties(ctx.supabase); }),
    create: protectedProcedure.input(propertyCreateInput).mutation(() => { throw new Error("أضف صور العقار المطلوبة ثم استخدم إرسال الإعلان الموحد للمراجعة."); }),
    createDraft: protectedProcedure.input(propertyCreateInput).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.createOwnerPropertyDraft(ctx.supabase, ctx.user.id, input); }),
    submitWithPhotos: protectedProcedure.input(z.object({ property: propertyCreateInput, photos: z.array(propertyPhotoInput).min(db.MIN_PROPERTY_PHOTO_COUNT).max(db.MAX_PROPERTY_PHOTO_COUNT), nationalIdDocument: propertyVerificationDocumentInput, ownershipEvidence: propertyVerificationDocumentInput.optional() }).superRefine((input, context) => { if (input.nationalIdDocument.kind !== "national_id") context.addIssue({ code: z.ZodIssueCode.custom, path: ["nationalIdDocument", "kind"], message: "صورة البطاقة الشخصية مطلوبة قبل إرسال العقار للمراجعة." }); if (input.ownershipEvidence?.kind === "national_id") context.addIssue({ code: z.ZodIssueCode.custom, path: ["ownershipEvidence", "kind"], message: "مستند المرافق أو العقد اختياري ويجب أن يصنّف كإثبات ملكية." }); })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.submitPropertyWithPhotos(ctx.supabase, ctx.user.id, input.property, input.photos, input.nationalIdDocument, input.ownershipEvidence); }),
    submitForReview: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.submitOwnerPropertyForReview(ctx.supabase, input.id); }),
    update: protectedProcedure.input(z.object({ id: z.string().uuid(), changes: propertyInput.partial() })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.updateOwnerProperty(ctx.supabase, ctx.user.id, input.id, input.changes); }),
    updateExactLocation: protectedProcedure.input(z.object({ id: z.string().uuid(), exactLat: z.number().min(-90).max(90), exactLng: z.number().min(-180).max(180) })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.updateOwnerExactLocation(ctx.supabase, ctx.user.id, input.id, input.exactLat, input.exactLng); }),
    lifecycleAudit: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.listPropertyLifecycleAudit(ctx.supabase, input.id); }),
    deletionEligibility: protectedProcedure.input(z.object({ id: z.string().uuid() })).query(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.getOwnerPropertyDeletionEligibility(ctx.supabase, input.id); }),
    setAvailability: protectedProcedure.input(z.object({ id: z.string().uuid(), availabilityStatus: availability })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.setOwnerPropertyAvailability(ctx.supabase, input.id, input.availabilityStatus); }),
    delete: protectedProcedure.input(z.object({ id: z.string().uuid() })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.deleteOwnerProperty(ctx.supabase, ctx.user.id, input.id); }),
  }),
  favorites: router({
    ids: protectedProcedure.query(({ ctx }) => { requireStudent(ctx.user.appRole); return db.listStudentFavoritePropertyIds(ctx.supabase); }),
    list: protectedProcedure.query(({ ctx }) => { requireStudent(ctx.user.appRole); return db.listStudentFavoriteProperties(ctx.supabase); }),
    set: protectedProcedure.input(z.object({ propertyId: z.string().uuid(), saved: z.boolean() })).mutation(({ ctx, input }) => {
      requireStudent(ctx.user.appRole);
      return db.setStudentPropertyFavorite(ctx.supabase, ctx.user.id, input.propertyId, input.saved);
    }),
  }),
  notifications: router({
    list: protectedProcedure.query(({ ctx }) => db.listNotifications(ctx.supabase)),
    preferences: protectedProcedure.query(({ ctx }) => db.getNotificationPreferences(ctx.supabase, ctx.user.id)),
    updatePreferences: protectedProcedure.input(z.object({ bookingUpdates: z.boolean().optional(), propertyUpdates: z.boolean().optional(), ownerApplicationUpdates: z.boolean().optional(), generalAccountUpdates: z.boolean().optional() }).refine(input => Object.keys(input).length > 0, "اختر تفضيلاً واحداً على الأقل للتحديث.")).mutation(({ ctx, input }) => db.updateNotificationPreferences(ctx.supabase, ctx.user.id, {
      ...(input.bookingUpdates === undefined ? {} : { booking_updates: input.bookingUpdates }),
      ...(input.propertyUpdates === undefined ? {} : { property_updates: input.propertyUpdates }),
      ...(input.ownerApplicationUpdates === undefined ? {} : { owner_application_updates: input.ownerApplicationUpdates }),
      ...(input.generalAccountUpdates === undefined ? {} : { general_account_updates: input.generalAccountUpdates }),
    })),
    markRead: protectedProcedure.input(z.object({ notificationId: z.string().uuid() })).mutation(({ ctx, input }) => db.markNotificationRead(ctx.supabase, input.notificationId)),
    markAllRead: protectedProcedure.mutation(({ ctx }) => db.markAllNotificationsRead(ctx.supabase)),
  }),
  bookings: router({
    viewingFeeQuote: publicProcedure.input(z.object({ propertyId: z.string().uuid() })).query(({ input }) => db.quoteViewingFee(input.propertyId)),
    create: protectedProcedure.input(z.object({ propertyId: z.string().uuid(), requestedViewingAt: z.string().datetime({ offset: true }), name: z.string().min(2).max(160), phone: z.string().min(6).max(32), peopleCount: z.number().int().min(1).max(8), notes: z.string().max(1200).optional(), termsAccepted: z.boolean().refine(value => value, "يجب الموافقة على شروط المعاينة وقواعد التنسيق قبل إرسال الطلب.") })).mutation(async ({ ctx, input }) => {
      requireStudent(ctx.user.appRole);
      const booking = await db.createBooking(ctx.supabase, ctx.user.id, input);
      if (booking && typeof booking === "object" && "id" in booking && typeof booking.id === "string") await sendBookingNotification("new_request", booking.id, ctx.env);
      return booking;
    }),
    mine: protectedProcedure.query(({ ctx }) => { requireStudent(ctx.user.appRole); return db.listStudentBookings(ctx.supabase); }),
    ownerList: protectedProcedure.query(({ ctx }) => { requireOwner(ctx.user.appRole); return db.listOwnerBookings(ctx.supabase); }),
    staffList: adminProcedure.query(({ ctx }) => db.listStaffBookings(ctx.supabase)),
    updateByStudent: protectedProcedure.input(z.object({ bookingId: z.string().uuid(), status: z.literal("CANCELLED") })).mutation(({ ctx, input }) => { requireStudent(ctx.user.appRole); return db.transitionBookingStatus(ctx.supabase, input.bookingId, input.status.toLowerCase()); }),
    updateByOwner: protectedProcedure.input(z.object({ bookingId: z.string().uuid(), status: z.enum(["CONTACTED", "OWNER_CONFIRMED", "REJECTED", "CANCELLED"]) })).mutation(async ({ ctx, input }) => {
      requireOwner(ctx.user.appRole);
      const result = await db.transitionBookingStatus(ctx.supabase, input.bookingId, input.status.toLowerCase());
      if (input.status === "OWNER_CONFIRMED") await sendBookingNotification("accepted", input.bookingId, ctx.env);
      if (input.status === "REJECTED") await sendBookingNotification("rejected", input.bookingId, ctx.env);
      return result;
    }),
    updateByStaff: adminProcedure.input(z.object({ bookingId: z.string().uuid(), status: z.literal("COMPLETED") })).mutation(({ ctx, input }) => db.transitionBookingStatus(ctx.supabase, input.bookingId, input.status.toLowerCase() as z.infer<typeof bookingStatus>)),
    recordFeePayment: adminProcedure.input(z.object({ bookingId: z.string().uuid(), reference: z.string().trim().min(3).max(180) })).mutation(({ ctx, input }) => db.recordViewingFeePayment(ctx.supabase, input.bookingId, input.reference)),
    scheduleViewing: adminProcedure.input(z.object({ bookingId: z.string().uuid(), viewingAt: z.string().datetime({ offset: true }) })).mutation(({ ctx, input }) => db.scheduleViewing(ctx.supabase, input.bookingId, input.viewingAt)),
    completeViewing: adminProcedure.input(z.object({ bookingId: z.string().uuid() })).mutation(({ ctx, input }) => db.completeViewing(ctx.supabase, input.bookingId)),
    recordStudentDecision: protectedProcedure.input(z.object({ bookingId: z.string().uuid(), decision: z.enum(["ACCEPTED", "REJECTED"]) })).mutation(({ ctx, input }) => { requireStudent(ctx.user.appRole); return db.recordStudentViewingDecision(ctx.supabase, input.bookingId, input.decision.toLowerCase() as "accepted" | "rejected"); }),
    requestReschedule: protectedProcedure.input(z.object({ bookingId: z.string().uuid(), viewingAt: z.string().datetime({ offset: true }), reason: appointmentExceptionReason })).mutation(({ ctx, input }) => {
      if (!["student", "owner"].includes(ctx.user.appRole)) throw new Error("هذه العملية مخصصة للطالب أو مالك العقار المعني.");
      return db.requestViewingReschedule(ctx.supabase, input.bookingId, input.viewingAt, input.reason);
    }),
    requestCancellation: protectedProcedure.input(z.object({ bookingId: z.string().uuid(), reason: appointmentExceptionReason })).mutation(({ ctx, input }) => {
      if (!["student", "owner"].includes(ctx.user.appRole)) throw new Error("هذه العملية مخصصة للطالب أو مالك العقار المعني.");
      return db.requestViewingCancellation(ctx.supabase, input.bookingId, input.reason);
    }),
    confirmReschedule: adminProcedure.input(z.object({ requestId: z.string().uuid(), viewingAt: z.string().datetime({ offset: true }) })).mutation(({ ctx, input }) => db.confirmViewingReschedule(ctx.supabase, input.requestId, input.viewingAt)),
    confirmCancellation: adminProcedure.input(z.object({ requestId: z.string().uuid() })).mutation(({ ctx, input }) => db.confirmViewingCancellation(ctx.supabase, input.requestId)),
    staffReschedule: adminProcedure.input(z.object({ bookingId: z.string().uuid(), viewingAt: z.string().datetime({ offset: true }), reason: appointmentExceptionReason })).mutation(({ ctx, input }) => db.staffRescheduleViewing(ctx.supabase, input.bookingId, input.viewingAt, input.reason)),
    staffCancel: adminProcedure.input(z.object({ bookingId: z.string().uuid(), reason: appointmentExceptionReason })).mutation(({ ctx, input }) => db.staffCancelViewing(ctx.supabase, input.bookingId, input.reason)),
    recordNoShow: adminProcedure.input(z.object({ bookingId: z.string().uuid(), party: z.enum(["student", "owner", "both"]), reason: appointmentExceptionReason })).mutation(({ ctx, input }) => db.recordViewingNoShow(ctx.supabase, input.bookingId, input.party, input.reason)),
    recordRefundDecision: adminProcedure.input(z.object({ bookingId: z.string().uuid(), decision: z.enum(["approved", "declined"]), amount: z.number().int().positive().nullable().optional(), reason: appointmentExceptionReason, reference: z.string().trim().min(3).max(180).optional() })).mutation(({ ctx, input }) => db.recordManualRefundDecision(ctx.supabase, input.bookingId, input.decision, input.amount ?? null, input.reason, input.reference)),
  }),
  admin: router({
    stats: adminProcedure.query(({ ctx }) => db.getStaffDashboardStats(ctx.supabase)),
    reviewQueue: adminProcedure.query(({ ctx }) => db.listReviewQueue(ctx.supabase)),
    ownerApplications: adminProcedure.query(({ ctx }) => db.listOwnerApplications(ctx.supabase)),
    reviewOwnerApplication: adminProcedure.input(z.object({ applicationId: z.string().uuid(), decision: z.enum(["approved", "rejected"]), note: z.string().max(1000).optional() })).mutation(({ ctx, input }) => db.reviewOwnerApplication(ctx.user.id, input)),
    updateExactLocation: adminProcedure.input(z.object({ propertyId: z.string().uuid(), exactLat: z.number().min(-90).max(90), exactLng: z.number().min(-180).max(180) })).mutation(({ ctx, input }) => db.updateStaffExactLocation(ctx.supabase, input.propertyId, input.exactLat, input.exactLng)),
    updatePropertyDescription: adminProcedure.input(z.object({ propertyId: z.string().uuid(), description: z.string().trim().min(db.MIN_PROPERTY_DESCRIPTION_LENGTH, db.PROPERTY_DESCRIPTION_VALIDATION_MESSAGE).max(5000) })).mutation(({ ctx, input }) => db.updateStaffPropertyDescription(ctx.supabase, input.propertyId, input.description)),
    review: adminProcedure.input(z.object({ propertyId: z.string().uuid(), status: z.enum(["VERIFIED", "NEEDS_CHANGES", "REJECTED"]), reason: z.string().max(1000).optional(), mediaQualityIssue: z.boolean().optional(), ownerIdentityVerified: z.boolean().optional(), propertyVideoVerified: z.boolean().optional(), locationVerified: z.boolean().optional(), availabilityVerified: z.boolean().optional(), propertyPhotosQualityVerified: z.boolean().optional() })).mutation(({ ctx, input }) => { if (input.status !== "VERIFIED" && !input.reason?.trim()) throw new Error("سبب القرار مطلوب عند طلب تعديل أو رفض الإعلان."); if (input.status === "REJECTED" && input.mediaQualityIssue && input.reason!.trim().length < 12) throw new Error("اكتب سبباً واضحاً لا يقل عن 12 حرفاً عند رفض الصور لجودتها أو ملاءمتها."); return db.reviewProperty(ctx.supabase, ctx.user.id, { ...input, status: input.status.toLowerCase() }); }),
  }),
  media: router({
    upload: protectedProcedure.input(z.object({ propertyId: z.string().uuid(), name: z.string().min(1).max(255), mimeType: z.union([z.string().regex(/^(image|video)\//), z.literal("application/pdf")]), dataBase64: z.string().min(1), mediaType: z.enum(["image", "video", "verification_document"]), verificationDocumentKind: z.enum(["national_id", "ownership_evidence"]).optional(), isPrimary: z.boolean().default(false), sortOrder: z.number().int().min(0).max(1000).optional(), description: z.string().trim().max(160).optional(), tag: z.string().trim().max(48).optional() }).superRefine((input, context) => { if (input.mediaType === "verification_document" && !input.verificationDocumentKind) context.addIssue({ code: z.ZodIssueCode.custom, path: ["verificationDocumentKind"], message: "حدد نوع مستند التحقق قبل رفعه." }); if (input.mediaType !== "verification_document" && input.verificationDocumentKind) context.addIssue({ code: z.ZodIssueCode.custom, path: ["verificationDocumentKind"], message: "نوع مستند التحقق يخص الملفات الخاصة فقط." }); })).mutation(({ ctx, input }) => db.uploadMedia(ctx.supabase, ctx.user.id, { ...input, actorRole: ctx.user.appRole })),
    delete: protectedProcedure.input(z.object({ mediaId: z.string().uuid() })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.deleteOwnerMedia(ctx.supabase, ctx.user.id, input.mediaId); }),
    reorder: protectedProcedure.input(z.object({ propertyId: z.string().uuid(), mediaIds: z.array(z.string().uuid()).min(1).max(db.MAX_PROPERTY_PHOTO_COUNT) })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.reorderOwnerPropertyMedia(ctx.supabase, ctx.user.id, input.propertyId, input.mediaIds); }),
    setCover: protectedProcedure.input(z.object({ propertyId: z.string().uuid(), mediaId: z.string().uuid() })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.setOwnerPropertyMediaCover(ctx.supabase, ctx.user.id, input.propertyId, input.mediaId); }),
    replace: protectedProcedure.input(z.object({ mediaId: z.string().uuid(), name: z.string().min(1).max(255), mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]), dataBase64: z.string().min(1), description: z.string().trim().max(160).optional(), tag: z.string().trim().max(48).optional() })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.replaceOwnerPropertyMedia(ctx.supabase, ctx.user.id, input); }),
    updateMetadata: protectedProcedure.input(z.object({ mediaId: z.string().uuid(), description: z.string().trim().max(160).nullable().optional(), tag: z.string().trim().max(48).nullable().optional() })).mutation(({ ctx, input }) => { requireOwner(ctx.user.appRole); return db.updateOwnerMediaMetadata(ctx.supabase, ctx.user.id, input); }),
  }),
  superAdmin: router({
    propertyViewStats: superAdminProcedure.query(({ ctx }) => db.getTotalPropertyViews(ctx.supabase)),
    listUsers: superAdminProcedure.input(z.object({ offset: z.number().int().min(0).max(100000).default(0), limit: z.number().int().min(1).max(50).default(25), query: z.string().max(80).optional(), role: z.enum(["student", "owner", "admin", "super_admin"]).optional() }).optional()).query(({ input }) => db.listProfilesForRoleManagement(input ?? { offset: 0, limit: 25 })),
    setRole: superAdminProcedure.input(z.object({ userId: z.string().uuid(), role: z.enum(["student", "owner", "admin"]) })).mutation(({ ctx, input }) => db.manageRole(ctx.user.appRole, ctx.user.id, input.userId, input.role)),
    deleteOwnerProfile: superAdminProcedure.input(z.object({ userId: z.string().uuid() })).mutation(({ ctx, input }) => db.deleteOwnerProfileWithStorageCleanup(ctx.user.appRole, ctx.user.id, input.userId)),
    deleteUser: superAdminProcedure.input(z.object({ userId: z.string().uuid() })).mutation(({ ctx, input }) => db.deleteUserWithAudit(ctx.user.id, input.userId)),
    propertyDeletionEligibility: superAdminProcedure.input(z.object({ propertyId: z.string().uuid() })).query(({ ctx, input }) => db.getSuperAdminPropertyDeletionEligibility(ctx.supabase, input.propertyId)),
    deleteProperty: superAdminProcedure.input(z.object({ propertyId: z.string().uuid() })).mutation(({ ctx, input }) => db.deleteSuperAdminProperty(ctx.supabase, input.propertyId)),
  }),
});

export type AppRouter = typeof appRouter;
