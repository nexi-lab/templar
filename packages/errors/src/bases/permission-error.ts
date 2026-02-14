import { ERROR_CATALOG, type CodesForBase, type ErrorDomain, type GrpcStatusCode, type HttpStatusCode } from "../catalog.js";
import { TemplarError } from "../base.js";
import type { TemplarErrorOptions } from "../types.js";

type PermissionCode = CodesForBase<"PermissionError">;

/**
 * Errors related to authentication and authorization failures.
 * HTTP 401/403. The `.code` field discriminates the specific error.
 */
export class PermissionError<
  C extends PermissionCode = "PERMISSION_DENIED",
> extends TemplarError {
  readonly _tag = "PermissionError" as const;
  override readonly code: C;
  override readonly httpStatus: HttpStatusCode;
  override readonly grpcCode: GrpcStatusCode;
  override readonly domain: ErrorDomain;
  override readonly isExpected: boolean;

  constructor(options: TemplarErrorOptions<C>);
  constructor(message: string, metadata?: Record<string, string>, traceId?: string);
  constructor(
    messageOrOptions: string | TemplarErrorOptions<C>,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    if (typeof messageOrOptions === "string") {
      super(messageOrOptions, metadata, traceId);
      const code = "PERMISSION_DENIED" as C;
      const entry = ERROR_CATALOG[code];
      this.code = code;
      this.httpStatus = entry.httpStatus as HttpStatusCode;
      this.grpcCode = entry.grpcCode as GrpcStatusCode;
      this.domain = entry.domain as ErrorDomain;
      this.isExpected = entry.isExpected;
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
    }
  }
}
