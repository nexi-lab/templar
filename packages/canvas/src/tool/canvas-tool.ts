/**
 * Canvas tool handler — create/update/delete visual artifacts.
 *
 * Immutable state via ReadonlyMap. Emits AG-UI CustomEvents via
 * the provided `emit` callback on every mutation.
 */

import { randomUUID } from "node:crypto";
import { CanvasActionSchema } from "../schemas.js";
import type {
  CanvasArtifact,
  CanvasArtifactContent,
  CanvasCreateAction,
  CanvasDeleteAction,
  CanvasEventPayload,
  CanvasToolResult,
  CanvasUpdateAction,
  ResolvedCanvasConfig,
} from "../types.js";
import { DEFAULT_CANVAS_CONFIG } from "../types.js";

export interface CanvasToolDeps {
  readonly config?: Partial<ResolvedCanvasConfig> | undefined;
  readonly emit: (event: CanvasEventPayload) => void;
  readonly clock?: { now(): number } | undefined;
}

export class CanvasTool {
  readonly name = "canvas" as const;
  private artifacts: ReadonlyMap<string, CanvasArtifact> = new Map();

  private readonly config: ResolvedCanvasConfig;
  private readonly emit: (event: CanvasEventPayload) => void;
  private readonly clock: { now(): number };

  constructor(deps: CanvasToolDeps) {
    this.config = {
      maxArtifacts: deps.config?.maxArtifacts ?? DEFAULT_CANVAS_CONFIG.maxArtifacts,
      maxContentSize: deps.config?.maxContentSize ?? DEFAULT_CANVAS_CONFIG.maxContentSize,
      allowedTypes: deps.config?.allowedTypes ?? DEFAULT_CANVAS_CONFIG.allowedTypes,
    };
    this.emit = deps.emit;
    this.clock = deps.clock ?? { now: () => Date.now() };
  }

  async execute(input: unknown): Promise<CanvasToolResult> {
    const parsed = CanvasActionSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.message}` };
    }

    switch (parsed.data.action) {
      case "create":
        return this.handleCreate(parsed.data);
      case "update":
        return this.handleUpdate(parsed.data);
      case "delete":
        return this.handleDelete(parsed.data);
    }
  }

  getArtifacts(): ReadonlyMap<string, CanvasArtifact> {
    return this.artifacts;
  }

  private handleCreate(action: CanvasCreateAction): CanvasToolResult {
    // Check artifact limit
    if (this.artifacts.size >= this.config.maxArtifacts) {
      return {
        success: false,
        error: `Artifact limit exceeded: maximum ${this.config.maxArtifacts} artifacts`,
      };
    }

    // Check content size
    if (action.content.length > this.config.maxContentSize) {
      return {
        success: false,
        error: `Content too large: ${action.content.length} characters exceeds ${this.config.maxContentSize} limit`,
      };
    }

    // Check allowed type
    if (!this.config.allowedTypes.includes(action.type)) {
      return {
        success: false,
        error: `Type "${action.type}" is not allowed. Allowed: ${this.config.allowedTypes.join(", ")}`,
      };
    }

    const id = randomUUID();
    const now = new Date(this.clock.now()).toISOString();
    const artifactContent = this.buildContent(action.type, action.content, action.title);
    const artifact: CanvasArtifact = {
      id,
      content: artifactContent,
      title: action.title,
      createdAt: now,
      updatedAt: now,
    };

    // Immutable update
    const next = new Map(this.artifacts);
    next.set(id, artifact);
    this.artifacts = next;

    this.emit({ event: "create", artifact });

    return { success: true, id };
  }

  private handleUpdate(action: CanvasUpdateAction): CanvasToolResult {
    const existing = this.artifacts.get(action.id);
    if (!existing) {
      return { success: false, error: `Artifact not found: ${action.id}` };
    }

    // Check content size
    if (action.content.length > this.config.maxContentSize) {
      return {
        success: false,
        error: `Content too large: ${action.content.length} characters exceeds ${this.config.maxContentSize} limit`,
      };
    }

    const now = new Date(this.clock.now()).toISOString();
    const existingTitle = existing.content.type === "html" ? existing.content.title : undefined;
    const updatedContent = this.buildContent(
      existing.content.type,
      action.content,
      action.title ?? existingTitle,
    );
    const updated: CanvasArtifact = {
      ...existing,
      content: updatedContent,
      title: action.title ?? existing.title,
      updatedAt: now,
    };

    // Immutable update
    const next = new Map(this.artifacts);
    next.set(action.id, updated);
    this.artifacts = next;

    this.emit({ event: "update", id: action.id, content: updatedContent, updatedAt: now });

    return { success: true, id: action.id };
  }

  private handleDelete(action: CanvasDeleteAction): CanvasToolResult {
    if (!this.artifacts.has(action.id)) {
      return { success: false, error: `Artifact not found: ${action.id}` };
    }

    // Immutable update
    const next = new Map(this.artifacts);
    next.delete(action.id);
    this.artifacts = next;

    this.emit({ event: "delete", id: action.id });

    return { success: true, id: action.id };
  }

  private buildContent(
    type: CanvasArtifactContent["type"],
    content: string,
    title?: string | undefined,
  ): CanvasArtifactContent {
    switch (type) {
      case "mermaid":
        return { type: "mermaid", content };
      case "html":
        return { type: "html", content, ...(title !== undefined ? { title } : {}) };
      case "markdown":
        return { type: "markdown", content };
    }
  }
}
