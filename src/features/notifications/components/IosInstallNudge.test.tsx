import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { IosInstallNudge } from "./IosInstallNudge";

function mockUserAgent(ua: string) {
  Object.defineProperty(navigator, "userAgent", {
    value: ua,
    configurable: true,
  });
}

function mockStandalone(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    value: vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    configurable: true,
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  mockUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
});

describe("IosInstallNudge", () => {
  it("does not render on a non-iOS user agent", () => {
    mockUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    );
    mockStandalone(false);
    render(<IosInstallNudge />);
    expect(screen.queryByText(/add my budget/i)).not.toBeInTheDocument();
  });

  it("does not render when already installed (display-mode: standalone)", () => {
    mockUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15",
    );
    mockStandalone(true);
    render(<IosInstallNudge />);
    expect(screen.queryByText(/add my budget/i)).not.toBeInTheDocument();
  });

  it("renders the nudge banner on iOS, non-standalone", () => {
    mockUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15",
    );
    mockStandalone(false);
    render(<IosInstallNudge />);
    expect(screen.getByText(/add my budget/i)).toBeInTheDocument();
  });

  it("clicking dismiss stores the key in localStorage and hides the banner", () => {
    mockUserAgent(
      "Mozilla/5.0 (iPad; CPU OS 16_4 like Mac OS X) AppleWebKit/605.1.15",
    );
    mockStandalone(false);
    render(<IosInstallNudge />);

    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));

    expect(localStorage.getItem("ios_nudge_dismissed")).toBe("true");
    expect(screen.queryByText(/add my budget/i)).not.toBeInTheDocument();
  });

  it("does not render again after dismissal is persisted (remount)", () => {
    mockUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15",
    );
    mockStandalone(false);
    localStorage.setItem("ios_nudge_dismissed", "true");
    render(<IosInstallNudge />);
    expect(screen.queryByText(/add my budget/i)).not.toBeInTheDocument();
  });
});
