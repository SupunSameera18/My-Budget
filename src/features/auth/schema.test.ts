import { describe, it, expect } from "vitest";
import {
  signInSchema,
  signUpSchema,
  resetPasswordSchema,
  updatePasswordSchema,
} from "./schema";

describe("signInSchema", () => {
  it("accepts valid email and 8+ char password", () => {
    const result = signInSchema.safeParse({
      email: "user@example.com",
      password: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email format", () => {
    const result = signInSchema.safeParse({
      email: "not-an-email",
      password: "password123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Enter a valid email address",
      );
    }
  });

  it("rejects password shorter than 8 characters", () => {
    const result = signInSchema.safeParse({
      email: "user@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Password must be at least 8 characters",
      );
    }
  });
});

describe("signUpSchema", () => {
  it("accepts valid data with matching passwords", () => {
    const result = signUpSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords with field-level error on confirmPassword", () => {
    const result = signUpSchema.safeParse({
      email: "user@example.com",
      password: "password123",
      confirmPassword: "different123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmErr = result.error.issues.find(
        (e) => e.path[0] === "confirmPassword",
      );
      expect(confirmErr?.message).toBe("Passwords do not match");
    }
  });

  it("rejects password shorter than 8 chars", () => {
    const result = signUpSchema.safeParse({
      email: "user@example.com",
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const pwdErr = result.error.issues.find((e) => e.path[0] === "password");
      expect(pwdErr?.message).toBe("Password must be at least 8 characters");
    }
  });

  it("rejects invalid email", () => {
    const result = signUpSchema.safeParse({
      email: "bad",
      password: "password123",
      confirmPassword: "password123",
    });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("accepts valid email", () => {
    const result = resetPasswordSchema.safeParse({ email: "user@example.com" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = resetPasswordSchema.safeParse({ email: "bad-email" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(
        "Enter a valid email address",
      );
    }
  });
});

describe("updatePasswordSchema", () => {
  it("accepts matching strong passwords", () => {
    const result = updatePasswordSchema.safeParse({
      password: "newpassword123",
      confirmPassword: "newpassword123",
    });
    expect(result.success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = updatePasswordSchema.safeParse({
      password: "newpassword123",
      confirmPassword: "different123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmErr = result.error.issues.find(
        (e) => e.path[0] === "confirmPassword",
      );
      expect(confirmErr?.message).toBe("Passwords do not match");
    }
  });

  it("rejects short password", () => {
    const result = updatePasswordSchema.safeParse({
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });
});
