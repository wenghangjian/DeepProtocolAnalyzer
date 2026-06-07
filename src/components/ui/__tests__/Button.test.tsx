import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button } from "../Button";

describe("Button", () => {
  it("renders children", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Click me");
  });

  it("applies default variant classes", () => {
    render(<Button>Default</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-primary");
  });

  it("applies primary variant (backward compat alias)", () => {
    render(<Button variant="primary">Primary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-primary");
  });

  it("applies destructive variant", () => {
    render(<Button variant="destructive">Delete</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-destructive");
  });

  it("applies danger variant (backward compat alias)", () => {
    render(<Button variant="danger">Danger</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-destructive");
  });

  it("applies outline variant", () => {
    render(<Button variant="outline">Outline</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("border-input");
  });

  it("applies secondary variant", () => {
    render(<Button variant="secondary">Secondary</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("bg-secondary");
  });

  it("applies ghost variant", () => {
    render(<Button variant="ghost">Ghost</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("hover:bg-accent");
  });

  it("applies link variant", () => {
    render(<Button variant="link">Link</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("underline-offset-4");
  });

  it("applies sm size", () => {
    render(<Button size="sm">Small</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("h-9");
  });

  it("applies lg size", () => {
    render(<Button size="lg">Large</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("h-11");
  });

  it("applies icon size", () => {
    render(<Button size="icon">X</Button>);
    const btn = screen.getByRole("button");
    expect(btn.className).toContain("h-10");
    expect(btn.className).toContain("w-10");
  });

  it("shows loading spinner when loading", () => {
    render(<Button loading>Loading</Button>);
    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn.querySelector("svg")).toBeInTheDocument();
  });

  it("disables button when loading", () => {
    render(<Button loading>Loading</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("disables button when disabled", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("handles click events", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button onClick={() => { clicked = true; }}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(true);
  });

  it("does not fire click when disabled", async () => {
    const user = userEvent.setup();
    let clicked = false;
    render(<Button disabled onClick={() => { clicked = true; }}>Click</Button>);
    await user.click(screen.getByRole("button"));
    expect(clicked).toBe(false);
  });

  it("applies custom className", () => {
    render(<Button className="custom-class">Custom</Button>);
    expect(screen.getByRole("button").className).toContain("custom-class");
  });

  it("forwards ref", () => {
    let ref: HTMLButtonElement | null = null;
    render(<Button ref={(el) => { ref = el; }}>Ref</Button>);
    expect(ref).toBeInstanceOf(HTMLButtonElement);
  });
});
