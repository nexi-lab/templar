/**
 * @templar/code-mode
 *
 * Code mode middleware for Templar agents — replaces sequential tool calls
 * with LLM-generated Python code executed in a Monty sandbox.
 */

export { CodeModeMiddleware, createCodeModeMiddleware } from "./middleware.js";
export { generateCodeModePrompt, generateFunctionSignatures } from "./prompt.js";
export type { CodeModeConfig } from "./types.js";
export { DEFAULT_CONFIG } from "./types.js";
export type { CodeOutputResult } from "./validation.js";
export { extractCodeBlock, validateCodeModeConfig, validateCodeOutput } from "./validation.js";
