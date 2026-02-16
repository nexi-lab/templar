// Base adapter
export type { BaseChannelAdapterOptions } from "./base-adapter.js";
export { BaseChannelAdapter } from "./base-adapter.js";
// Block type mapping
export { BLOCK_TYPE_TO_CAPABILITY } from "./block-type-map.js";
// Block utilities (from @templar/core split)
export { coalesceBlocks, splitText } from "./block-utils.js";
// Capability guard
export { CapabilityGuard } from "./capability-guard.js";
// Channel registry
export { type ChannelLoadOptions, ChannelRegistry } from "./channel-registry.js";
// Config hashing
export { hashConfig } from "./config-hash.js";
// Config parsing
export { parseChannelConfig } from "./config-parser.js";
// Lazy loading
export { lazyLoad } from "./lazy-load.js";
// Type guards
export { isChannelAdapter, isChannelCapabilities } from "./type-guards.js";
