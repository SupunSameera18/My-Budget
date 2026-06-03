import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, type Mock } from "vitest";
import { OfflineRetryBanner } from "./OfflineRetryBanner";

vi.mock("@/lib/hooks/useOnlineStatus", () => ({
  useOnlineStatus: vi.fn(),
}));

// Import after mock registration so we get the mocked version
import { useOnlineStatus } from "@/lib/hooks/useOnlineStatus";

beforeEach(() => {
  vi.resetAllMocks();
});

describe("OfflineRetryBanner", () => {
  it("renders nothing when online", () => {
    (useOnlineStatus as Mock).mockReturnValue(true);
    const { container } = render(<OfflineRetryBanner onRetry={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the amber banner when offline", () => {
    (useOnlineStatus as Mock).mockReturnValue(false);
    render(<OfflineRetryBanner onRetry={vi.fn()} />);
    expect(
      screen.getByText(/you're offline — your entry is saved here/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /retry\?/i }),
    ).toBeInTheDocument();
  });

  it("banner wrapper has role alert", () => {
    (useOnlineStatus as Mock).mockReturnValue(false);
    render(<OfflineRetryBanner onRetry={vi.fn()} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("Retry button has type=button to prevent form submission", () => {
    (useOnlineStatus as Mock).mockReturnValue(false);
    render(<OfflineRetryBanner onRetry={vi.fn()} />);
    const button = screen.getByRole("button", { name: /retry\?/i });
    expect(button).toHaveAttribute("type", "button");
  });

  it("calls onRetry when Retry button is clicked", async () => {
    (useOnlineStatus as Mock).mockReturnValue(false);
    const onRetry = vi.fn();
    render(<OfflineRetryBanner onRetry={onRetry} />);
    const button = screen.getByRole("button", { name: /retry\?/i });
    await userEvent.click(button);
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
