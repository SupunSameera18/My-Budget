import { describe, it, expect } from "vitest";
import { deriveChecklistState, isChecklistComplete } from "./checklist";

const zeroParams = {
  transactionCount: 0,
  budgetCount: 0,
  goalCount: 0,
  familyMemberCount: 0,
};

describe("deriveChecklistState", () => {
  it("returns 4 items", () => {
    expect(deriveChecklistState(zeroParams)).toHaveLength(4);
  });

  it("all items are not done when counts are zero", () => {
    const items = deriveChecklistState(zeroParams);
    expect(items.every((i) => !i.done)).toBe(true);
  });

  it("log_transaction is done when transactionCount > 0", () => {
    const items = deriveChecklistState({ ...zeroParams, transactionCount: 1 });
    expect(items.find((i) => i.id === "log_transaction")?.done).toBe(true);
  });

  it("create_budget is done when budgetCount > 0", () => {
    const items = deriveChecklistState({ ...zeroParams, budgetCount: 1 });
    expect(items.find((i) => i.id === "create_budget")?.done).toBe(true);
  });

  it("set_goal is done when goalCount > 0", () => {
    const items = deriveChecklistState({ ...zeroParams, goalCount: 1 });
    expect(items.find((i) => i.id === "set_goal")?.done).toBe(true);
  });

  it("invite_partner is done when familyMemberCount > 1", () => {
    const items = deriveChecklistState({ ...zeroParams, familyMemberCount: 2 });
    expect(items.find((i) => i.id === "invite_partner")?.done).toBe(true);
  });

  it("invite_partner is NOT done when familyMemberCount is 1 (solo user)", () => {
    const items = deriveChecklistState({ ...zeroParams, familyMemberCount: 1 });
    expect(items.find((i) => i.id === "invite_partner")?.done).toBe(false);
  });

  it("log_transaction href is /transactions/new", () => {
    const items = deriveChecklistState(zeroParams);
    expect(items.find((i) => i.id === "log_transaction")?.href).toBe(
      "/transactions/new",
    );
  });

  it("create_budget href is /budgets", () => {
    const items = deriveChecklistState(zeroParams);
    expect(items.find((i) => i.id === "create_budget")?.href).toBe("/budgets");
  });

  it("set_goal href is /goals", () => {
    const items = deriveChecklistState(zeroParams);
    expect(items.find((i) => i.id === "set_goal")?.href).toBe("/goals");
  });

  it("invite_partner href is /family", () => {
    const items = deriveChecklistState(zeroParams);
    expect(items.find((i) => i.id === "invite_partner")?.href).toBe("/family");
  });
});

describe("isChecklistComplete", () => {
  it("returns false when any item is not done", () => {
    const items = deriveChecklistState(zeroParams);
    expect(isChecklistComplete(items)).toBe(false);
  });

  it("returns true when all items are done", () => {
    const allDone = deriveChecklistState({
      transactionCount: 1,
      budgetCount: 1,
      goalCount: 1,
      familyMemberCount: 2,
    });
    expect(isChecklistComplete(allDone)).toBe(true);
  });

  it("returns false when only 3 of 4 items are done", () => {
    const threeDone = deriveChecklistState({
      transactionCount: 1,
      budgetCount: 1,
      goalCount: 1,
      familyMemberCount: 0,
    });
    expect(isChecklistComplete(threeDone)).toBe(false);
  });
});
