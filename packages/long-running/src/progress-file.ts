import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProgressDocument, ProgressEntry, ResolvedLongRunningConfig } from "./types.js";
import { validateProgressDocument } from "./validation.js";

type ProgressConfig = Pick<
  ResolvedLongRunningConfig,
  "progressFilePath" | "progressArchivePath" | "progressWindowSize"
>;

/**
 * Immutable progress file with rolling window support.
 *
 * Keeps the last N entries in the active file and archives older entries.
 */
export class ProgressFile {
  private readonly _entries: readonly ProgressEntry[];

  private constructor(entries: readonly ProgressEntry[]) {
    this._entries = entries;
  }

  // ==========================================================================
  // FACTORIES
  // ==========================================================================

  /**
   * Create an empty progress file.
   */
  static empty(): ProgressFile {
    return new ProgressFile([]);
  }

  /**
   * Create a ProgressFile from pre-loaded entries.
   */
  static fromEntries(entries: readonly ProgressEntry[]): ProgressFile {
    return new ProgressFile(entries);
  }

  /**
   * Load progress from workspace. Returns empty if file missing/corrupted.
   */
  static async load(workspace: string, config: ProgressConfig): Promise<ProgressFile> {
    const fullPath = path.join(workspace, config.progressFilePath);
    try {
      const raw = await fs.readFile(fullPath, "utf-8");
      const parsed = JSON.parse(raw) as unknown;
      const doc = validateProgressDocument(parsed);
      return new ProgressFile(doc.entries);
    } catch {
      return ProgressFile.empty();
    }
  }

  // ==========================================================================
  // MUTATIONS (return new instances)
  // ==========================================================================

  /**
   * Append a new entry. Returns a new ProgressFile instance.
   */
  append(entry: ProgressEntry): ProgressFile {
    return new ProgressFile([...this._entries, entry]);
  }

  // ==========================================================================
  // PERSISTENCE
  // ==========================================================================

  /**
   * Persist to disk. Applies rolling window and archives overflow entries.
   */
  async save(workspace: string, config: ProgressConfig): Promise<void> {
    const windowSize = config.progressWindowSize;
    const allEntries = this._entries;

    if (allEntries.length > windowSize) {
      // Split into archive and active
      const archiveEntries = allEntries.slice(0, allEntries.length - windowSize);
      const activeEntries = allEntries.slice(allEntries.length - windowSize);

      // Append to existing archive
      const archivePath = path.join(workspace, config.progressArchivePath);
      let existingArchive: readonly ProgressEntry[] = [];
      try {
        const raw = await fs.readFile(archivePath, "utf-8");
        const doc = JSON.parse(raw) as ProgressDocument;
        if (doc.entries && Array.isArray(doc.entries)) {
          existingArchive = doc.entries;
        }
      } catch {
        // No existing archive
      }

      const mergedArchive: ProgressDocument = {
        entries: [...existingArchive, ...archiveEntries],
      };
      await fs.writeFile(archivePath, JSON.stringify(mergedArchive, null, 2), "utf-8");

      // Write active entries
      const activeDoc: ProgressDocument = { entries: activeEntries };
      const activePath = path.join(workspace, config.progressFilePath);
      await fs.writeFile(activePath, JSON.stringify(activeDoc, null, 2), "utf-8");
    } else {
      // All entries fit in active file
      const doc: ProgressDocument = { entries: allEntries };
      const fullPath = path.join(workspace, config.progressFilePath);
      await fs.writeFile(fullPath, JSON.stringify(doc, null, 2), "utf-8");
    }
  }

  // ==========================================================================
  // GETTERS
  // ==========================================================================

  get entries(): readonly ProgressEntry[] {
    return this._entries;
  }

  get latestSession(): ProgressEntry | null {
    return this._entries.length > 0 ? (this._entries[this._entries.length - 1] ?? null) : null;
  }

  get sessionCount(): number {
    return this._entries.length;
  }
}
