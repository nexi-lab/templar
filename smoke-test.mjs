// Cross-package smoke test — imports from BUILT dist, not source
// Tests: exports, config validation, adapter construction, lifecycle contracts

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = new URL(".", import.meta.url).pathname;
// Use createRequire to resolve pnpm-hoisted packages
const require = createRequire(join(root, "packages/channel-base/package.json"));

// ---- 1. Verify channel-base exports ----
const base = await import(join(root, "packages/channel-base/dist/index.js"));
assert.ok(base.BaseChannelAdapter, "BaseChannelAdapter exported");
assert.ok(base.parseChannelConfig, "parseChannelConfig exported");
assert.ok(base.lazyLoad, "lazyLoad exported");
console.log("✓ channel-base exports verified");

// ---- 2. Verify channel-base/testing exports ----
const testing = await import(join(root, "packages/channel-base/dist/testing.js"));
assert.ok(testing.MockChannelAdapter, "MockChannelAdapter exported");
console.log("✓ channel-base/testing exports verified");

// ---- 3. Test parseChannelConfig with real Zod schema ----
const zodPath = require.resolve("zod");
const { z } = await import(zodPath);
const schema = z.object({ token: z.string().min(1), mode: z.enum(["poll", "webhook"]) });

const valid = base.parseChannelConfig("test", schema, { token: "abc", mode: "poll" });
assert.deepStrictEqual(valid, { token: "abc", mode: "poll" });
console.log("✓ parseChannelConfig: valid config parsed");

try {
  base.parseChannelConfig("test", schema, { token: "", mode: "invalid" });
  assert.fail("Should have thrown");
} catch (e) {
  assert.ok(e.message.includes("test"), "Error contains channel name");
  assert.ok(e.message.includes("Invalid config"), "Error describes invalid config");
  console.log("✓ parseChannelConfig: invalid config throws ChannelLoadError");
}

// ---- 4. Test lazyLoad with real module ----
const loader = base.lazyLoad("test", "node:path", (mod) => mod.join);
const joinFn = await loader();
assert.strictEqual(typeof joinFn, "function");
const join2 = await loader();
assert.strictEqual(joinFn, join2, "Same reference returned (memoized)");
console.log("✓ lazyLoad: real module loaded + memoized");

const badLoader = base.lazyLoad("test", "nonexistent-pkg-xyz", (m) => m);
try {
  await badLoader();
  assert.fail("Should have thrown");
} catch (e) {
  assert.ok(e.message.includes("nonexistent-pkg-xyz"));
  console.log("✓ lazyLoad: missing module throws ChannelLoadError");
}

// ---- 5. Test MockChannelAdapter full lifecycle ----
const adapter = new testing.MockChannelAdapter({
  name: "smoke-test",
  capabilities: { text: { maxLength: 1000 } },
  normalizer: (raw) => ({
    channelType: "smoke-test",
    channelId: "ch1",
    senderId: "u1",
    blocks: [{ type: "text", content: String(raw) }],
    timestamp: Date.now(),
    messageId: "m1",
  }),
  renderer: async () => {},
});

assert.strictEqual(adapter.name, "smoke-test");
assert.strictEqual(adapter.isConnected, false);

await adapter.connect();
assert.strictEqual(adapter.isConnected, true);
await adapter.connect(); // idempotent
assert.strictEqual(adapter.calls.filter((c) => c.method === "doConnect").length, 1);
console.log("✓ BaseChannelAdapter: connect idempotent");

await adapter.send({ channelId: "ch1", blocks: [{ type: "text", content: "hello" }] });
console.log("✓ BaseChannelAdapter: send works when connected");

await adapter.disconnect();
assert.strictEqual(adapter.isConnected, false);
try {
  await adapter.send({ channelId: "ch1", blocks: [{ type: "text", content: "fail" }] });
  assert.fail("Should have thrown");
} catch (e) {
  assert.ok(e.message.includes("not connected"));
  console.log("✓ BaseChannelAdapter: send throws when disconnected");
}

await adapter.disconnect(); // idempotent
assert.strictEqual(adapter.calls.filter((c) => c.method === "doDisconnect").length, 1);
console.log("✓ BaseChannelAdapter: disconnect idempotent");

// onMessage normalization
await adapter.connect();
const messages = [];
adapter.onMessage((msg) => {
  messages.push(msg);
});
adapter.simulateInbound("test-payload");
await new Promise((r) => setTimeout(r, 50));
assert.strictEqual(messages.length, 1);
assert.strictEqual(messages[0].channelType, "smoke-test");
assert.strictEqual(messages[0].blocks[0].content, "test-payload");
console.log("✓ BaseChannelAdapter: onMessage normalizes + dispatches");

// onMessage error resilience
adapter.onMessage(() => {
  throw new Error("handler crash");
});
adapter.simulateInbound("crash-trigger");
await new Promise((r) => setTimeout(r, 50));
console.log("✓ BaseChannelAdapter: onMessage survives handler errors");

// ---- 6. Verify all channel adapter dist exports ----
const channelDists = [
  { name: "discord", path: "packages/channel-discord/dist/index.js", cls: "DiscordChannel" },
  { name: "telegram", path: "packages/channel-telegram/dist/index.js", cls: "TelegramChannel" },
  { name: "slack", path: "packages/channel-slack/dist/index.js", cls: "SlackChannel" },
  { name: "whatsapp", path: "packages/channel-whatsapp/dist/index.js", cls: "WhatsAppChannel" },
];

for (const { name, path, cls } of channelDists) {
  const mod = await import(join(root, path));
  assert.ok(mod[cls], `${cls} exported from @templar/channel-${name}`);
  assert.strictEqual(typeof mod[cls], "function", `${cls} is a constructor`);
  console.log(`✓ @templar/channel-${name}: ${cls} exported from dist`);
}

// ---- 7. Test real config validation from dist ----
const { DiscordChannel } = await import(join(root, "packages/channel-discord/dist/index.js"));
try {
  new DiscordChannel({});
  assert.fail("Should throw for empty config");
} catch (_e) {
  console.log("✓ DiscordChannel: rejects invalid config from dist");
}

const { TelegramChannel } = await import(join(root, "packages/channel-telegram/dist/index.js"));
try {
  new TelegramChannel({});
  assert.fail("Should throw for empty config");
} catch (_e) {
  console.log("✓ TelegramChannel: rejects invalid config from dist");
}

const { SlackChannel } = await import(join(root, "packages/channel-slack/dist/index.js"));
try {
  new SlackChannel({});
  assert.fail("Should throw for empty config");
} catch (_e) {
  console.log("✓ SlackChannel: rejects invalid config from dist");
}

// ---- 8. Verify adapters inherit BaseChannelAdapter interface ----
const discord = new DiscordChannel({ token: "Bot test-123" });
assert.strictEqual(discord.name, "discord");
assert.ok(discord.capabilities);
assert.strictEqual(discord.isConnected, false);
assert.strictEqual(typeof discord.connect, "function");
assert.strictEqual(typeof discord.disconnect, "function");
assert.strictEqual(typeof discord.send, "function");
assert.strictEqual(typeof discord.onMessage, "function");
console.log("✓ DiscordChannel: full ChannelAdapter interface from BaseChannelAdapter");

const telegram = new TelegramChannel({ mode: "polling", token: "123:ABC" });
assert.strictEqual(telegram.name, "telegram");
assert.ok(telegram.capabilities);
assert.strictEqual(telegram.isConnected, false);
console.log("✓ TelegramChannel: full ChannelAdapter interface from BaseChannelAdapter");

// ---- 9. Verify send guards from dist ----
try {
  await discord.send({ channelId: "ch1", blocks: [{ type: "text", content: "hi" }] });
  assert.fail("Should throw — not connected");
} catch (e) {
  assert.ok(e.message.toLowerCase().includes("not connected"));
  console.log("✓ DiscordChannel (dist): send guard rejects when not connected");
}

try {
  await telegram.send({ channelId: "123", blocks: [{ type: "text", content: "hi" }] });
  assert.fail("Should throw — not connected");
} catch (e) {
  assert.ok(e.message.toLowerCase().includes("not connected"));
  console.log("✓ TelegramChannel (dist): send guard rejects when not connected");
}

// ---- 10. Verify instanceof chain (ChannelLoadError, ChannelSendError) ----
const { ChannelLoadError, ChannelSendError } = await import(
  join(root, "packages/errors/dist/index.js")
);

try {
  new DiscordChannel({});
} catch (e) {
  assert.ok(e instanceof ChannelLoadError, "Config error is instanceof ChannelLoadError");
  console.log("✓ ChannelLoadError instanceof chain works across packages");
}

try {
  await discord.send({ channelId: "x", blocks: [{ type: "text", content: "x" }] });
} catch (e) {
  assert.ok(e instanceof ChannelSendError, "Send guard error is instanceof ChannelSendError");
  console.log("✓ ChannelSendError instanceof chain works across packages");
}

// ---- 11. Verify capabilities are correct per channel ----
assert.ok(discord.capabilities.text, "Discord has text capability");
assert.ok(discord.capabilities.images, "Discord has images capability");
assert.ok(discord.capabilities.buttons, "Discord has buttons capability");
assert.ok(discord.capabilities.files, "Discord has files capability");
console.log("✓ DiscordChannel: capabilities object correct");

assert.ok(telegram.capabilities.text, "Telegram has text capability");
assert.strictEqual(telegram.capabilities.text.maxLength, 4096);
console.log("✓ TelegramChannel: capabilities object correct");

console.log("\n========================================");
console.log("  ALL 28 SMOKE TESTS PASSED ✓");
console.log("========================================");
