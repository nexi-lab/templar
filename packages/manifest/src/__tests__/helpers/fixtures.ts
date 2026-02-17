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

// ---------------------------------------------------------------------------
// Governance fixtures — template syntax violations (string scanner)
// ---------------------------------------------------------------------------

export const YAML_WITH_DOUBLE_BRACE = `
name: bad-template
version: 1.0.0
description: Uses GitHub Actions style expression
model:
  provider: \${{ secrets.PROVIDER }}
  name: claude-sonnet-4-5
`;

export const YAML_WITH_JINJA2_VAR = `
name: bad-jinja
version: 1.0.0
description: Uses Jinja2 variable syntax
model:
  provider: "{{ provider_name }}"
  name: claude-sonnet-4-5
`;

export const YAML_WITH_JINJA2_BLOCK = `
name: bad-jinja-block
version: 1.0.0
description: Uses Jinja2 block syntax
tools:
  {% for tool in tools %}
  - name: {{ tool.name }}
  {% endfor %}
`;

export const YAML_WITH_LOWERCASE_ENV = `
name: bad-env-case
version: 1.0.0
description: Uses lowercase env var
channels:
  - type: slack
    config:
      token: \${slack_token}
`;

export const YAML_WITH_COMPLEX_EXPR = `
name: bad-complex
version: 1.0.0
description: Uses complex expression in env var
channels:
  - type: slack
    config:
      token: \${config.slack.token}
`;

export const YAML_WITH_FUNC_CALL_ENV = `
name: bad-func
version: 1.0.0
description: Uses function call in env var
channels:
  - type: slack
    config:
      token: \${getSecret()}
`;

export const YAML_WITH_VALID_ENV_VARS_GOVERNANCE = `
name: good-env
version: 1.0.0
description: Uses valid UPPER_SNAKE_CASE env vars
channels:
  - type: slack
    config:
      token: \${SLACK_BOT_TOKEN}
      region: \${AWS_REGION:us-east-1}
      id: \${MY_VAR_123}
`;

export const YAML_WITH_GO_TEMPLATE = `
name: bad-go-template
version: 1.0.0
description: Uses Go template syntax
model:
  provider: "{{ .Provider }}"
  name: claude-sonnet-4-5
`;

// ---------------------------------------------------------------------------
// Governance fixtures — semantic key violations (AST walker)
// ---------------------------------------------------------------------------

export const YAML_WITH_IF_KEY = `
name: bad-conditional
version: 1.0.0
description: Has conditional if key
if: production
tools:
  - name: search
    description: Search tool
`;

export const YAML_WITH_WHEN_KEY = `
name: bad-when
version: 1.0.0
description: Has when conditional
tools:
  - name: search
    description: Search tool
    when: enabled
`;

export const YAML_WITH_UNLESS_KEY = `
name: bad-unless
version: 1.0.0
description: Has unless conditional
tools:
  - name: search
    description: Search tool
    unless: disabled
`;

export const YAML_WITH_FOR_KEY = `
name: bad-for-loop
version: 1.0.0
description: Has for loop key
for: each_channel
tools:
  - name: search
    description: Search tool
`;

export const YAML_WITH_EACH_KEY = `
name: bad-each
version: 1.0.0
description: Has each loop key
channels:
  - type: slack
    config:
      each: item
`;

export const YAML_WITH_FOREACH_KEY = `
name: bad-foreach
version: 1.0.0
description: Has forEach key
channels:
  - type: slack
    config:
      forEach: channel
`;

export const YAML_WITH_MAP_KEY = `
name: bad-map
version: 1.0.0
description: Has map key
channels:
  - type: slack
    config:
      map: transform
`;

export const YAML_WITH_NESTED_VIOLATION = `
name: bad-nested
version: 1.0.0
description: Has nested conditional
channels:
  - type: slack
    config:
      settings:
        if: debug
        verbose: true
`;

// ---------------------------------------------------------------------------
// Governance fixtures — code injection patterns (AST walker on values)
// ---------------------------------------------------------------------------

export const YAML_WITH_EVAL_VALUE = `
name: bad-eval
version: 1.0.0
description: Has eval in a value
tools:
  - name: dynamic
    description: eval(getToolConfig())
`;

export const YAML_WITH_EXEC_VALUE = `
name: bad-exec
version: 1.0.0
description: Has exec in a value
tools:
  - name: runner
    description: exec(command)
`;

export const YAML_WITH_FUNCTION_VALUE = `
name: bad-function
version: 1.0.0
description: Has Function constructor in a value
tools:
  - name: dynamic
    description: Function("return 42")
`;

export const YAML_WITH_NEW_FUNCTION_VALUE = `
name: bad-new-function
version: 1.0.0
description: Has new Function in a value
tools:
  - name: dynamic
    description: new Function("return 42")
`;

// ---------------------------------------------------------------------------
// Governance fixtures — false positive resistance
// ---------------------------------------------------------------------------

export const YAML_WITH_EVAL_IN_PROSE = `
name: safe-prose
version: 1.0.0
description: "Helps developers avoid unsafe patterns like eval() in JavaScript code"
`;

export const YAML_WITH_MULTIPLE_VIOLATIONS = `
name: multi-bad
version: 1.0.0
description: "deploy \${{ secrets.TOKEN }}"
if: production
tools:
  - name: search
    description: Search tool
`;
