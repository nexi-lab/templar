/**
 * YAML fixture strings for manifest tests.
 */

export const VALID_MINIMAL_YAML = `
name: test-agent
version: 1.0.0
description: A test agent
`;

export const VALID_FULL_YAML = `
name: research-agent
version: 2.1.0
description: An AI agent that searches and summarizes research papers

model:
  provider: anthropic
  name: claude-sonnet-4-20250514
  temperature: 0.7
  maxTokens: 4096

tools:
  - name: web_search
    description: Search the web for information
    parameters:
      query: string
  - name: file_read
    description: Read a file from disk

channels:
  - type: slack
    config:
      mode: socket
      token: test-token

middleware:
  - name: memory
    config:
      scope: per-user
  - name: audit

permissions:
  allowed:
    - web_search
    - file_read
  denied:
    - file_write
`;

export const YAML_WITH_ENV_VARS = `
name: env-agent
version: 1.0.0
description: Agent with env vars

channels:
  - type: slack
    config:
      token: \${SLACK_BOT_TOKEN}
      region: \${REGION:us-east-1}
`;

export const INVALID_YAML_SYNTAX = `
name: broken
version: "1.0.0
  description: unclosed quote
`;

export const INVALID_SCHEMA_YAML = `
version: 1.0.0
description: Missing name field
`;

export const YAML_MISSING_REQUIRED = `
name: ""
version: not-semver
`;

// ---------------------------------------------------------------------------
// Bootstrap file fixtures
// ---------------------------------------------------------------------------

export const BOOTSTRAP_TEMPLAR_MD =
  "# Agent Instructions\n\nYou are a helpful assistant that follows the Templar protocol.";

export const BOOTSTRAP_TOOLS_MD =
  "# Tools\n\n## web_search\nSearch the web for information.\n\n## file_read\nRead a file from disk.";

export const BOOTSTRAP_CONTEXT_MD = "# Context\n\nProject: Templar\nWorkspace: /home/user/project";

export const OVERSIZED_CONTENT = "x".repeat(15_000);

export const BINARY_CONTENT = "Hello\0World";

export const BOM_CONTENT = "\uFEFF# Agent Instructions\n\nWith BOM prefix.";

// ---------------------------------------------------------------------------
// Sugar syntax fixtures
// ---------------------------------------------------------------------------

export const YAML_WITH_MODEL_STRING = `
name: sugar-model
version: 1.0.0
description: Model as slash string
model: anthropic/claude-sonnet-4-5
`;

export const YAML_WITH_MODEL_INFERRED = `
name: sugar-model-inferred
version: 1.0.0
description: Model with inferred provider
model: claude-sonnet-4-5
`;

export const YAML_WITH_CHANNELS_ARRAY = `
name: sugar-channels
version: 1.0.0
description: Channels as string array
channels:
  - slack
  - telegram
`;

export const YAML_WITH_PROMPT = `
name: sugar-prompt
version: 1.0.0
description: Top-level prompt sugar
prompt: You are a helpful assistant that summarizes documents.
`;

export const YAML_WITH_SCHEDULE = `
name: sugar-schedule
version: 1.0.0
description: Scheduled agent
schedule: "0 9 * * 1-5"
`;

export const YAML_WITH_ALL_SUGAR = `
name: sugar-all
version: 1.0.0
description: All sugar syntax combined
model: anthropic/claude-sonnet-4-5
channels:
  - slack
  - email
prompt: You are a helpful assistant.
schedule: "0 8 * * *"
`;
