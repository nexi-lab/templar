import { TemplarError } from "../base.js";
import {
  type CodesForBase,
  ERROR_CATALOG,
  type ErrorDomain,
  type GrpcStatusCode,
  type HttpStatusCode,
} from "../catalog.js";
import type { TemplarErrorOptions } from "../types.js";

type NotFoundCode = CodesForBase<"NotFoundError">;

/**
 * Errors when a requested resource does not exist.
 * HTTP 404/410. The `.code` field discriminates the specific error.
 */
export class NotFoundError<C extends NotFoundCode = "RESOURCE_NOT_FOUND"> extends TemplarError {
  readonly _tag = "NotFoundError" as const;
  override readonly code: C;
  override readonly httpStatus: HttpStatusCode;
  override readonly grpcCode: GrpcStatusCode;
  override readonly domain: ErrorDomain;
  override readonly isExpected: boolean;

  constructor(options: TemplarErrorOptions<C>);
  constructor(
    resourceType: string,
    resourceId: string,
    metadata?: Record<string, string>,
    traceId?: string,
  );
  constructor(
    resourceTypeOrOptions: string | TemplarErrorOptions<C>,
    resourceId?: string,
    metadata?: Record<string, string>,
    traceId?: string,
  ) {
    if (typeof resourceTypeOrOptions === "string") {
      super(`${resourceTypeOrOptions} with ID '${resourceId}' not found`, metadata, traceId);
      const code = "RESOURCE_NOT_FOUND" as C;
      const entry = ERROR_CATALOG[code];
      this.code = code;
      this.httpStatus = entry.httpStatus as HttpStatusCode;
      this.grpcCode = entry.grpcCode as GrpcStatusCode;
      this.domain = entry.domain as ErrorDomain;
      this.isExpected = entry.isExpected;
    } else {
      const opts = resourceTypeOrOptions;
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
