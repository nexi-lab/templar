import type { EvidenceCollectorConfig, EvidenceRecord, EvidenceReport } from "./types.js";

const DEFAULT_MAX_RECORDS = 10_000;

/**
 * Collects evidence records from guard validations.
 * Uses immutable append pattern for all state mutations.
 */
export class EvidenceCollector {
  private records: readonly EvidenceRecord[] = [];
  private readonly maxRecords: number;

  constructor(config?: EvidenceCollectorConfig) {
    this.maxRecords = config?.maxRecords ?? DEFAULT_MAX_RECORDS;
  }

  record(entry: EvidenceRecord): void {
    if (this.records.length >= this.maxRecords) {
      // Drop oldest records to maintain cap
      this.records = [...this.records.slice(1), entry];
    } else {
      this.records = [...this.records, entry];
    }
  }

  report(sessionId: string): EvidenceReport {
    const filtered = this.records.filter((r) => r.sessionId === sessionId);

    const byGuard: Record<string, number> = {};
    const byField: Record<string, number> = {};

    for (const rec of filtered) {
      byGuard[rec.guard] = (byGuard[rec.guard] ?? 0) + 1;
      byField[rec.field] = (byField[rec.field] ?? 0) + 1;
    }

    return {
      sessionId,
      totalRecords: filtered.length,
      byGuard,
      byField,
      generatedAt: Date.now(),
    };
  }

  getRecords(): readonly EvidenceRecord[] {
    return this.records;
  }

  reset(): void {
    this.records = [];
  }
}
