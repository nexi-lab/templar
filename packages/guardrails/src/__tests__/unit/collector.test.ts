import { describe, expect, it } from "vitest";
import { EvidenceCollector } from "../../evidence/collector.js";
import type { EvidenceRecord } from "../../evidence/types.js";

function makeRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    sessionId: "session-1",
    turnNumber: 1,
    guard: "test-guard",
    field: "sources",
    value: ["evidence"],
    timestamp: Date.now(),
    ...overrides,
  };
}

describe("EvidenceCollector", () => {
  it("records entries with immutable append", () => {
    const collector = new EvidenceCollector();
    const r1 = makeRecord({ field: "a" });
    const r2 = makeRecord({ field: "b" });

    collector.record(r1);
    const afterFirst = collector.getRecords();
    collector.record(r2);
    const afterSecond = collector.getRecords();

    // Original reference should not be mutated
    expect(afterFirst).toHaveLength(1);
    expect(afterSecond).toHaveLength(2);
    expect(afterFirst).not.toBe(afterSecond);
  });

  it("generates a report for a session", () => {
    const collector = new EvidenceCollector();
    collector.record(makeRecord({ guard: "g1", field: "f1" }));
    collector.record(makeRecord({ guard: "g1", field: "f2" }));
    collector.record(makeRecord({ guard: "g2", field: "f1" }));
    collector.record(makeRecord({ sessionId: "other" }));

    const report = collector.report("session-1");

    expect(report.sessionId).toBe("session-1");
    expect(report.totalRecords).toBe(3);
    expect(report.byGuard).toEqual({ g1: 2, g2: 1 });
    expect(report.byField).toEqual({ f1: 2, f2: 1 });
    expect(report.generatedAt).toBeGreaterThan(0);
  });

  it("caps at maxRecords", () => {
    const collector = new EvidenceCollector({ maxRecords: 3 });

    collector.record(makeRecord({ field: "a" }));
    collector.record(makeRecord({ field: "b" }));
    collector.record(makeRecord({ field: "c" }));
    collector.record(makeRecord({ field: "d" }));

    const records = collector.getRecords();
    expect(records).toHaveLength(3);
    // Oldest (a) should be dropped
    expect(records[0]?.field).toBe("b");
    expect(records[2]?.field).toBe("d");
  });

  it("resets all records", () => {
    const collector = new EvidenceCollector();
    collector.record(makeRecord());
    collector.record(makeRecord());

    collector.reset();
    expect(collector.getRecords()).toHaveLength(0);
  });
});
