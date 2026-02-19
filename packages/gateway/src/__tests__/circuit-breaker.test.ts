import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../circuit-breaker.js";

describe("CircuitBreaker", () => {
  const makeBreaker = (threshold = 3, cooldownMs = 1000) => {
    let now = 0;
    const clock = () => now;
    const advance = (ms: number) => {
      now += ms;
    };
    const breaker = new CircuitBreaker({ threshold, cooldownMs }, clock);
    return { breaker, advance };
  };

  it("starts in closed state", () => {
    const { breaker } = makeBreaker();
    expect(breaker.currentState.state).toBe("closed");
    expect(breaker.isOpen).toBe(false);
  });

  it("stays closed below threshold", () => {
    const { breaker } = makeBreaker(3);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.currentState.state).toBe("closed");
    expect(breaker.isOpen).toBe(false);
  });

  it("opens at exactly N failures", () => {
    const { breaker } = makeBreaker(3);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.currentState.state).toBe("open");
    expect(breaker.isOpen).toBe(true);
  });

  it("rejects when open (isOpen returns true)", () => {
    const { breaker } = makeBreaker(2);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.isOpen).toBe(true);
    expect(breaker.allowsProbe()).toBe(false);
  });

  it("transitions to half-open after cooldown", () => {
    const { breaker, advance } = makeBreaker(2, 1000);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.currentState.state).toBe("open");

    advance(1000);
    expect(breaker.currentState.state).toBe("half-open");
    expect(breaker.isOpen).toBe(false);
  });

  it("allows one probe in half-open", () => {
    const { breaker, advance } = makeBreaker(2, 1000);
    breaker.recordFailure();
    breaker.recordFailure();
    advance(1000);

    expect(breaker.allowsProbe()).toBe(true);
    // Second probe blocked
    expect(breaker.allowsProbe()).toBe(false);
  });

  it("closes on half-open success", () => {
    const { breaker, advance } = makeBreaker(2, 1000);
    breaker.recordFailure();
    breaker.recordFailure();
    advance(1000);

    breaker.allowsProbe();
    breaker.recordSuccess();

    expect(breaker.currentState.state).toBe("closed");
    expect(breaker.currentState.failures).toBe(0);
  });

  it("re-opens on half-open failure", () => {
    const { breaker, advance } = makeBreaker(2, 1000);
    breaker.recordFailure();
    breaker.recordFailure();
    advance(1000);

    breaker.allowsProbe();
    breaker.recordFailure();

    expect(breaker.currentState.state).toBe("open");
    expect(breaker.currentState.failures).toBe(3);
  });

  it("resets failure count on success in closed state", () => {
    const { breaker } = makeBreaker(5);
    breaker.recordFailure();
    breaker.recordFailure();
    breaker.recordSuccess();
    expect(breaker.currentState.failures).toBe(0);
    expect(breaker.currentState.state).toBe("closed");
  });

  it("multiple rapid failures count correctly", () => {
    const { breaker } = makeBreaker(5);
    for (let i = 0; i < 5; i++) {
      breaker.recordFailure();
    }
    expect(breaker.currentState.failures).toBe(5);
    expect(breaker.isOpen).toBe(true);
  });
});
