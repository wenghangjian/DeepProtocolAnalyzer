import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme } from "../use-theme";

describe("useTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("light");
  });

  it("defaults to dark when no saved preference", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
  });

  it("reads light from localStorage", () => {
    localStorage.setItem("dpa-theme", "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("light");
  });

  it("toggles from dark to light", () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current[0]).toBe("dark");
    act(() => { result.current[1](); });
    expect(result.current[0]).toBe("light");
  });

  it("toggles from light to dark", () => {
    localStorage.setItem("dpa-theme", "light");
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1](); });
    expect(result.current[0]).toBe("dark");
  });

  it("adds .light class to document for light theme", () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1](); });
    expect(document.documentElement.classList.contains("light")).toBe(true);
  });

  it("removes .light class from document for dark theme", () => {
    document.documentElement.classList.add("light");
    localStorage.setItem("dpa-theme", "light");
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1](); });
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it("persists to localStorage on toggle", () => {
    const { result } = renderHook(() => useTheme());
    act(() => { result.current[1](); });
    expect(localStorage.getItem("dpa-theme")).toBe("light");
  });

  it("uses custom storage key", () => {
    const { result } = renderHook(() => useTheme("custom-key"));
    act(() => { result.current[1](); });
    expect(localStorage.getItem("custom-key")).toBe("light");
  });
});
