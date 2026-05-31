import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScrollArea, ScrollBar } from "../scroll-area";

describe("ScrollArea", () => {
  it("renders children", () => {
    render(
      <ScrollArea>
        <div>Scrollable content</div>
      </ScrollArea>
    );
    expect(screen.getByText("Scrollable content")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(
      <ScrollArea className="custom-scroll">
        <div>Content</div>
      </ScrollArea>
    );
    const scrollArea = container.firstChild as HTMLElement;
    expect(scrollArea.className).toContain("custom-scroll");
    expect(scrollArea.className).toContain("overflow-hidden");
  });

  it("renders with explicit ScrollBar", () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ height: 2000 }}>Long content</div>
        <ScrollBar />
      </ScrollArea>
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders ScrollBar with horizontal orientation", () => {
    const { container } = render(
      <ScrollArea>
        <div style={{ width: 2000 }}>Wide content</div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});
