/**
 * Sandbox types — mirrors Nexus sandbox API contract
 */

export interface CreateSandboxParams {
  readonly name: string;
  readonly provider?: "monty" | "docker" | "e2b";
  readonly timeoutMinutes?: number;
  readonly securityProfile?: "strict" | "standard" | "permissive";
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CreateSandboxResponse {
  readonly sandbox_id: string;
  readonly name: string;
  readonly status: string;
  readonly provider: string;
  readonly created_at: string;
}

export interface RunCodeParams {
  readonly language: string;
  readonly code: string;
  readonly timeout?: number;
  readonly host_functions?: readonly string[];
}

export interface RunCodeResponse {
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: number;
  readonly execution_time: number;
}

export interface SandboxInfoResponse {
  readonly sandbox_id: string;
  readonly status: string;
  readonly provider: string;
  readonly created_at: string;
  readonly metadata?: Readonly<Record<string, string>>;
}
