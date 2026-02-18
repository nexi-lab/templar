/**
 * Artifacts resource for managing persistent tool and agent definitions
 */

import type {
	Artifact,
	ArtifactSearchResponse,
	ArtifactsBatchResponse,
	ArtifactsResponse,
	CreateArtifactParams,
	GetArtifactsBatchParams,
	ListArtifactsParams,
	SearchArtifactsParams,
	UpdateArtifactParams,
} from "../types/artifacts.js";
import { BaseResource } from "./base.js";

/**
 * Resource for managing artifacts via the Nexus Artifact API
 */
export class ArtifactsResource extends BaseResource {
	/**
	 * Create a new artifact
	 *
	 * @param params - Artifact creation parameters
	 * @returns The created artifact
	 *
	 * @example
	 * ```typescript
	 * const artifact = await client.artifacts.create({
	 *   name: 'calculate_refund',
	 *   description: 'Calculates refund amount from order details',
	 *   type: 'tool',
	 *   tags: ['finance', 'refund'],
	 *   schema: { input: { orderId: 'string' }, output: { amount: 'number' } },
	 * });
	 * ```
	 */
	async create(params: CreateArtifactParams): Promise<Artifact> {
		return this.http.request<Artifact>("/api/v2/artifacts", {
			method: "POST",
			body: params,
		});
	}

	/**
	 * Get an artifact by ID
	 *
	 * @param id - Artifact ID
	 * @returns The full artifact including schema/manifest
	 *
	 * @example
	 * ```typescript
	 * const artifact = await client.artifacts.get('art-123');
	 * ```
	 */
	async get(id: string): Promise<Artifact> {
		return this.http.request<Artifact>(`/api/v2/artifacts/${encodeURIComponent(id)}`, {
			method: "GET",
		});
	}

	/**
	 * Get multiple artifacts by ID in a single request
	 *
	 * @param params - Batch get parameters containing artifact IDs
	 * @returns The matching artifacts
	 *
	 * @example
	 * ```typescript
	 * const result = await client.artifacts.getBatch({ ids: ['art-1', 'art-2'] });
	 * console.log(result.artifacts);
	 * ```
	 */
	async getBatch(params: GetArtifactsBatchParams): Promise<ArtifactsBatchResponse> {
		return this.http.request<ArtifactsBatchResponse>(
			"/api/v2/artifacts/batch",
			{
				method: "POST",
				body: params,
			},
		);
	}

	/**
	 * Update an artifact
	 *
	 * @param id - Artifact ID
	 * @param params - Update parameters (supports optimistic concurrency via expectedVersion)
	 * @returns The updated artifact
	 *
	 * @example
	 * ```typescript
	 * const artifact = await client.artifacts.update('art-123', {
	 *   status: 'deprecated',
	 *   expectedVersion: 3,
	 * });
	 * ```
	 */
	async update(id: string, params: UpdateArtifactParams): Promise<Artifact> {
		return this.http.request<Artifact>(`/api/v2/artifacts/${encodeURIComponent(id)}`, {
			method: "PATCH",
			body: params,
		});
	}

	/**
	 * Delete an artifact
	 *
	 * @param id - Artifact ID
	 *
	 * @example
	 * ```typescript
	 * await client.artifacts.delete('art-123');
	 * ```
	 */
	async delete(id: string): Promise<void> {
		return this.http.request<void>(`/api/v2/artifacts/${encodeURIComponent(id)}`, {
			method: "DELETE",
		});
	}

	/**
	 * List artifacts with optional filtering and pagination
	 *
	 * @param params - List parameters with tag/type/status filters
	 * @returns Paginated list of artifact metadata
	 *
	 * @example
	 * ```typescript
	 * const response = await client.artifacts.list({
	 *   type: 'tool',
	 *   tags: ['finance'],
	 *   status: 'active',
	 *   limit: 20,
	 * });
	 * ```
	 */
	async list(params?: ListArtifactsParams): Promise<ArtifactsResponse> {
		const query: Record<string, string | number | boolean | undefined> = {};
		if (params?.type !== undefined) query.type = params.type;
		if (params?.status !== undefined) query.status = params.status;
		if (params?.createdBy !== undefined) query.createdBy = params.createdBy;
		if (params?.limit !== undefined) query.limit = params.limit;
		if (params?.cursor !== undefined) query.cursor = params.cursor;
		if (params?.tags !== undefined && params.tags.length > 0) {
			query.tags = [...params.tags].join(",");
		}

		const hasQuery = Object.keys(query).length > 0;
		return this.http.request<ArtifactsResponse>("/api/v2/artifacts", {
			method: "GET",
			...(hasQuery ? { query } : {}),
		});
	}

	/**
	 * Search artifacts using semantic or keyword search
	 *
	 * @param params - Search parameters including query string and filters
	 * @returns Search results with relevance scores
	 *
	 * @example
	 * ```typescript
	 * const results = await client.artifacts.search({
	 *   query: 'handle refund calculations',
	 *   type: 'tool',
	 *   limit: 5,
	 * });
	 * ```
	 */
	async search(params: SearchArtifactsParams): Promise<ArtifactSearchResponse> {
		return this.http.request<ArtifactSearchResponse>(
			"/api/v2/artifacts/search",
			{
				method: "POST",
				body: params,
			},
		);
	}
}
