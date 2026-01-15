import { describe, expect, it, vi, afterEach } from "vitest";
import { isWithinLastMonth } from "../src/utils/date";

describe("isWithinLastMonth", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for dates within the last month", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T00:00:00Z"));

    expect(isWithinLastMonth("2024-03-01T00:00:00Z")).toBe(true);
    expect(isWithinLastMonth(new Date("2024-02-20T00:00:00Z"))).toBe(true);
  });

  it("returns false for older dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-03-15T00:00:00Z"));

    expect(isWithinLastMonth("2024-02-14T00:00:00Z")).toBe(false);
  });

  it("returns false for invalid or empty values", () => {
    expect(isWithinLastMonth(undefined)).toBe(false);
    expect(isWithinLastMonth(null)).toBe(false);
    expect(isWithinLastMonth("not-a-date")).toBe(false);
  });
});
