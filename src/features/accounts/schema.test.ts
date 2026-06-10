import { describe, it, expect } from "vitest";
import {
  createAccountSchema,
  updateAccountSchema,
  internalTransferSchema,
  externalTransferSchema,
  ACCOUNT_TYPES,
  ACCOUNT_TYPE_LABELS,
  TRANSFER_DIRECTIONS,
} from "./schema";

// RFC 4122 variant-1 UUIDs: 4th group must start with 8/9/a/b
const VALID_UUID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VALID_UUID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("createAccountSchema", () => {
  it("accepts a valid account", () => {
    const result = createAccountSchema.safeParse({
      name: "My Savings",
      type: "savings",
      openingBalance: "1000.00",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = createAccountSchema.safeParse({
      name: "",
      type: "cash",
      openingBalance: "0",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 chars", () => {
    const result = createAccountSchema.safeParse({
      name: "a".repeat(51),
      type: "bank",
      openingBalance: "0",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid type", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      type: "credit",
      openingBalance: "0",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("type");
  });

  it("rejects a non-numeric opening balance", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      type: "cash",
      openingBalance: "abc",
    });
    expect(result.success).toBe(false);
  });

  it("defaults openingBalance to '0' when omitted", () => {
    const result = createAccountSchema.safeParse({
      name: "Test",
      type: "cash",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.openingBalance).toBe("0");
  });
});

describe("updateAccountSchema", () => {
  it("accepts a valid name and type", () => {
    const result = updateAccountSchema.safeParse({
      name: "My Bank",
      type: "bank",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    const result = updateAccountSchema.safeParse({
      name: "",
      type: "cash",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects name over 50 chars", () => {
    const result = updateAccountSchema.safeParse({
      name: "a".repeat(51),
      type: "savings",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("name");
  });

  it("rejects an invalid type", () => {
    const result = updateAccountSchema.safeParse({
      name: "Valid Name",
      type: "credit",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("type");
  });
});

describe("internalTransferSchema", () => {
  it("accepts a valid internal transfer with all fields", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      to_account_id: VALID_UUID_B,
      amount: "50.00",
      date: "2026-06-04",
      note: "Rent prepayment",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid transfer without note (note is optional)", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      to_account_id: VALID_UUID_B,
      amount: "100.00",
      date: "2026-06-04",
    });
    expect(result.success).toBe(true);
  });

  it("rejects same from_account_id and to_account_id with path [to_account_id]", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      to_account_id: VALID_UUID_A,
      amount: "50.00",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("to_account_id");
  });

  it("rejects amount of '0' (must be > 0)", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      to_account_id: VALID_UUID_B,
      amount: "0",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("amount");
  });

  it("rejects negative amount (fails regex)", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      to_account_id: VALID_UUID_B,
      amount: "-10",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("amount");
  });

  it("rejects non-numeric amount", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      to_account_id: VALID_UUID_B,
      amount: "abc",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("amount");
  });

  it("rejects missing from_account_id", () => {
    const result = internalTransferSchema.safeParse({
      to_account_id: VALID_UUID_B,
      amount: "50.00",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("from_account_id");
  });

  it("rejects missing to_account_id", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      amount: "50.00",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("to_account_id");
  });

  it("rejects note over 255 characters", () => {
    const result = internalTransferSchema.safeParse({
      from_account_id: VALID_UUID_A,
      to_account_id: VALID_UUID_B,
      amount: "50.00",
      date: "2026-06-04",
      note: "a".repeat(256),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("note");
  });
});

describe("externalTransferSchema", () => {
  it("accepts a valid external transfer in with all fields", () => {
    const result = externalTransferSchema.safeParse({
      account_id: VALID_UUID_A,
      direction: "in",
      amount: "200.00",
      date: "2026-06-04",
      note: "Loan repayment",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid external transfer out without note", () => {
    const result = externalTransferSchema.safeParse({
      account_id: VALID_UUID_A,
      direction: "out",
      amount: "50.00",
      date: "2026-06-04",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid direction with path [direction]", () => {
    const result = externalTransferSchema.safeParse({
      account_id: VALID_UUID_A,
      direction: "up",
      amount: "50.00",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("direction");
  });

  it("rejects amount '0' (must be > 0) with path [amount]", () => {
    const result = externalTransferSchema.safeParse({
      account_id: VALID_UUID_A,
      direction: "in",
      amount: "0",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("amount");
  });

  it("rejects negative amount (fails regex) with path [amount]", () => {
    const result = externalTransferSchema.safeParse({
      account_id: VALID_UUID_A,
      direction: "out",
      amount: "-10",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("amount");
  });

  it("rejects non-numeric amount with path [amount]", () => {
    const result = externalTransferSchema.safeParse({
      account_id: VALID_UUID_A,
      direction: "in",
      amount: "abc",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("amount");
  });

  it("rejects missing account_id with path [account_id]", () => {
    const result = externalTransferSchema.safeParse({
      direction: "in",
      amount: "50.00",
      date: "2026-06-04",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("account_id");
  });

  it("rejects note over 255 characters with path [note]", () => {
    const result = externalTransferSchema.safeParse({
      account_id: VALID_UUID_A,
      direction: "in",
      amount: "50.00",
      date: "2026-06-04",
      note: "a".repeat(256),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path[0]).toBe("note");
  });
});

describe("TRANSFER_DIRECTIONS", () => {
  it("contains exactly 'in' and 'out'", () => {
    expect([...TRANSFER_DIRECTIONS].sort()).toEqual(["in", "out"]);
  });
});

describe("ACCOUNT_TYPES", () => {
  it("contains exactly cash, bank, savings", () => {
    expect([...ACCOUNT_TYPES].sort()).toEqual(["bank", "cash", "savings"]);
  });
});

describe("ACCOUNT_TYPE_LABELS", () => {
  it("has a label for every type", () => {
    for (const t of ACCOUNT_TYPES) {
      expect(ACCOUNT_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});
