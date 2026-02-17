/**
 * CI governance gate: validates all templar.yaml template files in the repo
 * against manifest governance rules. This test fails if any template
 * contains non-declarative constructs (conditionals, loops, templates, code).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateManifestGovernance } from "../../governance.js";

const MANIFEST_FILENAME = "templar.yaml";

/** Recursively find all templar.yaml files under a directory */
function findManifests(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") {
        continue;
      }
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findManifests(fullPath));
      } else if (entry.name === MANIFEST_FILENAME) {
        results.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }
  return results;
}

// Resolve repo root from packages/manifest/src/__tests__/integration/
const repoRoot = resolve(import.meta.dirname, "..", "..", "..", "..", "..");
const manifests = findManifests(repoRoot);

describe("manifest governance — CI gate", () => {
  it("finds at least one templar.yaml in the repo", () => {
    expect(manifests.length).toBeGreaterThan(0);
  });

  for (const manifestPath of manifests) {
    const rel = relative(repoRoot, manifestPath);

    it(`${rel} passes governance checks`, () => {
      const content = readFileSync(manifestPath, "utf-8");
      const violations = validateManifestGovernance(content);
      if (violations.length > 0) {
        const details = violations
          .map((v) => `  [${v.rule}]${v.line ? ` line ${v.line}` : ""}: ${v.snippet}`)
          .join("\n");
        expect.fail(`Governance violations in ${rel}:\n${details}`);
      }
    });
  }
});
