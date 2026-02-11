/**
 * Input validation schemas for AG-UI requests.
 *
 * Uses Zod for runtime validation of RunAgentInput payloads.
 */

import { z } from "zod";

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum(["developer", "system", "assistant", "user", "tool", "activity", "reasoning"]),
  content: z.union([z.string(), z.array(z.unknown())]).optional(),
  name: z.string().optional(),
  toolCalls: z.array(z.unknown()).optional(),
  toolCallId: z.string().optional(),
});

const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  parameters: z.unknown(),
});

const ContextSchema = z.object({
  description: z.string(),
  value: z.string(),
});

export const RunAgentInputSchema = z.object({
  threadId: z.string().min(1),
  runId: z.string().min(1),
  messages: z.array(MessageSchema),
  tools: z.array(ToolSchema).default([]),
  context: z.array(ContextSchema).optional(),
  state: z.unknown().optional(),
});

export type ValidatedRunAgentInput = z.infer<typeof RunAgentInputSchema>;
