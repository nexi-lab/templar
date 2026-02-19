/**
 * @templar/web-search — Pluggable Search Provider Interface
 *
 * Public API surface.
 */

// Middleware
export {
  createWebSearchMiddleware,
  WebSearchMiddleware,
} from "./middleware.js";
// Providers
export {
  createBraveProvider,
  createSearchProvider,
  createSerperProvider,
  createTavilyProvider,
} from "./providers/index.js";
// Router
export { WebSearchRouter } from "./router.js";
// Types
export type {
  SearchOptions,
  SearchProviderConfig,
  SearchResult,
  WebSearchMiddlewareConfig,
  WebSearchProvider,
  WebSearchRouterConfig,
} from "./types.js";
export {
  DEFAULT_MAX_RESULTS,
  DEFAULT_MAX_SNIPPET_LENGTH,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_TOOL_NAME,
} from "./types.js";
// Utilities
export { truncateSnippet } from "./utils.js";
// Validation schemas
export {
  SearchOptionsSchema,
  SearchProviderConfigSchema,
  validateQuery,
  WebSearchMiddlewareConfigSchema,
  WebSearchRouterConfigSchema,
} from "./validation.js";
