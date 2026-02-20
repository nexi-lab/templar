import type { DoctorReport } from "../types.js";
import type { DoctorReporter } from "./types.js";

// ---------------------------------------------------------------------------
// JSON reporter
// ---------------------------------------------------------------------------

/**
 * Renders the full report as formatted JSON.
 */
export class JsonReporter implements DoctorReporter {
  readonly name = "json";

  report(result: DoctorReport): string {
    // Serialize with error objects converted to plain objects
    const serializable = {
      ...result,
      checkResults: result.checkResults.map((cr) => ({
        ...cr,
        ...(cr.error ? { error: { message: cr.error.message, name: cr.error.name } } : {}),
      })),
    };
    return JSON.stringify(serializable, null, 2);
  }
}
