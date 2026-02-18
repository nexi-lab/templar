import { ReportBuilder } from "./report-builder.js";
import type {
  Phase,
  PhaseResult,
  SelfTestReport,
  Verifier,
  VerifierContext,
  VerifierResult,
} from "./types.js";

const PHASES: readonly Phase[] = ["preflight", "smoke", "verification"];

function makeSkippedPhase(): PhaseResult {
  return { status: "skipped", durationMs: 0, verifierResults: [] };
}

async function runVerifier(verifier: Verifier, context: VerifierContext): Promise<VerifierResult> {
  try {
    if (verifier.setup) {
      await verifier.setup(context);
    }
    return await verifier.run(context);
  } catch (err) {
    return {
      verifierName: verifier.name,
      phase: verifier.phase,
      status: "error",
      durationMs: 0,
      assertions: [],
      screenshots: [],
      error: err instanceof Error ? err : new Error(String(err)),
    };
  } finally {
    if (verifier.teardown) {
      try {
        await verifier.teardown(context);
      } catch {
        // Teardown errors are swallowed to avoid masking the real error
      }
    }
  }
}

async function runPhaseSequential(
  verifiers: readonly Verifier[],
  context: VerifierContext,
): Promise<PhaseResult> {
  if (verifiers.length === 0) {
    return makeSkippedPhase();
  }

  const start = Date.now();
  const results: VerifierResult[] = [];

  for (const verifier of verifiers) {
    if (context.abortSignal?.aborted) {
      results.push({
        verifierName: verifier.name,
        phase: verifier.phase,
        status: "skipped",
        durationMs: 0,
        assertions: [],
        screenshots: [],
      });
      continue;
    }

    const result = await runVerifier(verifier, context);
    results.push(result);

    // Sequential phases: stop on first failure/error
    if (result.status === "failed" || result.status === "error") {
      return {
        status: "failed",
        durationMs: Date.now() - start,
        verifierResults: results,
      };
    }
  }

  return {
    status: "passed",
    durationMs: Date.now() - start,
    verifierResults: results,
  };
}

async function runPhaseParallel(
  verifiers: readonly Verifier[],
  context: VerifierContext,
): Promise<PhaseResult> {
  if (verifiers.length === 0) {
    return makeSkippedPhase();
  }

  const start = Date.now();
  const settled = await Promise.allSettled(verifiers.map((v) => runVerifier(v, context)));

  const results: VerifierResult[] = settled.map((s, i) => {
    if (s.status === "fulfilled") {
      return s.value;
    }
    const verifier = verifiers[i]!;
    return {
      verifierName: verifier.name,
      phase: verifier.phase,
      status: "error" as const,
      durationMs: 0,
      assertions: [],
      screenshots: [],
      error: s.reason instanceof Error ? s.reason : new Error(String(s.reason)),
    };
  });

  const anyFailed = results.some((r) => r.status === "failed" || r.status === "error");

  return {
    status: anyFailed ? "failed" : "passed",
    durationMs: Date.now() - start,
    verifierResults: results,
  };
}

/**
 * SelfTestRunner — phased pipeline orchestrator.
 *
 * Executes verifiers in three phases:
 * 1. preflight (health checks) — sequential, gate
 * 2. smoke (critical path) — sequential, gate
 * 3. verification (api + browser) — parallel, collect all
 *
 * If preflight fails, smoke + verification are skipped.
 * If smoke fails, verification is skipped.
 */
export class SelfTestRunner {
  private readonly verifiers: Map<Phase, Verifier[]>;
  private lastReport: SelfTestReport | null = null;

  constructor() {
    this.verifiers = new Map<Phase, Verifier[]>();
    for (const phase of PHASES) {
      this.verifiers.set(phase, []);
    }
  }

  /**
   * Add a verifier to the pipeline.
   * Returns a new SelfTestRunner instance (immutable/fluent).
   */
  addVerifier(verifier: Verifier): SelfTestRunner {
    const next = new SelfTestRunner();
    for (const [phase, list] of this.verifiers) {
      next.verifiers.set(phase, [...list]);
    }
    const phaseList = next.verifiers.get(verifier.phase);
    if (phaseList) {
      phaseList.push(verifier);
    }
    return next;
  }

  /**
   * Run the full phased pipeline.
   */
  async run(context: VerifierContext): Promise<SelfTestReport> {
    const startTime = Date.now();

    // Phase 1: preflight (sequential, gate)
    const preflight = await runPhaseSequential(this.verifiers.get("preflight") ?? [], context);

    // If preflight fails, skip remaining
    if (preflight.status === "failed") {
      const report = ReportBuilder.build(
        preflight,
        makeSkippedPhase(),
        makeSkippedPhase(),
        startTime,
      );
      this.lastReport = report;
      return report;
    }

    // Phase 2: smoke (sequential, gate)
    const smoke = await runPhaseSequential(this.verifiers.get("smoke") ?? [], context);

    // If smoke fails, skip verification
    if (smoke.status === "failed") {
      const report = ReportBuilder.build(preflight, smoke, makeSkippedPhase(), startTime);
      this.lastReport = report;
      return report;
    }

    // Phase 3: verification (parallel, collect all)
    const verification = await runPhaseParallel(this.verifiers.get("verification") ?? [], context);

    const report = ReportBuilder.build(preflight, smoke, verification, startTime);
    this.lastReport = report;
    return report;
  }

  /**
   * Get the report from the last run.
   */
  getLastReport(): SelfTestReport | null {
    return this.lastReport;
  }
}
