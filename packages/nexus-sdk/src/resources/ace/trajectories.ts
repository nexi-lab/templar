/**
 * Trajectories sub-resource for the ACE API
 */

import type {
  CompleteTrajectoryParams,
  LogStepParams,
  QueryTrajectoriesParams,
  QueryTrajectoriesResponse,
  StartTrajectoryParams,
  StartTrajectoryResponse,
  TrajectoryEntry,
} from "../../types/ace.js";
import { BaseResource } from "../base.js";

/**
 * Resource for managing execution trajectories via the Nexus ACE API
 */
export class TrajectoriesResource extends BaseResource {
  /**
   * Start a new trajectory
   */
  async start(params: StartTrajectoryParams): Promise<StartTrajectoryResponse> {
    return this.http.request<StartTrajectoryResponse>("/api/v2/trajectories", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Log a step in an active trajectory
   */
  async logStep(params: LogStepParams): Promise<Record<string, unknown>> {
    const { trajectory_id, ...body } = params;
    return this.http.request<Record<string, unknown>>(
      `/api/v2/trajectories/${trajectory_id}/steps`,
      { method: "POST", body },
    );
  }

  /**
   * Complete a trajectory with final status
   */
  async complete(params: CompleteTrajectoryParams): Promise<Record<string, unknown>> {
    const { trajectory_id, ...body } = params;
    return this.http.request<Record<string, unknown>>(
      `/api/v2/trajectories/${trajectory_id}/complete`,
      { method: "POST", body },
    );
  }

  /**
   * Get a trajectory by ID
   */
  async get(trajectoryId: string): Promise<TrajectoryEntry> {
    const result = await this.http.request<{ trajectory: TrajectoryEntry }>(
      `/api/v2/trajectories/${trajectoryId}`,
      { method: "GET" },
    );
    return result.trajectory;
  }

  /**
   * Query trajectories with filters
   */
  async query(params: QueryTrajectoriesParams): Promise<QueryTrajectoriesResponse> {
    const query: Record<string, string | number | boolean | undefined> = {};
    if (params.agent_id !== undefined) query.agent_id = params.agent_id;
    if (params.task_type !== undefined) query.task_type = params.task_type;
    if (params.status !== undefined) query.status = params.status;
    if (params.limit !== undefined) query.limit = params.limit;
    if (params.offset !== undefined) query.offset = params.offset;
    if (params.path !== undefined) query.path = params.path;

    return this.http.request<QueryTrajectoriesResponse>("/api/v2/trajectories", {
      method: "GET",
      query,
    });
  }
}
