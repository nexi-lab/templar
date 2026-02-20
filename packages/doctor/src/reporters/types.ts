import type { DoctorReport } from "../types.js";

/**
 * Reporter interface for formatting doctor audit reports.
 */
export interface DoctorReporter {
  readonly name: string;
  report(result: DoctorReport): string;
}
