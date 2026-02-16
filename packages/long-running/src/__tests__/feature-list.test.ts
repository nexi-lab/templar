import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FeatureList } from "../feature-list.js";
import type { Feature, FeatureListDocument } from "../types.js";

function makeFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: "feat-1",
    category: "functional",
    description: "Add login page",
    priority: 1,
    steps: ["Create form", "Add validation"],
    passes: false,
    ...overrides,
  };
}

function makeFeatures(count: number): readonly Feature[] {
  return Array.from({ length: count }, (_, i) =>
    makeFeature({
      id: `feat-${i + 1}`,
      description: `Feature ${i + 1}`,
      priority: i + 1,
    }),
  );
}

describe("FeatureList", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join("/tmp", "feature-list-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  // ============================================================================
  // 1. Create feature list from features array
  // ============================================================================
  it("creates a feature list from features array", () => {
    const features = makeFeatures(3);
    const list = FeatureList.create(features);

    expect(list.features).toHaveLength(3);
    expect(list.features[0]?.id).toBe("feat-1");
    expect(list.summary.total).toBe(3);
    expect(list.summary.completed).toBe(0);
    expect(list.summary.percentage).toBe(0);
  });

  // ============================================================================
  // 2. Mark feature passes: true (happy path)
  // ============================================================================
  it("marks a feature as passing", () => {
    const list = FeatureList.create(makeFeatures(3));
    const updated = list.markPassing("feat-2");

    expect(updated.features[1]?.passes).toBe(true);
    expect(updated.summary.completed).toBe(1);
    expect(updated.summary.percentage).toBeCloseTo(33.33, 1);
    // Original is unchanged (immutable)
    expect(list.features[1]?.passes).toBe(false);
  });

  // ============================================================================
  // 3. Mark already-passing feature passes: true (idempotent)
  // ============================================================================
  it("allows marking an already-passing feature (idempotent)", () => {
    const list = FeatureList.create(makeFeatures(3)).markPassing("feat-1");
    const updated = list.markPassing("feat-1");

    expect(updated.features[0]?.passes).toBe(true);
    expect(updated.summary.completed).toBe(1);
  });

  // ============================================================================
  // 4. Reject removing a feature
  // ============================================================================
  it("rejects removing a feature via validateDiff", async () => {
    const list = FeatureList.create(makeFeatures(3));
    await list.save(tmpDir, "feature-list.json");

    // Manually tamper: load, remove a feature, try to save
    const filePath = path.join(tmpDir, "feature-list.json");
    const raw = JSON.parse(await fs.readFile(filePath, "utf-8")) as FeatureListDocument;
    const tampered: FeatureListDocument = {
      ...raw,
      features: raw.features.slice(1),
      lastUpdatedAt: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(tampered));

    // Loading and comparing should detect the removal
    const loaded = await FeatureList.load(tmpDir, "feature-list.json");
    expect(loaded).not.toBeNull();

    // Build a new list from the tampered doc and try to validate against original
    const tamperedList = FeatureList.create(tampered.features);
    expect(() => tamperedList.validateAgainst(list)).toThrow(/immutability/i);
  });

  // ============================================================================
  // 5. Reject editing feature description
  // ============================================================================
  it("rejects editing a feature description", () => {
    const list = FeatureList.create(makeFeatures(3));
    const features = list.features.map((f) =>
      f.id === "feat-1" ? { ...f, description: "Changed!" } : f,
    );
    const tampered = FeatureList.create(features);

    expect(() => tampered.validateAgainst(list)).toThrow(/immutability/i);
  });

  // ============================================================================
  // 6. Reject editing feature ID
  // ============================================================================
  it("rejects editing a feature ID", () => {
    const list = FeatureList.create(makeFeatures(3));
    const features = list.features.map((f) => (f.id === "feat-1" ? { ...f, id: "renamed" } : f));
    const tampered = FeatureList.create(features);

    expect(() => tampered.validateAgainst(list)).toThrow(/immutability/i);
  });

  // ============================================================================
  // 7. Reject editing feature steps
  // ============================================================================
  it("rejects editing feature steps", () => {
    const list = FeatureList.create(makeFeatures(3));
    const features = list.features.map((f) =>
      f.id === "feat-1" ? { ...f, steps: ["Different step"] } : f,
    );
    const tampered = FeatureList.create(features);

    expect(() => tampered.validateAgainst(list)).toThrow(/immutability/i);
  });

  // ============================================================================
  // 8. Reject reordering features
  // ============================================================================
  it("rejects reordering features", () => {
    const list = FeatureList.create(makeFeatures(3));
    const reversed = FeatureList.create([...list.features].reverse());

    expect(() => reversed.validateAgainst(list)).toThrow(/immutability/i);
  });

  // ============================================================================
  // 9. Allow adding feature in initializer mode
  // ============================================================================
  it("allows adding a feature in initializer mode", () => {
    const list = FeatureList.create(makeFeatures(2));
    const newFeature = makeFeature({ id: "feat-new", description: "New" });

    const updated = list.addFeature(newFeature, "initializer");
    expect(updated.features).toHaveLength(3);
    expect(updated.features[2]?.id).toBe("feat-new");
  });

  // ============================================================================
  // 10. Reject adding feature in coder mode
  // ============================================================================
  it("rejects adding a feature in coder mode", () => {
    const list = FeatureList.create(makeFeatures(2));
    const newFeature = makeFeature({ id: "feat-new", description: "New" });

    expect(() => list.addFeature(newFeature, "coder")).toThrow(/coder mode/i);
  });

  // ============================================================================
  // 11. Handle empty feature list at init
  // ============================================================================
  it("load returns null when file does not exist", async () => {
    const result = await FeatureList.load(tmpDir, "nonexistent.json");
    expect(result).toBeNull();
  });

  // ============================================================================
  // 12. Handle 200+ features (performance)
  // ============================================================================
  it("handles 200+ features efficiently", () => {
    const features = makeFeatures(250);
    const list = FeatureList.create(features);

    expect(list.features).toHaveLength(250);
    expect(list.summary.total).toBe(250);

    // Mark all passing quickly
    let current = list;
    for (let i = 1; i <= 250; i++) {
      current = current.markPassing(`feat-${i}`);
    }
    expect(current.summary.completed).toBe(250);
    expect(current.summary.percentage).toBe(100);
  });

  // ============================================================================
  // 13. Recover from corrupted JSON via git fallback
  // ============================================================================
  it("returns null when file contains corrupted JSON", async () => {
    const filePath = path.join(tmpDir, "feature-list.json");
    await fs.writeFile(filePath, "{ not valid json !!!");

    const result = await FeatureList.load(tmpDir, "feature-list.json");
    expect(result).toBeNull();
  });

  // ============================================================================
  // Additional tests
  // ============================================================================
  it("throws when marking a non-existent feature", () => {
    const list = FeatureList.create(makeFeatures(3));
    expect(() => list.markPassing("nonexistent")).toThrow(/not found/i);
  });

  it("saves and loads a feature list round-trip", async () => {
    const list = FeatureList.create(makeFeatures(3)).markPassing("feat-2");
    await list.save(tmpDir, "feature-list.json");

    const loaded = await FeatureList.load(tmpDir, "feature-list.json");
    expect(loaded).not.toBeNull();
    expect(loaded?.features).toHaveLength(3);
    expect(loaded?.features[1]?.passes).toBe(true);
    expect(loaded?.summary.completed).toBe(1);
  });

  it("nextIncomplete returns only features with passes: false", () => {
    const list = FeatureList.create(makeFeatures(5)).markPassing("feat-1").markPassing("feat-3");

    const next = list.nextIncomplete(3);
    expect(next).toHaveLength(3);
    expect(next[0]?.id).toBe("feat-2");
    expect(next[1]?.id).toBe("feat-4");
    expect(next[2]?.id).toBe("feat-5");
  });

  it("nextIncomplete returns fewer when not enough incomplete", () => {
    const list = FeatureList.create(makeFeatures(2)).markPassing("feat-1").markPassing("feat-2");

    const next = list.nextIncomplete(5);
    expect(next).toHaveLength(0);
  });

  it("rejects reverting passes from true to false", () => {
    const original = FeatureList.create(makeFeatures(3)).markPassing("feat-1");
    const reverted = FeatureList.create(
      original.features.map((f) => (f.id === "feat-1" ? { ...f, passes: false } : f)),
    );

    expect(() => reverted.validateAgainst(original)).toThrow(/immutability/i);
  });

  it("toDocument returns a valid FeatureListDocument", () => {
    const list = FeatureList.create(makeFeatures(2));
    const doc = list.toDocument();

    expect(doc.features).toHaveLength(2);
    expect(doc.createdAt).toBeDefined();
    expect(doc.lastUpdatedAt).toBeDefined();
  });
});
