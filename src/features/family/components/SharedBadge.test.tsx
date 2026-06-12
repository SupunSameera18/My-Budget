import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SharedBadge } from "./SharedBadge";

describe("SharedBadge", () => {
  describe("in family mode with shared transaction", () => {
    it("renders the badge with correct text", () => {
      render(<SharedBadge isFamilyMode isShared />);
      expect(screen.getByText("Shared")).toBeTruthy();
    });

    it("has aria-label='Shared transaction' (AC 15)", () => {
      render(<SharedBadge isFamilyMode isShared />);
      const badge = screen.getByText("Shared");
      expect(badge.getAttribute("aria-label")).toBe("Shared transaction");
    });

    it("is visible in the DOM", () => {
      render(<SharedBadge isFamilyMode isShared />);
      const badge = screen.getByLabelText("Shared transaction");
      expect(badge).toBeTruthy();
    });
  });

  describe("in family mode with personal transaction", () => {
    it("renders nothing when isShared=false", () => {
      render(<SharedBadge isFamilyMode isShared={false} />);
      expect(screen.queryByText("Shared")).toBeNull();
      expect(screen.queryByLabelText("Shared transaction")).toBeNull();
    });
  });

  describe("in single-user mode (no family context)", () => {
    it("renders nothing when isFamilyMode=false and isShared=true (AC 5)", () => {
      render(<SharedBadge isFamilyMode={false} isShared />);
      expect(screen.queryByText("Shared")).toBeNull();
      expect(screen.queryByLabelText("Shared transaction")).toBeNull();
    });

    it("renders nothing when isFamilyMode=false and isShared=false (AC 5)", () => {
      render(<SharedBadge isFamilyMode={false} isShared={false} />);
      expect(screen.queryByText("Shared")).toBeNull();
    });
  });
});
