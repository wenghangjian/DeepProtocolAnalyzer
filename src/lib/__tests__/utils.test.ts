import { describe, it, expect } from "vitest";
import { cn } from "../utils";

describe("cn", () => {
  it("merges class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting Tailwind classes", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
  });

  it("handles conditional classes", () => {
    expect(cn("base", false && "hidden", "extra")).toBe("base extra");
  });

  it("handles undefined and null", () => {
    expect(cn("base", undefined, null)).toBe("base");
  });

  it("handles empty input", () => {
    expect(cn()).toBe("");
  });

  it("merges array of classes", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("handles object syntax", () => {
    expect(cn({ foo: true, bar: false })).toBe("foo");
  });

  it("resolves Tailwind merge conflicts for border", () => {
    expect(cn("border-red-500", "border-blue-500")).toBe("border-blue-500");
  });
});
