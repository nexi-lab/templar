export interface EvidenceRecord {
  readonly sessionId: string;
  readonly turnNumber: number;
  readonly guard: string;
  readonly field: string;
  readonly value: unknown;
  readonly timestamp: number;
}

export interface EvidenceReport {
  readonly sessionId: string;
  readonly totalRecords: number;
  readonly byGuard: Readonly<Record<string, number>>;
  readonly byField: Readonly<Record<string, number>>;
  readonly generatedAt: number;
}

export interface EvidenceCollectorConfig {
  readonly maxRecords?: number;
}
