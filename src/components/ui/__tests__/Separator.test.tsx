import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Separator } from "../separator";

describe("Separator", () => {
  it("renders horizontal separator by default", () => {
    const { container } = render(<Separator />);
    const sep = container.firstChild as HTMLElement;
    expect(sep).toBeInTheDocument();
    expect(sep.className).toContain("h-[1px]");
    expect(sep.className).toContain("w-full");
  });

  it("renders vertical separator", () => {
    const { container } = render(<Separator orientation="vertical" />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.className).toContain("h-full");
    expect(sep.className).toContain("w-[1px]");
  });

  it("applies custom className", () => {
    const { container } = render(<Separator className="custom-sep" />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.className).toContain("custom-sep");
  });

  it("applies bg-border class", () => {
    const { container } = render(<Separator />);
    const sep = container.firstChild as HTMLElement;
    expect(sep.className).toContain("bg-border");
  });

  it("has correct role when decorative", () => {
    const { container } = render(<Separator decorative />);
    const sep = container.firstChild as HTMLElement;
    expect(sep).toHaveAttribute("role", "none");
  });

  it("has separator role when not decorative", () => {
    const { container } = render(<Separator decorative={false} orientation="horizontal" />);
    const sep = container.firstChild as HTMLElement;
    expect(sep).toHaveAttribute("role", "separator");
  });
});
