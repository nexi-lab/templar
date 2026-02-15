import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, bench, describe } from "vitest";
import { resolveBootstrapFiles } from "../bootstrap-resolver.js";
import { truncateContent } from "../truncate.js";

let dir: string;

beforeAll(async () => {
  dir = join(tmpdir(), `templar-bench-${Date.now()}`);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "TEMPLAR.md"), "x".repeat(8_000));
  await writeFile(join(dir, "TOOLS.md"), "y".repeat(5_000));
  await writeFile(join(dir, "CONTEXT.md"), "z".repeat(3_000));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("truncation", () => {
  const content100k = "x".repeat(100_000);

  bench("truncate 100K string", () => {
    truncateContent(content100k, {
      budget: 10_000,
      filePath: "/bench/TEMPLAR.md",
    });
  });
});

describe("resolveBootstrapFiles", () => {
  bench("resolve 3 files", async () => {
    await resolveBootstrapFiles({ manifestDir: dir });
  });
});
