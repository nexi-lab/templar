/**
 * Zod runtime validation schemas for @templar/canvas.
 *
 * Validates tool inputs, artifact content, configuration, and
 * postMessage bridge payloads.
 */

import { z } from "zod";

// ============================================================================
// Artifact content schema (discriminated on `type`)
// ============================================================================

export const MermaidArtifactSchema = z.object({
  type: z.literal("mermaid"),
  content: z.string().min(1),
});

export const HtmlArtifactSchema = z.object({
  type: z.literal("html"),
  content: z.string().min(1),
  title: z.string().optional(),
});

export const MarkdownArtifactSchema = z.object({
  type: z.literal("markdown"),
  content: z.string().min(1),
});

export const CanvasArtifactContentSchema = z.discriminatedUnion("type", [
  MermaidArtifactSchema,
  HtmlArtifactSchema,
  MarkdownArtifactSchema,
]);

// ============================================================================
// Tool action schemas (discriminated on `action`)
// ============================================================================

const CanvasCreateActionSchema = z.object({
  action: z.literal("create"),
  type: z.enum(["mermaid", "html", "markdown"]),
  content: z.string().min(1),
  title: z.string().optional(),
});

const CanvasUpdateActionSchema = z.object({
  action: z.literal("update"),
  id: z.string().min(1),
  content: z.string().min(1),
  title: z.string().optional(),
});

const CanvasDeleteActionSchema = z.object({
  action: z.literal("delete"),
  id: z.string().min(1),
});

export const CanvasActionSchema = z.discriminatedUnion("action", [
  CanvasCreateActionSchema,
  CanvasUpdateActionSchema,
  CanvasDeleteActionSchema,
]);

// ============================================================================
// Configuration schema
// ============================================================================

export const CanvasConfigSchema = z.object({
  maxArtifacts: z.number().int().positive().optional(),
  maxContentSize: z.number().int().positive().optional(),
  allowedTypes: z
    .array(z.enum(["mermaid", "html", "markdown"]))
    .nonempty()
    .optional(),
});

// ============================================================================
// postMessage bridge schemas (client-side validation)
// ============================================================================

const CanvasResizeMessageSchema = z.object({
  type: z.literal("resize"),
  height: z.number().positive(),
});

const CanvasActionMessageSchema = z.object({
  type: z.literal("action"),
  action: z.string().min(1),
  payload: z.unknown().optional(),
});

const CanvasErrorMessageSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
});

const CanvasReadyMessageSchema = z.object({
  type: z.literal("ready"),
});

export const CanvasBridgeMessageSchema = z.discriminatedUnion("type", [
  CanvasResizeMessageSchema,
  CanvasActionMessageSchema,
  CanvasErrorMessageSchema,
  CanvasReadyMessageSchema,
]);
