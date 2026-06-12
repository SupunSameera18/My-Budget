import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders a <section> element (landmark role=region)", () => {
    render(<EmptyState heading="No items yet" body="Add your first item." />);
    expect(screen.getByRole("region")).toBeTruthy();
  });

  it("renders heading as <h2>", () => {
    render(<EmptyState heading="No items yet" body="Add your first item." />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toBe("No items yet");
  });

  it("section is labelled by the heading via aria-labelledby", () => {
    render(<EmptyState heading="No items yet" body="Add your first item." />);
    const section = screen.getByRole("region");
    const headingId = section.getAttribute("aria-labelledby");
    expect(headingId).toBeTruthy();
    const heading = document.getElementById(headingId!);
    expect(heading?.textContent).toBe("No items yet");
  });

  it("renders body text", () => {
    render(<EmptyState heading="No items yet" body="Add your first item." />);
    expect(screen.getByText("Add your first item.")).toBeTruthy();
  });

  it("renders action link when actionLabel and actionHref are provided", () => {
    render(
      <EmptyState
        heading="No budgets yet"
        body="Create a budget to get started."
        actionLabel="Add Budget"
        actionHref="/settings/budgets"
      />,
    );
    const link = screen.getByRole("link", { name: /add budget/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/settings/budgets");
  });

  it("does not render action link when actionLabel/actionHref are omitted", () => {
    render(<EmptyState heading="No items yet" body="Nothing here." />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("does not render body paragraph when body is empty string", () => {
    render(<EmptyState heading="No data" body="" />);
    const section = screen.getByRole("region");
    expect(section.querySelector("p")).toBeNull();
  });

  it("generates unique headingIds for two simultaneous instances with the same heading", () => {
    const { container } = render(
      <>
        <EmptyState heading="No data for this period" body="" />
        <EmptyState heading="No data for this period" body="" />
      </>,
    );
    const sections = container.querySelectorAll("section[aria-labelledby]");
    const id1 = sections[0].getAttribute("aria-labelledby");
    const id2 = sections[1].getAttribute("aria-labelledby");
    expect(id1).not.toBe(id2);
  });
});
