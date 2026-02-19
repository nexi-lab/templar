import type { PluginCapability, PluginTrust } from "@templar/core";
import { PluginCapabilityError } from "@templar/errors";
import { describe, expect, it } from "vitest";
import { PluginApiImpl } from "../plugin-api.js";

describe("PluginApiImpl", () => {
  function createApi(
    trust: PluginTrust = "bundled",
    capabilities: PluginCapability[] = [
      "tools",
      "channels",
      "middleware",
      "hooks",
      "skills",
      "providers",
    ],
  ) {
    return new PluginApiImpl("test-plugin", trust, capabilities);
  }

  // -------------------------------------------------------------------------
  // Registration
  // -------------------------------------------------------------------------

  describe("registerTool", () => {
    it("should accept a valid tool registration", () => {
      const api = createApi();
      api.registerTool({ name: "test-tool", description: "A test tool" });

      const regs = api.getRegistrations();
      expect(regs.tools).toHaveLength(1);
      expect(regs.tools[0]?.name).toBe("test-tool");
    });

    it("should accept multiple tool registrations", () => {
      const api = createApi();
      api.registerTool({ name: "tool-1", description: "First" });
      api.registerTool({ name: "tool-2", description: "Second" });

      expect(api.getRegistrations().tools).toHaveLength(2);
    });
  });

  describe("registerChannel", () => {
    it("should accept a valid channel registration", () => {
      const api = createApi();
      const mockChannel = { default: class {} as never };
      api.registerChannel(mockChannel);

      expect(api.getRegistrations().channels).toHaveLength(1);
    });
  });

  describe("registerMiddleware", () => {
    it("should accept middleware without wrap hooks", () => {
      const api = createApi("bundled", ["middleware"]);
      api.registerMiddleware({ name: "test-mw" });

      expect(api.getRegistrations().middleware).toHaveLength(1);
    });

    it("should check wrapModel sub-capability", () => {
      const api = createApi("bundled", ["middleware", "middleware:wrapModel"]);
      api.registerMiddleware({
        name: "wrapping-mw",
        wrapModelCall: async (_req, next) => next(_req),
      });

      expect(api.getRegistrations().middleware).toHaveLength(1);
    });

    it("should reject wrapModel without sub-capability declared", () => {
      const api = createApi("bundled", ["middleware"]);
      expect(() =>
        api.registerMiddleware({
          name: "wrapping-mw",
          wrapModelCall: async (_req, next) => next(_req),
        }),
      ).toThrow(PluginCapabilityError);
    });

    it("should check wrapTool sub-capability", () => {
      const api = createApi("bundled", ["middleware"]);
      expect(() =>
        api.registerMiddleware({
          name: "wrapping-mw",
          wrapToolCall: async (_req, next) => next(_req),
        }),
      ).toThrow(PluginCapabilityError);
    });
  });

  describe("registerHook", () => {
    it("should accept a hook registration", () => {
      const api = createApi();
      api.registerHook("PostToolUse", () => {});

      expect(api.getRegistrations().hooks).toHaveLength(1);
      expect(api.getRegistrations().hooks[0]?.event).toBe("PostToolUse");
    });
  });

  describe("registerSkillDir", () => {
    it("should accept a skill directory", () => {
      const api = createApi();
      api.registerSkillDir("/path/to/skills");

      expect(api.getRegistrations().skillDirs).toHaveLength(1);
    });
  });

  describe("registerProvider", () => {
    it("should accept a provider", () => {
      const api = createApi();
      api.registerProvider("weather", { fetch: () => {} });

      const regs = api.getRegistrations();
      expect(regs.providers.size).toBe(1);
      expect(regs.providers.has("weather")).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Capability enforcement
  // -------------------------------------------------------------------------

  describe("capability enforcement", () => {
    it("should throw when capability not declared", () => {
      const api = createApi("bundled", ["tools"]); // only tools declared
      expect(() => api.registerMiddleware({ name: "test-mw" })).toThrow(PluginCapabilityError);
    });

    it("should throw when trust tier denies capability", () => {
      // community cannot use providers
      const api = createApi("community", ["providers"]);
      expect(() => api.registerProvider("test", {})).toThrow(PluginCapabilityError);
    });

    it("should allow community plugins to register tools", () => {
      const api = createApi("community", ["tools"]);
      api.registerTool({ name: "allowed-tool", description: "OK" });
      expect(api.getRegistrations().tools).toHaveLength(1);
    });

    it("should allow community plugins to register hooks", () => {
      const api = createApi("community", ["hooks"]);
      api.registerHook("PostToolUse", () => {});
      expect(api.getRegistrations().hooks).toHaveLength(1);
    });

    it("should deny community middleware:wrapModel even if declared", () => {
      const api = createApi("community", ["middleware", "middleware:wrapModel"]);
      // middleware itself is not allowed for community
      expect(() => api.registerMiddleware({ name: "test" })).toThrow(PluginCapabilityError);
    });
  });

  // -------------------------------------------------------------------------
  // getRegistrations — immutable snapshot
  // -------------------------------------------------------------------------

  describe("getRegistrations", () => {
    it("should return a snapshot that is independent of further mutations", () => {
      const api = createApi();
      api.registerTool({ name: "first", description: "First" });
      const snapshot1 = api.getRegistrations();

      api.registerTool({ name: "second", description: "Second" });
      const snapshot2 = api.getRegistrations();

      expect(snapshot1.tools).toHaveLength(1);
      expect(snapshot2.tools).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // dispose
  // -------------------------------------------------------------------------

  describe("dispose", () => {
    it("should clear all registrations", () => {
      const api = createApi();
      api.registerTool({ name: "tool", description: "Test" });
      api.registerHook("PostToolUse", () => {});
      api.registerSkillDir("/skills");
      api.registerProvider("p", {});

      api.dispose();

      const regs = api.getRegistrations();
      expect(regs.tools).toHaveLength(0);
      expect(regs.hooks).toHaveLength(0);
      expect(regs.skillDirs).toHaveLength(0);
      expect(regs.providers.size).toBe(0);
    });
  });
});
