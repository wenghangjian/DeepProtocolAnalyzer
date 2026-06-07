import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Input } from "../Input";

describe("Input", () => {
  it("renders an input element", () => {
    render(<Input placeholder="Type here" />);
    expect(screen.getByPlaceholderText("Type here")).toBeInTheDocument();
  });

  it("applies default classes", () => {
    render(<Input data-testid="input" />);
    const input = screen.getByTestId("input");
    expect(input.className).toContain("h-10");
    expect(input.className).toContain("w-full");
    expect(input.className).toContain("border-input");
    expect(input.className).toContain("bg-background");
  });

  it("applies custom className", () => {
    render(<Input className="custom" data-testid="input" />);
    expect(screen.getByTestId("input").className).toContain("custom");
  });

  it("handles value changes", async () => {
    const user = userEvent.setup();
    render(<Input placeholder="test" />);
    const input = screen.getByPlaceholderText("test");
    await user.type(input, "hello");
    expect(input).toHaveValue("hello");
  });

  it("can be disabled", () => {
    render(<Input disabled data-testid="input" />);
    expect(screen.getByTestId("input")).toBeDisabled();
  });

  it("supports different types", () => {
    render(<Input type="email" data-testid="input" />);
    expect(screen.getByTestId("input")).toHaveAttribute("type", "email");
  });

  it("forwards ref", () => {
    let ref: HTMLInputElement | null = null;
    render(<Input ref={(el) => { ref = el; }} />);
    expect(ref).toBeInstanceOf(HTMLInputElement);
  });

  it("supports placeholder styling", () => {
    render(<Input placeholder="ph" data-testid="input" />);
    const input = screen.getByTestId("input");
    expect(input.className).toContain("placeholder:text-muted-foreground");
  });
});
