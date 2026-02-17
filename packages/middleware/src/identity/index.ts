export { resolveChannelIdentity, resolveIdentity } from "./resolver.js";
export {
  ChannelIdentityConfigSchema,
  IdentityConfigSchema,
  type ValidatedChannelIdentityConfig,
  type ValidatedIdentityConfig,
} from "./schema.js";
export {
  IdentityConfigWatcher,
  type IdentityConfigWatcherDeps,
  type IdentityErrorHandler,
  type IdentityUpdatedHandler,
} from "./watcher.js";
