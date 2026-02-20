/**
 * Type definitions for @templar/canvas — A2UI Visual Workspace (#90)
 *
 * All types are readonly/immutable. Discriminated unions on `type`, `action`,
 * and `event` fields enable exhaustive pattern matching.
 */

// ============================================================================
// Artifact content types (extensible discriminated union on `type`)
// ============================================================================

export interface MermaidArtifact {
  readonly type: "mermaid";
  readonly content: string;
}

export interface HtmlArtifact {
  readonly type: "html";
  readonly content: string;
  readonly title?: string | undefined;
}

export interface MarkdownArtifact {
  readonly type: "markdown";
  readonly content: string;
}

export type CanvasArtifactContent = MermaidArtifact | HtmlArtifact | MarkdownArtifact;

export type CanvasArtifactType = CanvasArtifactContent["type"];

// ============================================================================
// Full artifact with metadata
// ============================================================================

export interface CanvasArtifact {
  readonly id: string;
  readonly content: CanvasArtifactContent;
  readonly title?: string | undefined;
  readonly createdAt: string; // ISO-8601
  readonly updatedAt: string; // ISO-8601
}

// ============================================================================
// Tool input types (action discriminant)
// ============================================================================

export interface CanvasCreateAction {
  readonly action: "create";
  readonly type: CanvasArtifactType;
  readonly content: string;
  readonly title?: string | undefined;
}

export interface CanvasUpdateAction {
  readonly action: "update";
  readonly id: string;
  readonly content: string;
  readonly title?: string | undefined;
}

export interface CanvasDeleteAction {
  readonly action: "delete";
  readonly id: string;
}

export type CanvasAction = CanvasCreateAction | CanvasUpdateAction | CanvasDeleteAction;

// ============================================================================
// Tool output type
// ============================================================================

export interface CanvasToolResult {
  readonly success: boolean;
  readonly id?: string | undefined;
  readonly error?: string | undefined;
}

// ============================================================================
// Canvas event payloads (sent via AG-UI CustomEvent)
// ============================================================================

export interface CanvasCreateEvent {
  readonly event: "create";
  readonly artifact: CanvasArtifact;
}

export interface CanvasUpdateEvent {
  readonly event: "update";
  readonly id: string;
  readonly content: CanvasArtifactContent;
  readonly updatedAt: string;
}

export interface CanvasDeleteEvent {
  readonly event: "delete";
  readonly id: string;
}

export type CanvasEventPayload = CanvasCreateEvent | CanvasUpdateEvent | CanvasDeleteEvent;

// ============================================================================
// postMessage bridge types (iframe <-> parent)
// ============================================================================

export interface CanvasResizeMessage {
  readonly type: "resize";
  readonly height: number;
}

export interface CanvasActionMessage {
  readonly type: "action";
  readonly action: string;
  readonly payload?: unknown;
}

export interface CanvasErrorMessage {
  readonly type: "error";
  readonly message: string;
}

export interface CanvasReadyMessage {
  readonly type: "ready";
}

export type CanvasBridgeMessage =
  | CanvasResizeMessage
  | CanvasActionMessage
  | CanvasErrorMessage
  | CanvasReadyMessage;

// ============================================================================
// Canvas tool configuration
// ============================================================================

export interface CanvasConfig {
  readonly maxArtifacts?: number | undefined; // Default: 20
  readonly maxContentSize?: number | undefined; // Default: 1_048_576 (1MB)
  readonly allowedTypes?: readonly CanvasArtifactType[] | undefined;
}

export interface ResolvedCanvasConfig {
  readonly maxArtifacts: number;
  readonly maxContentSize: number;
  readonly allowedTypes: readonly CanvasArtifactType[];
}

export const DEFAULT_CANVAS_CONFIG: ResolvedCanvasConfig = {
  maxArtifacts: 20,
  maxContentSize: 1_048_576,
  allowedTypes: ["mermaid", "html", "markdown"],
};
