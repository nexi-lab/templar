/**
 * Sandbox resource for code execution via Monty/Docker/E2B
 */

import type {
  CreateSandboxParams,
  CreateSandboxResponse,
  RunCodeParams,
  RunCodeResponse,
  SandboxInfoResponse,
} from "../types/sandbox.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing sandboxed code execution via the Nexus Sandbox API (v2)
 *
 * Supports:
 * - Creating sandbox sessions (Monty, Docker, E2B providers)
 * - Running code within a sandbox
 * - Destroying sandbox sessions
 *
 * @example
 * ```typescript
 * // Create a sandbox
 * const sandbox = await client.sandbox.create({
 *   name: 'code-mode-session',
 *   provider: 'monty',
 * });
 *
 * // Run code
 * const result = await client.sandbox.runCode(sandbox.sandbox_id, {
 *   language: 'python',
 *   code: 'print("hello")',
 * });
 *
 * // Destroy when done
 * await client.sandbox.destroy(sandbox.sandbox_id);
 * ```
 */
export class SandboxResource extends BaseResource {
  /**
   * Create a new sandbox session
   *
   * @param params - Sandbox creation parameters
   * @returns Created sandbox details including sandbox_id
   *
   * @example
   * ```typescript
   * const sandbox = await client.sandbox.create({
   *   name: 'my-sandbox',
   *   provider: 'monty',
   *   securityProfile: 'strict',
   * });
   * console.log(`Created sandbox: ${sandbox.sandbox_id}`);
   * ```
   */
  async create(params: CreateSandboxParams): Promise<CreateSandboxResponse> {
    return this.http.request<CreateSandboxResponse>("/api/v2/sandbox", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Run code in an existing sandbox
   *
   * @param sandboxId - The sandbox session ID
   * @param params - Code execution parameters
   * @returns Execution results including stdout, stderr, and exit code
   *
   * @example
   * ```typescript
   * const result = await client.sandbox.runCode('sbx-123', {
   *   language: 'python',
   *   code: 'result = read_file("src/main.ts")\nprint(result)',
   *   timeout: 30,
   *   host_functions: ['read_file', 'search'],
   * });
   * console.log(`stdout: ${result.stdout}`);
   * console.log(`exit code: ${result.exit_code}`);
   * ```
   */
  async runCode(sandboxId: string, params: RunCodeParams): Promise<RunCodeResponse> {
    return this.http.request<RunCodeResponse>(`/api/v2/sandbox/${sandboxId}/run`, {
      method: "POST",
      body: params,
    });
  }

  /**
   * Destroy a sandbox session
   *
   * @param sandboxId - The sandbox session ID to destroy
   * @returns Sandbox info at time of destruction
   *
   * @example
   * ```typescript
   * await client.sandbox.destroy('sbx-123');
   * ```
   */
  async destroy(sandboxId: string): Promise<SandboxInfoResponse> {
    return this.http.request<SandboxInfoResponse>(`/api/v2/sandbox/${sandboxId}`, {
      method: "DELETE",
    });
  }
}
