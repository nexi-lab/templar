import { describe, expect, it } from "vitest";
import { SessionManager } from "../../session.js";

describe("SessionManager", () => {
  it("creates a session with valid metadata", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();

    expect(session.id).toBeDefined();
    expect(typeof session.id).toBe("string");
    expect(session.state).toBe("idle");
    expect(session.createdAt).toBeLessThanOrEqual(Date.now());
    expect(mgr.count).toBe(1);
  });

  it("creates multiple sessions up to max", () => {
    const mgr = new SessionManager(3);
    mgr.create();
    mgr.create();
    mgr.create();

    expect(mgr.count).toBe(3);
  });

  it("throws when creating session beyond max capacity", () => {
    const mgr = new SessionManager(1);
    mgr.create();

    expect(() => mgr.create()).toThrow("Maximum sessions reached (1)");
  });

  it("throws for invalid maxSessions", () => {
    expect(() => new SessionManager(0)).toThrow("maxSessions must be >= 1");
    expect(() => new SessionManager(-1)).toThrow("maxSessions must be >= 1");
  });

  it("gets session metadata by ID", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();
    const retrieved = mgr.get(session.id);

    expect(retrieved).toEqual(session);
  });

  it("returns undefined for non-existent session ID", () => {
    const mgr = new SessionManager(5);
    expect(mgr.get("non-existent")).toBeUndefined();
  });

  it("deletes a session", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();

    expect(mgr.delete(session.id)).toBe(true);
    expect(mgr.get(session.id)).toBeUndefined();
    expect(mgr.count).toBe(0);
  });

  it("returns false when deleting non-existent session", () => {
    const mgr = new SessionManager(5);
    expect(mgr.delete("non-existent")).toBe(false);
  });

  it("transitions session from idle to prompting via startPrompt", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();
    const controller = mgr.startPrompt(session.id);

    expect(controller).toBeInstanceOf(AbortController);
    expect(mgr.get(session.id)?.state).toBe("prompting");
  });

  it("throws when starting prompt on non-existent session", () => {
    const mgr = new SessionManager(5);
    expect(() => mgr.startPrompt("non-existent")).toThrow("Session non-existent not found");
  });

  it("rejects concurrent prompts on same session", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();
    mgr.startPrompt(session.id);

    expect(() => mgr.startPrompt(session.id)).toThrow("already has an active prompt");
  });

  it("transitions session back to idle via endPrompt", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();
    mgr.startPrompt(session.id);
    mgr.endPrompt(session.id);

    expect(mgr.get(session.id)?.state).toBe("idle");
  });

  it("endPrompt is safe for non-existent session", () => {
    const mgr = new SessionManager(5);
    expect(() => mgr.endPrompt("non-existent")).not.toThrow();
  });

  it("cancelPrompt aborts the controller", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();
    const controller = mgr.startPrompt(session.id);

    expect(controller.signal.aborted).toBe(false);
    mgr.cancelPrompt(session.id);
    expect(controller.signal.aborted).toBe(true);
  });

  it("cancelPrompt is safe for idle session", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();
    expect(() => mgr.cancelPrompt(session.id)).not.toThrow();
  });

  it("delete aborts in-flight prompt first", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();
    const controller = mgr.startPrompt(session.id);

    mgr.delete(session.id);
    expect(controller.signal.aborted).toBe(true);
    expect(mgr.count).toBe(0);
  });

  it("clear aborts all prompts and removes all sessions", () => {
    const mgr = new SessionManager(5);
    const s1 = mgr.create();
    const s2 = mgr.create();
    const c1 = mgr.startPrompt(s1.id);
    const c2 = mgr.startPrompt(s2.id);

    mgr.clear();

    expect(c1.signal.aborted).toBe(true);
    expect(c2.signal.aborted).toBe(true);
    expect(mgr.count).toBe(0);
  });

  it("allows new sessions after clearing", () => {
    const mgr = new SessionManager(1);
    mgr.create();
    mgr.clear();

    const session = mgr.create();
    expect(session.id).toBeDefined();
    expect(mgr.count).toBe(1);
  });

  it("allows prompt after endPrompt (state cycle)", () => {
    const mgr = new SessionManager(5);
    const session = mgr.create();

    mgr.startPrompt(session.id);
    mgr.endPrompt(session.id);

    // Should not throw — back to idle
    const controller = mgr.startPrompt(session.id);
    expect(controller).toBeInstanceOf(AbortController);
    expect(mgr.get(session.id)?.state).toBe("prompting");
  });
});
