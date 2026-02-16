import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Feature, FeatureListDocument, SessionMode } from "./types.js";
import { validateFeatureListDocument } from "./validation.js";

/**
 * Immutable feature list with structural diff validation.
 *
 * Enforces that features can only be marked as passing — never removed,
 * reordered, or edited in any other way.
 */
export class FeatureList {
  private readonly _features: readonly Feature[];
  private readonly _createdAt: string;
  private readonly _lastUpdatedAt: string;

  private constructor(features: readonly Feature[], createdAt: string, lastUpdatedAt: string) {
    this._features = features;
    this._createdAt = createdAt;
    this._lastUpdatedAt = lastUpdatedAt;
  }

  // ==========================================================================
  // FACTORIES
  // ==========================================================================

  /**
   * Create a new feature list from an array of features.
   */
  static create(features: readonly Feature[]): FeatureList {
    const now = new Date().toISOString();
    return new FeatureList(features, now, now);
  }

  /**
   * Reconstruct a FeatureList from a persisted document.
   */
  static fromDocument(doc: FeatureListDocument): FeatureList {
    return new FeatureList(doc.features, doc.createdAt, doc.lastUpdatedAt);
  }

  /**
   * Load a feature list from a workspace file.
   * Returns null if the file does not exist or contains invalid JSON.
   */
  static async load(workspace: string, filePath: string): Promise<FeatureList | null> {
    const fullPath = path.join(workspace, filePath);
    try {
      const raw = await fs.readFile(fullPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      const doc = validateFeatureListDocument(parsed);
      return FeatureList.fromDocument(doc);
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // MUTATIONS (return new instances)
  // ==========================================================================

  /**
   * Mark a feature as passing. Returns a new FeatureList instance.
   * Throws if the feature ID does not exist.
   */
  markPassing(featureId: string): FeatureList {
    const idx = this._features.findIndex((f) => f.id === featureId);
    if (idx === -1) {
      throw new Error(`Feature not found: "${featureId}"`);
    }

    const updated = this._features.map((f) => (f.id === featureId ? { ...f, passes: true } : f));

    return new FeatureList(updated, this._createdAt, new Date().toISOString());
  }

  /**
   * Add a feature. Only allowed in initializer mode.
   * Throws if called in coder mode.
   */
  addFeature(feature: Feature, mode: SessionMode): FeatureList {
    if (mode === "coder") {
      throw new Error(
        "Cannot add features in coder mode. Features can only be added during initialization.",
      );
    }

    const updated = [...this._features, feature];
    return new FeatureList(updated, this._createdAt, new Date().toISOString());
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Persist the feature list to disk as JSON.
   */
  async save(workspace: string, filePath: string): Promise<void> {
    const fullPath = path.join(workspace, filePath);
    const doc = this.toDocument();
    await fs.writeFile(fullPath, JSON.stringify(doc, null, 2), "utf-8");
  }

  // ==========================================================================
  // VALIDATION
  // ==========================================================================

  /**
   * Validate that changes from `previous` to `this` only mark features as passing.
   * Throws on immutability violations.
   */
  validateAgainst(previous: FeatureList): void {
    const prevFeatures = previous._features;
    const nextFeatures = this._features;

    // Check that all previous features still exist
    if (nextFeatures.length < prevFeatures.length) {
      throw new Error("Feature immutability violation: features were removed");
    }

    for (let i = 0; i < prevFeatures.length; i++) {
      const prev = prevFeatures[i];
      const next = nextFeatures[i];

      if (!prev) {
        break;
      }

      if (!next) {
        throw new Error(`Feature immutability violation: feature at index ${i} was removed`);
      }

      // ID must match (order preserved)
      if (prev.id !== next.id) {
        throw new Error(
          `Feature immutability violation: feature at index ${i} changed id from "${prev.id}" to "${next.id}"`,
        );
      }

      // Immutable fields
      if (prev.category !== next.category) {
        throw new Error(`Feature immutability violation: feature "${prev.id}" category changed`);
      }
      if (prev.description !== next.description) {
        throw new Error(`Feature immutability violation: feature "${prev.id}" description changed`);
      }
      if (prev.priority !== next.priority) {
        throw new Error(`Feature immutability violation: feature "${prev.id}" priority changed`);
      }

      // Steps must be identical
      if (prev.steps.length !== next.steps.length) {
        throw new Error(`Feature immutability violation: feature "${prev.id}" steps changed`);
      }
      for (let j = 0; j < prev.steps.length; j++) {
        if (prev.steps[j] !== next.steps[j]) {
          throw new Error(`Feature immutability violation: feature "${prev.id}" steps changed`);
        }
      }

      // passes can only go false → true, never true → false
      if (prev.passes && !next.passes) {
        throw new Error(
          `Feature immutability violation: feature "${prev.id}" passes reverted from true to false`,
        );
      }
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get features(): readonly Feature[] {
    return this._features;
  }

  get summary(): { total: number; completed: number; percentage: number } {
    const total = this._features.length;
    const completed = this._features.filter((f) => f.passes).length;
    const percentage = total === 0 ? 0 : (completed / total) * 100;
    return { total, completed, percentage };
  }

  /**
   * Get the next N incomplete features (ordered by priority).
   */
  nextIncomplete(count: number): readonly Feature[] {
    return this._features.filter((f) => !f.passes).slice(0, count);
  }

  /**
   * Convert to a plain document for serialization.
   */
  toDocument(): FeatureListDocument {
    return {
      features: this._features,
      createdAt: this._createdAt,
      lastUpdatedAt: this._lastUpdatedAt,
    };
  }
}
