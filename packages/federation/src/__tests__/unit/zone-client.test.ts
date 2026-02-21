import type { Zone } from "@nexus/sdk";
import {
  FederationZoneAlreadyExistsError,
  FederationZoneInvalidIdError,
  FederationZoneJoinFailedError,
  FederationZoneNotFoundError,
  FederationZoneShareFailedError,
  FederationZoneTerminatingError,
} from "@templar/errors";
import { describe, expect, it, vi } from "vitest";
import { ZoneClient } from "../../zone/zone-client.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeZone(overrides?: Partial<Zone>): Zone {
  return {
    zone_id: "test-zone",
    name: "Test Zone",
    domain: null,
    description: null,
    phase: "Active",
    finalizers: [],
    is_active: true,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function createMockSdk() {
  return {
    zones: {
      create: vi.fn(),
      get: vi.fn(),
      list: vi.fn(),
      deprovision: vi.fn(),
      share: vi.fn(),
      join: vi.fn(),
    },
  };
}

type MockSdk = ReturnType<typeof createMockSdk>;

function createClient(sdk?: MockSdk) {
  const mockSdk = sdk ?? createMockSdk();
  // biome-ignore lint/suspicious/noExplicitAny: Test mock
  const client = new ZoneClient(mockSdk as any);
  return { client, sdk: mockSdk };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ZoneClient", () => {
  // -----------------------------------------------------------------------
  // create()
  // -----------------------------------------------------------------------

  describe("create()", () => {
    it("creates a zone and returns ZoneInfo", async () => {
      const { client, sdk } = createClient();
      sdk.zones.create.mockResolvedValue(makeZone({ zone_id: "new-zone" }));

      const result = await client.create({ name: "New Zone" });

      expect(result.zoneId).toBe("new-zone");
      expect(result.name).toBe("Test Zone");
      expect(result.phase).toBe("Active");
    });

    it("validates zoneId if provided", async () => {
      const { client } = createClient();

      await expect(client.create({ name: "X", zoneId: "BAD" })).rejects.toThrow(
        FederationZoneInvalidIdError,
      );
    });

    it("maps 409 to FederationZoneAlreadyExistsError", async () => {
      const { client, sdk } = createClient();
      sdk.zones.create.mockRejectedValue({ status: 409 });

      await expect(client.create({ name: "Dup", zoneId: "dup-zone" })).rejects.toThrow(
        FederationZoneAlreadyExistsError,
      );
    });

    it("passes optional fields to SDK", async () => {
      const { client, sdk } = createClient();
      sdk.zones.create.mockResolvedValue(makeZone());

      await client.create({
        name: "My Zone",
        zoneId: "my-zone",
        domain: "example.com",
        description: "A test zone",
      });

      expect(sdk.zones.create).toHaveBeenCalledWith({
        name: "My Zone",
        zone_id: "my-zone",
        domain: "example.com",
        description: "A test zone",
      });
    });
  });

  // -----------------------------------------------------------------------
  // get()
  // -----------------------------------------------------------------------

  describe("get()", () => {
    it("returns ZoneInfo for existing zone", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(makeZone({ zone_id: "my-zone", domain: "example.com" }));

      const result = await client.get("my-zone");

      expect(result.zoneId).toBe("my-zone");
      expect(result.domain).toBe("example.com");
    });

    it("validates zone ID", async () => {
      const { client } = createClient();

      await expect(client.get("X")).rejects.toThrow(FederationZoneInvalidIdError);
    });

    it("maps 404 to FederationZoneNotFoundError", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockRejectedValue({ status: 404 });

      await expect(client.get("missing-zone")).rejects.toThrow(FederationZoneNotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // list()
  // -----------------------------------------------------------------------

  describe("list()", () => {
    it("returns mapped zones and total", async () => {
      const { client, sdk } = createClient();
      sdk.zones.list.mockResolvedValue({
        zones: [makeZone({ zone_id: "zone-a" }), makeZone({ zone_id: "zone-b" })],
        total: 2,
      });

      const result = await client.list();

      expect(result.zones).toHaveLength(2);
      expect(result.zones[0]?.zoneId).toBe("zone-a");
      expect(result.zones[1]?.zoneId).toBe("zone-b");
      expect(result.total).toBe(2);
    });

    it("passes pagination params", async () => {
      const { client, sdk } = createClient();
      sdk.zones.list.mockResolvedValue({ zones: [], total: 0 });

      await client.list({ limit: 10, offset: 20 });

      expect(sdk.zones.list).toHaveBeenCalledWith({ limit: 10, offset: 20 });
    });
  });

  // -----------------------------------------------------------------------
  // deprovision()
  // -----------------------------------------------------------------------

  describe("deprovision()", () => {
    it("calls SDK deprovision", async () => {
      const { client, sdk } = createClient();
      sdk.zones.deprovision.mockResolvedValue({});

      await client.deprovision("my-zone");

      expect(sdk.zones.deprovision).toHaveBeenCalledWith("my-zone");
    });

    it("maps 404 to FederationZoneNotFoundError", async () => {
      const { client, sdk } = createClient();
      sdk.zones.deprovision.mockRejectedValue({ status: 404 });

      await expect(client.deprovision("gone-zone")).rejects.toThrow(FederationZoneNotFoundError);
    });
  });

  // -----------------------------------------------------------------------
  // share()
  // -----------------------------------------------------------------------

  describe("share()", () => {
    it("shares an active zone", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(makeZone({ phase: "Active" }));
      sdk.zones.share.mockResolvedValue({ zone_id: "test-zone" });

      await client.share("test-zone", {
        localPath: "/data",
        peerAddr: "peer:8080",
        remotePath: "/shared",
      });

      expect(sdk.zones.share).toHaveBeenCalledWith("test-zone", {
        local_path: "/data",
        peer_addr: "peer:8080",
        remote_path: "/shared",
      });
    });

    it("rejects share on terminating zone", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(makeZone({ phase: "Terminating" }));

      await expect(
        client.share("test-zone", {
          localPath: "/data",
          peerAddr: "peer:8080",
          remotePath: "/shared",
        }),
      ).rejects.toThrow(FederationZoneTerminatingError);
    });

    it("wraps SDK errors in FederationZoneShareFailedError", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(makeZone({ phase: "Active" }));
      sdk.zones.share.mockRejectedValue(new Error("network error"));

      await expect(
        client.share("test-zone", {
          localPath: "/data",
          peerAddr: "peer:8080",
          remotePath: "/shared",
        }),
      ).rejects.toThrow(FederationZoneShareFailedError);
    });
  });

  // -----------------------------------------------------------------------
  // join()
  // -----------------------------------------------------------------------

  describe("join()", () => {
    it("joins an active zone", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(makeZone({ phase: "Active" }));
      sdk.zones.join.mockResolvedValue({ zone_id: "test-zone" });

      await client.join("test-zone", {
        peerAddr: "peer:8080",
        remotePath: "/shared",
        localPath: "/data",
      });

      expect(sdk.zones.join).toHaveBeenCalledWith("test-zone", {
        peer_addr: "peer:8080",
        remote_path: "/shared",
        local_path: "/data",
      });
    });

    it("rejects join on terminated zone", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(makeZone({ phase: "Terminated" }));

      await expect(
        client.join("test-zone", {
          peerAddr: "peer:8080",
          remotePath: "/shared",
          localPath: "/data",
        }),
      ).rejects.toThrow(FederationZoneTerminatingError);
    });

    it("wraps SDK errors in FederationZoneJoinFailedError", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(makeZone({ phase: "Active" }));
      sdk.zones.join.mockRejectedValue(new Error("timeout"));

      await expect(
        client.join("test-zone", {
          peerAddr: "peer:8080",
          remotePath: "/shared",
          localPath: "/data",
        }),
      ).rejects.toThrow(FederationZoneJoinFailedError);
    });
  });

  // -----------------------------------------------------------------------
  // Mapping (snake_case → camelCase)
  // -----------------------------------------------------------------------

  describe("field mapping", () => {
    it("maps all snake_case fields to camelCase", async () => {
      const { client, sdk } = createClient();
      sdk.zones.get.mockResolvedValue(
        makeZone({
          zone_id: "mapped-zone",
          domain: "example.com",
          description: "A test",
          created_at: "2025-06-01T00:00:00Z",
          updated_at: "2025-06-02T00:00:00Z",
        }),
      );

      const result = await client.get("mapped-zone");

      expect(result).toEqual({
        zoneId: "mapped-zone",
        name: "Test Zone",
        domain: "example.com",
        description: "A test",
        phase: "Active",
        createdAt: "2025-06-01T00:00:00Z",
        updatedAt: "2025-06-02T00:00:00Z",
      });
    });
  });
});
