/**
 * @templar/canvas — A2UI Visual Workspace (#90)
 *
 * Provides a canvas tool for agents to create/update/delete visual artifacts
 * (Mermaid diagrams, HTML, Markdown) and emit AG-UI CustomEvents for
 * streaming to web frontends.
 */

// Events
export {
  CANVAS_EVENT_NAME,
  type CanvasCustomEvent,
  createCanvasCustomEvent,
} from "./events/index.js";
// Schemas
export {
  CanvasActionSchema,
  CanvasArtifactContentSchema,
  CanvasBridgeMessageSchema,
  CanvasConfigSchema,
} from "./schemas.js";
// Tool
export { CanvasTool, type CanvasToolDeps } from "./tool/index.js";
// Types
export type {
  CanvasAction,
  CanvasActionMessage,
  CanvasArtifact,
  CanvasArtifactContent,
  CanvasArtifactType,
  CanvasBridgeMessage,
  CanvasConfig,
  CanvasCreateAction,
  CanvasCreateEvent,
  CanvasDeleteAction,
  CanvasDeleteEvent,
  CanvasErrorMessage,
  CanvasEventPayload,
  CanvasReadyMessage,
  CanvasResizeMessage,
  CanvasToolResult,
  CanvasUpdateAction,
  CanvasUpdateEvent,
  HtmlArtifact,
  MarkdownArtifact,
  MermaidArtifact,
  ResolvedCanvasConfig,
} from "./types.js";
export { DEFAULT_CANVAS_CONFIG } from "./types.js";

export const PACKAGE_NAME = "@templar/canvas";
