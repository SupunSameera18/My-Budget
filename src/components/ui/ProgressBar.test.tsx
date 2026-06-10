import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ProgressBar } from "./ProgressBar";

describe("ProgressBar", () => {
  it("renders a progressbar role element", () => {
    render(<ProgressBar pctUsed={50} />);
    expect(screen.getByRole("progressbar")).toBeTruthy();
  });

  it("fill uses teal gradient when pctUsed < 80", () => {
    render(<ProgressBar pctUsed={50} />);
    const bar = screen.getByRole("progressbar");
    // jsdom converts hex to rgb — check for the teal rgb value
    expect(bar.style.background).toContain("79, 166, 166");
  });

  it("fill uses amber when pctUsed >= 80", () => {
    render(<ProgressBar pctUsed={80} />);
    const bar = screen.getByRole("progressbar");
    // jsdom converts #C9A24B → rgb(201, 162, 75)
    expect(bar.style.background).toContain("201, 162, 75");
  });

  it("fill uses amber when pctUsed > 100 (over budget)", () => {
    render(<ProgressBar pctUsed={120} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.background).toContain("201, 162, 75");
  });

  it("fill width is capped at 100% when pctUsed > 100", () => {
    render(<ProgressBar pctUsed={150} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.width).toBe("100%");
  });

  it("fill width matches pctUsed when <= 100", () => {
    render(<ProgressBar pctUsed={60} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.width).toBe("60%");
  });

  it("limitMarker={true} renders the marker element", () => {
    const { container } = render(<ProgressBar pctUsed={50} limitMarker />);
    const marker = container.querySelector('[aria-hidden="true"]');
    expect(marker).toBeTruthy();
  });

  it("limitMarker absent renders no marker element", () => {
    const { container } = render(<ProgressBar pctUsed={50} />);
    const marker = container.querySelector('[aria-hidden="true"]');
    expect(marker).toBeNull();
  });

  it("noAmber={true} at 90% uses teal fill (not amber)", () => {
    render(<ProgressBar pctUsed={90} noAmber />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.background).toContain("79, 166, 166");
  });

  it("noAmber={true} at 120% uses teal fill and width capped at 100%", () => {
    render(<ProgressBar pctUsed={120} noAmber />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.background).toContain("79, 166, 166");
    expect(bar.style.width).toBe("100%");
  });

  it("noAmber omitted at 90% uses amber fill (regression guard)", () => {
    render(<ProgressBar pctUsed={90} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.style.background).toContain("201, 162, 75");
  });
});
