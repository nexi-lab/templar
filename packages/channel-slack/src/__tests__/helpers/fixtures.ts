import type { SlackFile, SlackMessageEvent } from "../../normalizer.js";

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_CHANNEL = "C1234567890";
const DEFAULT_USER = "U1234567890";
const DEFAULT_TS = "1700000000.000001";

// ---------------------------------------------------------------------------
// Message event factories
// ---------------------------------------------------------------------------

export interface TextEventOptions {
  readonly channel?: string;
  readonly user?: string;
  readonly ts?: string;
  readonly threadTs?: string;
}

export function createSlackMessageEvent(
  text: string,
  opts: TextEventOptions = {},
): SlackMessageEvent {
  return {
    type: "message",
    text,
    channel: opts.channel ?? DEFAULT_CHANNEL,
    user: opts.user ?? DEFAULT_USER,
    ts: opts.ts ?? DEFAULT_TS,
    ...(opts.threadTs != null ? { thread_ts: opts.threadTs } : {}),
  };
}

export interface FileEventOptions {
  readonly channel?: string;
  readonly user?: string;
  readonly ts?: string;
  readonly threadTs?: string;
  readonly name?: string;
  readonly mimetype?: string;
  readonly size?: number;
}

export function createSlackFileEvent(
  fileId: string,
  opts: FileEventOptions = {},
): SlackMessageEvent {
  const file: SlackFile = {
    id: fileId,
    name: opts.name ?? "test-file.pdf",
    mimetype: opts.mimetype ?? "application/pdf",
    size: opts.size ?? 1024,
    url_private: `https://files.slack.com/files-pri/T0/F0/${fileId}`,
    url_private_download: `https://files.slack.com/files-pri/T0/F0/download/${fileId}`,
  };

  return {
    type: "message",
    subtype: "file_share",
    text: "",
    channel: opts.channel ?? DEFAULT_CHANNEL,
    user: opts.user ?? DEFAULT_USER,
    ts: opts.ts ?? DEFAULT_TS,
    files: [file],
    ...(opts.threadTs != null ? { thread_ts: opts.threadTs } : {}),
  };
}

export interface ThreadEventOptions {
  readonly channel?: string;
  readonly user?: string;
  readonly ts?: string;
}

export function createSlackThreadEvent(
  text: string,
  threadTs: string,
  opts: ThreadEventOptions = {},
): SlackMessageEvent {
  return createSlackMessageEvent(text, { ...opts, threadTs });
}

export interface ReactionEventOptions {
  readonly channel?: string;
  readonly user?: string;
  readonly ts?: string;
}

export function createSlackReactionEvent(
  emoji: string,
  _opts: ReactionEventOptions = {},
): Record<string, unknown> {
  return {
    type: "reaction_added",
    reaction: emoji,
    user: _opts.user ?? DEFAULT_USER,
    item: {
      type: "message",
      channel: _opts.channel ?? DEFAULT_CHANNEL,
      ts: _opts.ts ?? DEFAULT_TS,
    },
  };
}
