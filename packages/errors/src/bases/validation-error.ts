import { ERROR_CATALOG, type CodesForBase, type ErrorDomain, type GrpcStatusCode, type HttpStatusCode } from "../catalog.js";
import { TemplarError } from "../base.js";
import type { TemplarErrorOptions, ValidationIssue } from "../types.js";

type ValidationCode = CodesForBase<"ValidationError">;

/**
 * Errors caused by invalid input, configuration, or request data.
 * HTTP 400-class. The `.code` field discriminates the specific error.
 */
export class ValidationError<
  C extends ValidationCode = "VALIDATION_FAILED",
> extends TemplarError {
  readonly _tag = "ValidationError" as const;
  override readonly code: C;
  override readonly httpStatus: HttpStatusCode;
  override readonly grpcCode: GrpcStatusCode;
  override readonly domain: ErrorDomain;
  override readonly isExpected: boolean;

  /** Structured validation issues (populated for VALIDATION_FAILED) */
  readonly issues: readonly ValidationIssue[];

  constructor(options: TemplarErrorOptions<C> & { issues?: readonly ValidationIssue[] });
  constructor(
    message: string,
    issues?: readonly ValidationIssue[],
    metadata?: Record<string, string>,
    traceId?: string,
  );
  constructor(
    messageOrOptions:
      | string
      | (TemplarErrorOptions<C> & { issues?: readonly ValidationIssue[] }),
    issues?: readonly ValidationIssue[],
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    if (typeof messageOrOptions === "string") {
      super(messageOrOptions, metadata, traceId);
      const code = "VALIDATION_FAILED" as C;
      const entry = ERROR_CATALOG[code];
      this.code = code;
      this.httpStatus = entry.httpStatus as HttpStatusCode;
      this.grpcCode = entry.grpcCode as GrpcStatusCode;
      this.domain = entry.domain as ErrorDomain;
      this.isExpected = entry.isExpected;
      this.issues = issues ?? [];
    } else {
      const opts = messageOrOptions;
      super(
        opts.message,
        opts.metadata,
        opts.traceId,
        ...(opts.cause ? [{ cause: opts.cause }] : []),
      );
      const entry = ERROR_CATALOG[opts.code];
      this.code = opts.code;
      this.httpStatus = entry.httpStatus as HttpStatusCode;
      this.grpcCode = entry.grpcCode as GrpcStatusCode;
      this.domain = entry.domain as ErrorDomain;
      this.isExpected = entry.isExpected;
      this.issues = opts.issues ?? [];
    }
  }
}
