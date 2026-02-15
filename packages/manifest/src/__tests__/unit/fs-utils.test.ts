import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { fileExists, readTextFile } from "../../fs-utils.js";

describe("readTextFile", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `templar-fs-utils-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("reads a normal text file", async () => {
    const file = join(dir, "normal.md");
    await writeFile(file, "# Hello\n\nWorld");
    const content = await readTextFile(file);
    expect(content).toBe("# Hello\n\nWorld");
  });

  it("strips BOM from file content", async () => {
    const file = join(dir, "bom.md");
    await writeFile(file, "\uFEFF# With BOM");
    const content = await readTextFile(file);
    expect(content).toBe("# With BOM");
    expect(content.charCodeAt(0)).not.toBe(0xfeff);
  });

  it("detects binary files with null bytes", async () => {
    const file = join(dir, "binary.bin");
    await writeFile(file, "Hello\0World");
    await expect(readTextFile(file)).rejects.toThrow("File appears to be binary");
  });

  it("throws for non-existent file", async () => {
    const file = join(dir, "nonexistent.md");
    await expect(readTextFile(file)).rejects.toThrow();
  });

  it("reads empty file", async () => {
    const file = join(dir, "empty.md");
    await writeFile(file, "");
    const content = await readTextFile(file);
    expect(content).toBe("");
  });
});

describe("fileExists", () => {
  let dir: string;

  beforeAll(async () => {
    dir = join(tmpdir(), `templar-fileexists-test-${Date.now()}`);
    await mkdir(dir, { recursive: true });
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns true for an existing file", async () => {
    const file = join(dir, "exists.md");
    await writeFile(file, "content");
    expect(await fileExists(file)).toBe(true);
  });

  it("returns false for a missing path", async () => {
    expect(await fileExists(join(dir, "nope.md"))).toBe(false);
  });

  it("returns false for a directory", async () => {
    expect(await fileExists(dir)).toBe(false);
  });
});
