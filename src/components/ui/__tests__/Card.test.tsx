import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "../Card";

describe("Card", () => {
  it("renders children", () => {
    render(<Card>Content</Card>);
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("applies default classes", () => {
    const { container } = render(<Card>Test</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("rounded-lg");
    expect(card.className).toContain("border");
    expect(card.className).toContain("bg-card");
  });

  it("applies custom className", () => {
    const { container } = render(<Card className="custom">Test</Card>);
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("custom");
  });

  it("forwards ref", () => {
    let ref: HTMLDivElement | null = null;
    render(<Card ref={(el) => { ref = el; }}>Test</Card>);
    expect(ref).toBeInstanceOf(HTMLDivElement);
  });
});

describe("CardHeader", () => {
  it("renders children", () => {
    render(<CardHeader>Header</CardHeader>);
    expect(screen.getByText("Header")).toBeInTheDocument();
  });

  it("applies default classes", () => {
    const { container } = render(<CardHeader>Test</CardHeader>);
    const header = container.firstChild as HTMLElement;
    expect(header.className).toContain("p-6");
  });

  it("forwards ref", () => {
    let ref: HTMLDivElement | null = null;
    render(<CardHeader ref={(el) => { ref = el; }}>Test</CardHeader>);
    expect(ref).toBeInstanceOf(HTMLDivElement);
  });
});

describe("CardTitle", () => {
  it("renders title text", () => {
    render(<CardTitle>My Title</CardTitle>);
    expect(screen.getByText("My Title").tagName).toBe("H3");
  });

  it("applies default classes", () => {
    render(<CardTitle>Test</CardTitle>);
    const title = screen.getByText("Test");
    expect(title.className).toContain("font-semibold");
  });

  it("forwards ref", () => {
    let ref: HTMLHeadingElement | null = null;
    render(<CardTitle ref={(el) => { ref = el; }}>Test</CardTitle>);
    expect(ref).toBeInstanceOf(HTMLHeadingElement);
  });
});

describe("CardDescription", () => {
  it("renders description text", () => {
    render(<CardDescription>A description</CardDescription>);
    expect(screen.getByText("A description")).toBeInTheDocument();
  });

  it("applies muted foreground class", () => {
    render(<CardDescription>Test</CardDescription>);
    expect(screen.getByText("Test").className).toContain("text-muted-foreground");
  });

  it("forwards ref", () => {
    let ref: HTMLParagraphElement | null = null;
    render(<CardDescription ref={(el) => { ref = el; }}>Test</CardDescription>);
    expect(ref).toBeInstanceOf(HTMLParagraphElement);
  });
});

describe("CardContent", () => {
  it("renders children", () => {
    render(<CardContent>Body</CardContent>);
    expect(screen.getByText("Body")).toBeInTheDocument();
  });

  it("forwards ref", () => {
    let ref: HTMLDivElement | null = null;
    render(<CardContent ref={(el) => { ref = el; }}>Test</CardContent>);
    expect(ref).toBeInstanceOf(HTMLDivElement);
  });
});

describe("CardFooter", () => {
  it("renders children", () => {
    render(<CardFooter>Footer</CardFooter>);
    expect(screen.getByText("Footer")).toBeInTheDocument();
  });

  it("applies flex classes", () => {
    const { container } = render(<CardFooter>Test</CardFooter>);
    const footer = container.firstChild as HTMLElement;
    expect(footer.className).toContain("flex");
    expect(footer.className).toContain("items-center");
  });

  it("forwards ref", () => {
    let ref: HTMLDivElement | null = null;
    render(<CardFooter ref={(el) => { ref = el; }}>Test</CardFooter>);
    expect(ref).toBeInstanceOf(HTMLDivElement);
  });
});
