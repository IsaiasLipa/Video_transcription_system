import { afterEach, describe, expect, it, vi } from "vitest";
import { withRetry } from "../src/utils/retry";

describe("withRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries until the function succeeds", async () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    fn.mockRejectedValueOnce(new Error("fail-1"));
    fn.mockRejectedValueOnce(new Error("fail-2"));
    fn.mockResolvedValue("ok");

    const promise = withRetry(fn, { retries: 3, delayMs: 10, factor: 1 });
    const expectation = expect(promise).resolves.toBe("ok");
    await vi.runAllTimersAsync();
    await expectation;
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("throws the last error after exhausting retries", async () => {
    vi.useFakeTimers();
    const fn = vi.fn().mockRejectedValue(new Error("boom"));

    const promise = withRetry(fn, { retries: 2, delayMs: 10, factor: 1 });
    const expectation = expect(promise).rejects.toThrow("boom");
    await vi.runAllTimersAsync();
    await expectation;
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
