/**
 * ACE (Adaptive Context Engine) resource — composite of all ACE sub-resources
 */

import type { HttpClient } from "../../http/index.js";
import { ConsolidationResource } from "./consolidation.js";
import { CurationResource } from "./curation.js";
import { FeedbackResource } from "./feedback.js";
import { PlaybooksResource } from "./playbooks.js";
import { ReflectionResource } from "./reflection.js";
import { TrajectoriesResource } from "./trajectories.js";

/**
 * Composite resource providing access to all ACE sub-resources.
 *
 * Usage: `client.ace.trajectories.start(...)`, `client.ace.playbooks.query(...)`, etc.
 */
export class AceResource {
  public readonly trajectories: TrajectoriesResource;
  public readonly playbooks: PlaybooksResource;
  public readonly reflection: ReflectionResource;
  public readonly curation: CurationResource;
  public readonly consolidation: ConsolidationResource;
  public readonly feedback: FeedbackResource;

  constructor(http: HttpClient) {
    this.trajectories = new TrajectoriesResource(http);
    this.playbooks = new PlaybooksResource(http);
    this.reflection = new ReflectionResource(http);
    this.curation = new CurationResource(http);
    this.consolidation = new ConsolidationResource(http);
    this.feedback = new FeedbackResource(http);
  }
}

// Re-export sub-resources for direct import
export { ConsolidationResource } from "./consolidation.js";
export { CurationResource } from "./curation.js";
export { FeedbackResource } from "./feedback.js";
export { PlaybooksResource } from "./playbooks.js";
export { ReflectionResource } from "./reflection.js";
export { TrajectoriesResource } from "./trajectories.js";
