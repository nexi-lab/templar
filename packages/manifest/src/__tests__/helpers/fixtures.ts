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
