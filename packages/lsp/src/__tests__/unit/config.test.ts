import { describe, expect, it } from "vitest";
import { LanguageServerConfigSchema, LSPConfigSchema, resolveLanguage } from "../../config.js";
import { createTestLSPConfig } from "../helpers/fixtures.js";

describe("LanguageServerConfigSchema", () => {
  it("parses minimal valid config", () => {
    const config = LanguageServerConfigSchema.parse({
      extensions: ["ts"],
      command: "typescript-language-server",
    });
    expect(config.extensions).toEqual(["ts"]);
    expect(config.command).toBe("typescript-language-server");
    expect(config.args).toEqual([]);
    expect(config.rootDir).toBe(".");
    expect(config.autoStart).toBe(false);
    expect(config.idleTimeoutMs).toBe(300_000);
  });

  it("rejects empty extensions", () => {
    expect(() =>
      LanguageServerConfigSchema.parse({
        extensions: [],
        command: "test",
      }),
    ).toThrow();
  });

  it("rejects empty command", () => {
    expect(() =>
      LanguageServerConfigSchema.parse({
        extensions: ["ts"],
        command: "",
      }),
    ).toThrow();
  });

  it("applies default values", () => {
    const config = LanguageServerConfigSchema.parse({
      extensions: ["py"],
      command: "pyright",
    });
    expect(config.args).toEqual([]);
    expect(config.rootDir).toBe(".");
    expect(config.autoStart).toBe(false);
    expect(config.idleTimeoutMs).toBe(300_000);
  });

  it("accepts custom values", () => {
    const config = LanguageServerConfigSchema.parse({
      extensions: ["rs"],
      command: "rust-analyzer",
      args: ["--log-level=info"],
      rootDir: "/workspace",
      env: { RUST_LOG: "debug" },
      initializationOptions: { checkOnSave: true },
      autoStart: true,
      idleTimeoutMs: 60_000,
    });
    expect(config.args).toEqual(["--log-level=info"]);
    expect(config.rootDir).toBe("/workspace");
    expect(config.env).toEqual({ RUST_LOG: "debug" });
    expect(config.initializationOptions).toEqual({ checkOnSave: true });
    expect(config.autoStart).toBe(true);
    expect(config.idleTimeoutMs).toBe(60_000);
  });
});

describe("LSPConfigSchema", () => {
  it("parses minimal valid config with defaults", () => {
    const config = LSPConfigSchema.parse({
      servers: {
        typescript: {
          extensions: ["ts", "tsx"],
          command: "typescript-language-server",
        },
      },
    });
    expect(config.maxServers).toBe(5);
    expect(config.requestTimeoutMs).toBe(10_000);
    expect(config.initTimeoutMs).toBe(30_000);
    expect(config.maxOpenFiles).toBe(100);
    expect(config.maxDiagnostics).toBe(1000);
    expect(config.positionTolerance).toEqual({ lines: 1, characters: 3 });
    expect(config.maxRestarts).toBe(3);
    expect(config.restartWindowMs).toBe(300_000);
  });

  it("accepts positionTolerance: false to disable multi-attempt", () => {
    const config = LSPConfigSchema.parse({
      servers: {},
      positionTolerance: false,
    });
    expect(config.positionTolerance).toBe(false);
  });

  it("accepts custom position tolerance", () => {
    const config = LSPConfigSchema.parse({
      servers: {},
      positionTolerance: { lines: 2, characters: 5 },
    });
    expect(config.positionTolerance).toEqual({ lines: 2, characters: 5 });
  });

  it("rejects negative maxServers", () => {
    expect(() =>
      LSPConfigSchema.parse({
        servers: {},
        maxServers: -1,
      }),
    ).toThrow();
  });

  it("rejects zero maxServers", () => {
    expect(() =>
      LSPConfigSchema.parse({
        servers: {},
        maxServers: 0,
      }),
    ).toThrow();
  });
});

describe("resolveLanguage", () => {
  const config = createTestLSPConfig({
    servers: {
      typescript: {
        extensions: ["ts", "tsx"],
        command: "typescript-language-server",
        args: [],
        rootDir: ".",
        autoStart: false,
        idleTimeoutMs: 300_000,
      },
      python: {
        extensions: ["py"],
        command: "pyright",
        args: [],
        rootDir: ".",
        autoStart: false,
        idleTimeoutMs: 300_000,
      },
    },
  });

  it("resolves .ts to typescript", () => {
    expect(resolveLanguage("/workspace/src/foo.ts", config)).toBe("typescript");
  });

  it("resolves .tsx to typescript", () => {
    expect(resolveLanguage("/workspace/src/App.tsx", config)).toBe("typescript");
  });

  it("resolves .py to python", () => {
    expect(resolveLanguage("/workspace/main.py", config)).toBe("python");
  });

  it("returns undefined for unknown extension", () => {
    expect(resolveLanguage("/workspace/file.go", config)).toBeUndefined();
  });

  it("returns undefined for file without extension", () => {
    expect(resolveLanguage("/workspace/Makefile", config)).toBeUndefined();
  });

  it("handles nested paths", () => {
    expect(resolveLanguage("/a/b/c/d.ts", config)).toBe("typescript");
  });
});
