import { describe, expect, it } from "vitest";
import { studentViewingNextAction } from "./viewingFlow";

describe("studentViewingNextAction", () => {
  it("keeps a pending reschedule distinct from the confirmed appointment", () => {
    expect(studentViewingNextAction({ rescheduleRequest: { status: "pending" } })).toContain("يبقى الموعد الحالي سارياً");
  });

  it("does not promise an automatic refund after a no-show", () => {
    expect(studentViewingNextAction({ status: "no_show", refundReviewStatus: "pending" })).toContain("لا يُعتمد استرداد تلقائياً");
  });

  it("preserves the non-refundable commercial rule after a completed rejected viewing", () => {
    expect(studentViewingNextAction({ studentViewingDecision: "rejected" })).toContain("غير قابلة للاسترداد");
  });
});
