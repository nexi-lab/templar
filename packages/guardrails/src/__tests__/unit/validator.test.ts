import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SchemaValidator } from "../../validator.js";

describe("SchemaValidator", () => {
  it("returns valid for matching data", async () => {
    const validator = new SchemaValidator(z.object({ x: z.number() }), 5000);
    const result = await validator.validate({ x: 42 }, "test");

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("returns issues for invalid data", async () => {
    const validator = new SchemaValidator(z.object({ x: z.number() }), 5000);
    const result = await validator.validate({ x: "not a number" }, "test");

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0]?.guard).toBe("test");
    expect(result.issues[0]?.severity).toBe("error");
  });

  it("times out for slow validation", async () => {
    // Create a schema that would be very slow via a refine
    const slowSchema = z.string().refine(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10_000));
      return true;
    });

    const validator = new SchemaValidator(slowSchema, 50);
    await expect(validator.validate("test", "test")).rejects.toThrow("timed out");
  });

  it("validates complex nested schemas", async () => {
    const schema = z.object({
      user: z.object({
        name: z.string().min(1),
        emails: z.array(z.string().email()),
        address: z.object({
          city: z.string(),
          zip: z.string().regex(/^\d{5}$/),
        }),
      }),
    });

    const validator = new SchemaValidator(schema, 5000);

    const validData = {
      user: {
        name: "Alice",
        emails: ["alice@example.com"],
        address: { city: "Springfield", zip: "12345" },
      },
    };
    const valid = await validator.validate(validData, "test");
    expect(valid.valid).toBe(true);

    const invalidData = {
      user: {
        name: "",
        emails: ["not-an-email"],
        address: { city: "Springfield", zip: "abc" },
      },
    };
    const invalid = await validator.validate(invalidData, "test");
    expect(invalid.valid).toBe(false);
    expect(invalid.issues.length).toBeGreaterThanOrEqual(3);
  });
});
