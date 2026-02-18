/**
 * Feedback sub-resource for the ACE API
 */

import type {
  AddFeedbackParams,
  AddFeedbackResponse,
  EffectiveScoreParams,
  EffectiveScoreResponse,
  RelearnParams,
  TrajectoryFeedbackResponse,
} from "../../types/ace.js";
import { BaseResource } from "../base.js";

/**
 * Resource for managing trajectory feedback via the Nexus ACE API
 */
export class FeedbackResource extends BaseResource {
  /**
   * Add feedback for a trajectory
   */
  async add(params: AddFeedbackParams): Promise<AddFeedbackResponse> {
    return this.http.request<AddFeedbackResponse>("/api/v2/feedback", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get effective score for a trajectory
   */
  async getScore(params: EffectiveScoreParams): Promise<EffectiveScoreResponse> {
    return this.http.request<EffectiveScoreResponse>("/api/v2/feedback/score", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Mark a trajectory for relearning
   */
  async markForRelearn(params: RelearnParams): Promise<Record<string, unknown>> {
    return this.http.request<Record<string, unknown>>("/api/v2/feedback/relearn", {
      method: "POST",
      body: params,
    });
  }

  /**
   * Get all feedback for a trajectory
   */
  async getForTrajectory(trajectoryId: string): Promise<TrajectoryFeedbackResponse> {
    return this.http.request<TrajectoryFeedbackResponse>(
      `/api/v2/feedback/${trajectoryId}`,
      { method: "GET" },
    );
  }
}
