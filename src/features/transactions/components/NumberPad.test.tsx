import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { NumberPad } from "./NumberPad";

describe("NumberPad", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders all digit keys and special keys", () => {
    const onChange = vi.fn();
    render(<NumberPad value="0" onChange={onChange} />);
    for (const d of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]) {
      expect(screen.getByRole("button", { name: d })).toBeInTheDocument();
    }
    expect(screen.getByRole("button", { name: "." })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /backspace/i }),
    ).toBeInTheDocument();
  });

  it("tapping a digit replaces '0' with that digit", async () => {
    const onChange = vi.fn();
    render(<NumberPad value="0" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    expect(onChange).toHaveBeenCalledWith("5");
  });

  it("tapping multiple digits builds the number", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<NumberPad value="4" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "5" }));
    expect(onChange).toHaveBeenCalledWith("45");

    rerender(<NumberPad value="45" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "0" }));
    expect(onChange).toHaveBeenCalledWith("450");
  });

  it("tapping decimal appends '.'", async () => {
    const onChange = vi.fn();
    render(<NumberPad value="4" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "." }));
    expect(onChange).toHaveBeenCalledWith("4.");
  });

  it("tapping decimal twice does nothing (second tap ignored)", async () => {
    const onChange = vi.fn();
    render(<NumberPad value="4." onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "." }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("tapping backspace removes last digit", async () => {
    const onChange = vi.fn();
    render(<NumberPad value="450" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /backspace/i }));
    expect(onChange).toHaveBeenCalledWith("45");
  });

  it("tapping backspace on a single digit gives '0'", async () => {
    const onChange = vi.fn();
    render(<NumberPad value="5" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: /backspace/i }));
    expect(onChange).toHaveBeenCalledWith("0");
  });

  it("more than 2 decimal places not accepted", async () => {
    const onChange = vi.fn();
    render(<NumberPad value="1.23" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "4" }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("tapping a digit when value ends with 2 decimal digits is ignored", async () => {
    const onChange = vi.fn();
    render(<NumberPad value="1.50" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "9" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
