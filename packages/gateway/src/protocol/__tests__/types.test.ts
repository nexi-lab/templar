import { describe, expect, it } from "vitest";
import { LANE_PRIORITY, LANES, LaneMessageSchema, LaneSchema, QUEUED_LANES } from "../lanes.js";
import {
  SESSION_EVENTS,
  SESSION_STATES,
  SESSION_TRANSITIONS,
  SessionInfoSchema,
} from "../sessions.js";
import {
  DEFAULT_GATEWAY_CONFIG,
  GatewayConfigSchema,
  HOT_RELOADABLE_FIELDS,
  NodeCapabilitiesSchema,
  RESTART_REQUIRED_FIELDS,
  TaskRequirementsSchema,
} from "../types.js";

describe("GatewayConfig", () => {
  const validConfig = {
    port: 18789,
    nexusUrl: "https://api.nexus.test",
    nexusApiKey: "test-key",
    sessionTimeout: 60_000,
    suspendTimeout: 300_000,
    healthCheckInterval: 30_000,
    laneCapacity: 256,
    maxConnections: 1024,
    maxFramesPerSecond: 100,
    defaultConversationScope: "per-channel-peer" as const,
    maxConversations: 100_000,
    conversationTtl: 86_400_000,
  };

  it("accepts valid config", () => {
    expect(GatewayConfigSchema.parse(validConfig)).toEqual(validConfig);
  });

  it("rejects port 0", () => {
    const result = GatewayConfigSchema.safeParse({ ...validConfig, port: 0 });
    expect(result.success).toBe(false);
  });

  it("rejects port > 65535", () => {
    const result = GatewayConfigSchema.safeParse({ ...validConfig, port: 70000 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid nexusUrl", () => {
    const result = GatewayConfigSchema.safeParse({ ...validConfig, nexusUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects empty nexusApiKey", () => {
    const result = GatewayConfigSchema.safeParse({ ...validConfig, nexusApiKey: "" });
    expect(result.success).toBe(false);
  });

  it("rejects negative sessionTimeout", () => {
    const result = GatewayConfigSchema.safeParse({ ...validConfig, sessionTimeout: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects zero laneCapacity", () => {
    const result = GatewayConfigSchema.safeParse({ ...validConfig, laneCapacity: 0 });
    expect(result.success).toBe(false);
  });
});

describe("DEFAULT_GATEWAY_CONFIG", () => {
  it("has expected default values", () => {
    expect(DEFAULT_GATEWAY_CONFIG.port).toBe(18789);
    expect(DEFAULT_GATEWAY_CONFIG.sessionTimeout).toBe(60_000);
    expect(DEFAULT_GATEWAY_CONFIG.suspendTimeout).toBe(300_000);
    expect(DEFAULT_GATEWAY_CONFIG.healthCheckInterval).toBe(30_000);
    expect(DEFAULT_GATEWAY_CONFIG.laneCapacity).toBe(256);
    expect(DEFAULT_GATEWAY_CONFIG.defaultConversationScope).toBe("per-channel-peer");
    expect(DEFAULT_GATEWAY_CONFIG.maxConversations).toBe(100_000);
    expect(DEFAULT_GATEWAY_CONFIG.conversationTtl).toBe(86_400_000);
  });
});

describe("hot-reload field classification", () => {
  it("hot-reloadable fields do not overlap with restart-required fields", () => {
    const hot = new Set<string>(HOT_RELOADABLE_FIELDS);
    const restart = new Set<string>(RESTART_REQUIRED_FIELDS);
    for (const field of hot) {
      expect(restart.has(field)).toBe(false);
    }
  });
});

describe("NodeCapabilities", () => {
  it("accepts valid capabilities", () => {
    const caps = {
      agentTypes: ["high"],
      tools: ["web-search"],
      maxConcurrency: 4,
      channels: ["slack"],
    };
    expect(NodeCapabilitiesSchema.parse(caps)).toEqual(caps);
  });

  it("rejects empty agentTypes", () => {
    const result = NodeCapabilitiesSchema.safeParse({
      agentTypes: [],
      tools: [],
      maxConcurrency: 1,
      channels: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-positive maxConcurrency", () => {
    const result = NodeCapabilitiesSchema.safeParse({
      agentTypes: ["high"],
      tools: [],
      maxConcurrency: 0,
      channels: [],
    });
    expect(result.success).toBe(false);
  });
});

describe("TaskRequirements", () => {
  it("accepts minimal requirements", () => {
    const req = { agentType: "high" };
    expect(TaskRequirementsSchema.parse(req)).toEqual(req);
  });

  it("accepts full requirements", () => {
    const req = { agentType: "high", tools: ["web-search"], channel: "slack" };
    expect(TaskRequirementsSchema.parse(req)).toEqual(req);
  });
});

describe("Lanes", () => {
  it("has 4 lanes", () => {
    expect(LANES).toHaveLength(4);
  });

  it("has 3 queued lanes (excludes interrupt)", () => {
    expect(QUEUED_LANES).toHaveLength(3);
    expect(QUEUED_LANES).not.toContain("interrupt");
  });

  it("QUEUED_LANES is sorted by LANE_PRIORITY ascending", () => {
    for (let i = 1; i < QUEUED_LANES.length; i++) {
      const prevLane = QUEUED_LANES[i - 1] as keyof typeof LANE_PRIORITY;
      const currLane = QUEUED_LANES[i] as keyof typeof LANE_PRIORITY;
      expect(LANE_PRIORITY[prevLane]).toBeLessThan(LANE_PRIORITY[currLane]);
    }
  });

  it("steer has highest priority (0)", () => {
    expect(LANE_PRIORITY.steer).toBe(0);
    expect(LANE_PRIORITY.collect).toBe(1);
    expect(LANE_PRIORITY.followup).toBe(2);
  });

  it("validates lane values", () => {
    expect(LaneSchema.safeParse("steer").success).toBe(true);
    expect(LaneSchema.safeParse("interrupt").success).toBe(true);
    expect(LaneSchema.safeParse("invalid").success).toBe(false);
  });
});

describe("LaneMessage", () => {
  it("accepts valid message", () => {
    const msg = {
      id: "msg-1",
      lane: "steer" as const,
      channelId: "ch-1",
      payload: { text: "hello" },
      timestamp: Date.now(),
    };
    expect(LaneMessageSchema.parse(msg)).toEqual(msg);
  });

  it("accepts message with routingContext", () => {
    const msg = {
      id: "msg-2",
      lane: "steer" as const,
      channelId: "ch-1",
      payload: { text: "hello" },
      timestamp: Date.now(),
      routingContext: {
        peerId: "peer-1",
        accountId: "acc-1",
        messageType: "dm" as const,
      },
    };
    const result = LaneMessageSchema.parse(msg);
    expect(result.routingContext?.peerId).toBe("peer-1");
  });

  it("rejects empty id", () => {
    const result = LaneMessageSchema.safeParse({
      id: "",
      lane: "steer",
      channelId: "ch-1",
      payload: null,
      timestamp: Date.now(),
    });
    expect(result.success).toBe(false);
  });
});

describe("Sessions", () => {
  it("has 4 states", () => {
    expect(SESSION_STATES).toHaveLength(4);
  });

  it("has 6 events", () => {
    expect(SESSION_EVENTS).toHaveLength(6);
  });

  it("transition table covers all state-event combinations", () => {
    for (const state of SESSION_STATES) {
      for (const event of SESSION_EVENTS) {
        const result = SESSION_TRANSITIONS[state][event];
        expect(result === null || SESSION_STATES.includes(result)).toBe(true);
      }
    }
  });

  it("disconnected is a terminal state (all transitions null)", () => {
    for (const event of SESSION_EVENTS) {
      expect(SESSION_TRANSITIONS.disconnected[event]).toBeNull();
    }
  });
});

describe("SessionInfo", () => {
  it("accepts valid session info", () => {
    const info = {
      nodeId: "node-1",
      state: "connected" as const,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      reconnectCount: 0,
    };
    expect(SessionInfoSchema.parse(info)).toEqual(info);
  });

  it("rejects negative reconnectCount", () => {
    const result = SessionInfoSchema.safeParse({
      nodeId: "node-1",
      state: "connected",
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      reconnectCount: -1,
    });
    expect(result.success).toBe(false);
  });
});
