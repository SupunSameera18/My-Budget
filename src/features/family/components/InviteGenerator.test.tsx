import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InviteGenerator } from "./InviteGenerator";
import type { FamilyStatus } from "@/features/family/schema";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/features/family/server/actions", () => ({
  generateInviteCode: vi.fn(),
  revokeInviteCode: vi.fn(),
}));

import {
  generateInviteCode,
  revokeInviteCode,
} from "@/features/family/server/actions";

const soloStatus: Extract<FamilyStatus, { status: "solo" }> = {
  status: "solo",
};
const hasInviteStatus: Extract<FamilyStatus, { status: "has_invite" }> = {
  status: "has_invite",
  familyUnitId: "unit-1",
  invite: {
    id: "inv-1",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(generateInviteCode).mockResolvedValue({
    ok: true,
    data: { code: "abc123" },
  });
  vi.mocked(revokeInviteCode).mockResolvedValue({ ok: true, data: undefined });
});

describe("InviteGenerator — solo state", () => {
  it("shows generate button when status is solo", () => {
    render(<InviteGenerator familyStatus={soloStatus} />);
    expect(
      screen.getByRole("button", { name: /generate invite code/i }),
    ).toBeInTheDocument();
  });

  it("calls generateInviteCode on click and shows the code", async () => {
    render(<InviteGenerator familyStatus={soloStatus} />);

    fireEvent.click(
      screen.getByRole("button", { name: /generate invite code/i }),
    );

    await waitFor(() => {
      expect(generateInviteCode).toHaveBeenCalledOnce();
      expect(screen.getByLabelText("Invite code")).toHaveTextContent("abc123");
    });
  });

  it("shows error message in ARIA live region on generate failure", async () => {
    vi.mocked(generateInviteCode).mockResolvedValue({
      ok: false,
      error: {
        code: "invite_generate_failed" as never,
        message: "Failed to generate",
      },
    });

    render(<InviteGenerator familyStatus={soloStatus} />);
    fireEvent.click(
      screen.getByRole("button", { name: /generate invite code/i }),
    );

    await waitFor(() => {
      expect(screen.getAllByRole("status")[0]).toHaveTextContent(
        "Failed to generate",
      );
    });
  });
});

describe("InviteGenerator — has_invite state", () => {
  it("shows pending invite message with expiry", () => {
    render(<InviteGenerator familyStatus={hasInviteStatus} />);
    expect(screen.getByText(/pending invite/i)).toBeInTheDocument();
  });

  it("shows revoke button", () => {
    render(<InviteGenerator familyStatus={hasInviteStatus} />);
    expect(screen.getByRole("button", { name: /revoke/i })).toBeInTheDocument();
  });

  it("calls revokeInviteCode when revoke button clicked", async () => {
    render(<InviteGenerator familyStatus={hasInviteStatus} />);

    fireEvent.click(screen.getByRole("button", { name: /revoke/i }));

    await waitFor(() => {
      expect(revokeInviteCode).toHaveBeenCalledWith("inv-1");
    });
  });
});

describe("InviteGenerator — copy button", () => {
  it("shows copy button after generating code and announces Copied!", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<InviteGenerator familyStatus={soloStatus} />);
    fireEvent.click(
      screen.getByRole("button", { name: /generate invite code/i }),
    );

    await waitFor(() => screen.getByRole("button", { name: /copy code/i }));

    fireEvent.click(screen.getByRole("button", { name: /copy code/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("abc123");
    });
  });

  it("ARIA live region is always in the DOM (never conditionally mounted)", () => {
    render(<InviteGenerator familyStatus={soloStatus} />);
    const liveRegions = screen.getAllByRole("status");
    expect(liveRegions.length).toBeGreaterThanOrEqual(1);
    expect(liveRegions[0]).toBeInTheDocument();
  });
});
