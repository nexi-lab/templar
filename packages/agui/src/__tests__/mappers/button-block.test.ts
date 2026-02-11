import type { ButtonBlock } from "@templar/core";
import { describe, expect, it } from "vitest";
import { mapBlockToEvents } from "../../mappers/to-agui.js";
import { EventType } from "../../protocol/types.js";

describe("ButtonBlock → AG-UI events", () => {
  const block: ButtonBlock = {
    type: "button",
    buttons: [
      { label: "Yes", action: "confirm", style: "primary" },
      { label: "No", action: "cancel", style: "danger" },
    ],
  };

  it("produces a single CUSTOM event", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe(EventType.CUSTOM);
  });

  it("sets the custom event name to 'templar.buttons'", () => {
    const events = mapBlockToEvents(block, "msg-1");
    expect((events[0] as { name: string }).name).toBe("templar.buttons");
  });

  it("includes button data in the value", () => {
    const events = mapBlockToEvents(block, "msg-1");
    const value = (events[0] as { value: unknown }).value as {
      messageId: string;
      buttons: Array<{ label: string; action: string; style?: string }>;
    };
    expect(value.messageId).toBe("msg-1");
    expect(value.buttons).toHaveLength(2);
    expect(value.buttons[0]).toEqual({
      label: "Yes",
      action: "confirm",
      style: "primary",
    });
    expect(value.buttons[1]).toEqual({
      label: "No",
      action: "cancel",
      style: "danger",
    });
  });

  it("handles a single button", () => {
    const single: ButtonBlock = {
      type: "button",
      buttons: [{ label: "OK", action: "ok" }],
    };
    const events = mapBlockToEvents(single, "msg-1");
    expect(events).toHaveLength(1);
    const value = (events[0] as { value: unknown }).value as {
      buttons: Array<{ label: string }>;
    };
    expect(value.buttons).toHaveLength(1);
  });

  it("handles buttons without style", () => {
    const noStyle: ButtonBlock = {
      type: "button",
      buttons: [{ label: "Click", action: "click" }],
    };
    const events = mapBlockToEvents(noStyle, "msg-1");
    const value = (events[0] as { value: unknown }).value as {
      buttons: Array<{ label: string; action: string; style?: string }>;
    };
    expect(value.buttons[0]?.style).toBeUndefined();
  });

  it("handles empty buttons array", () => {
    const empty: ButtonBlock = {
      type: "button",
      buttons: [],
    };
    const events = mapBlockToEvents(empty, "msg-1");
    expect(events).toHaveLength(1);
    const value = (events[0] as { value: unknown }).value as {
      buttons: unknown[];
    };
    expect(value.buttons).toHaveLength(0);
  });
});
