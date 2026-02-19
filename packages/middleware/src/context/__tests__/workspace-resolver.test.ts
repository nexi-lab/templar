import { describe, expect, it } from "vitest";
import { WorkspaceSnapshotResolver } from "../resolvers/workspace-resolver.js";
import { createMockNexusClient } from "./helpers.js";

describe("WorkspaceSnapshotResolver", () => {
  it("should return files_only mode workspace info", async () => {
    const { client } = createMockNexusClient();
    const resolver = new WorkspaceSnapshotResolver(client);

    const result = await resolver.resolve(
      { mode: "files_only" },
      { workspace: { root: "/home/user/project" } },
    );

    expect(result.type).toBe("workspace_snapshot");
    expect(result.content).toContain("/home/user/project");
    expect(result.content).toContain("files_only");
    expect(result.truncated).toBe(false);
  });

  it("should return latest mode workspace info", async () => {
    const { client } = createMockNexusClient();
    const resolver = new WorkspaceSnapshotResolver(client);

    const result = await resolver.resolve({ mode: "latest" }, { workspace: { root: "/app" } });

    expect(result.content).toContain("latest");
    expect(result.content).toContain("/app");
  });

  it("should default to files_only mode", async () => {
    const { client } = createMockNexusClient();
    const resolver = new WorkspaceSnapshotResolver(client);

    const result = await resolver.resolve({}, {});

    expect(result.content).toContain("files_only");
  });

  it("should use 'unknown' when workspace root is not provided", async () => {
    const { client } = createMockNexusClient();
    const resolver = new WorkspaceSnapshotResolver(client);

    const result = await resolver.resolve({}, {});

    expect(result.content).toContain("unknown");
  });

  it("should truncate when maxChars is exceeded", async () => {
    const { client } = createMockNexusClient();
    const resolver = new WorkspaceSnapshotResolver(client);

    const result = await resolver.resolve(
      { maxChars: 5 },
      { workspace: { root: "/very/long/workspace/path" } },
    );

    expect(result.content.length).toBe(5);
    expect(result.truncated).toBe(true);
  });

  it("should throw when abort signal is already aborted", async () => {
    const { client } = createMockNexusClient();
    const resolver = new WorkspaceSnapshotResolver(client);
    const controller = new AbortController();
    controller.abort();

    await expect(resolver.resolve({}, {}, controller.signal)).rejects.toThrow("Aborted");
  });
});
