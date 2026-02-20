/**
 * Code-mode system prompt generation
 *
 * Generates the system prompt that instructs the LLM to produce Python code
 * instead of sequential tool calls.
 */

/** Python signature definitions for host functions */
const HOST_FUNCTION_SIGNATURES: Readonly<Record<string, string>> = {
  read_file: 'def read_file(path: str) -> str:\n    """Read a file and return its contents."""',
  search:
    'def search(query: str, path: str = ".") -> list[str]:\n    """Search for files matching a query pattern. Returns list of file paths."""',
  memory_query:
    'def memory_query(query: str, limit: int = 10) -> list[dict]:\n    """Query agent memory. Returns list of memory entries."""',
};

/**
 * Generate Python function signatures for the configured host functions.
 */
export function generateFunctionSignatures(hostFunctions: readonly string[]): string {
  return hostFunctions
    .map((fn) => HOST_FUNCTION_SIGNATURES[fn])
    .filter((sig): sig is string => sig !== undefined)
    .join("\n\n");
}

/**
 * Generate the complete code-mode system prompt.
 *
 * This prompt is injected into model calls to instruct the LLM to emit
 * Python code blocks instead of sequential tool calls when beneficial.
 */
export function generateCodeModePrompt(hostFunctions: readonly string[]): string {
  const signatures = generateFunctionSignatures(hostFunctions);

  return `## Code Mode

When a task requires 3+ sequential tool calls, you may write a Python code block instead.
The code will execute in a secure Monty sandbox with sub-microsecond startup.

### Available functions:

\`\`\`python
${signatures}
\`\`\`

### Rules:
- Output results as JSON to stdout via \`print(json.dumps(...))\`
- Do NOT import modules (json is pre-loaded)
- Do NOT define classes
- Use only the provided host functions
- Keep code under 10,000 characters

### Output format:
Wrap your code in a fenced code block with the language \`python-code-mode\`:

\`\`\`python-code-mode
result = read_file("src/main.ts")
files = search("*.test.ts")
print(json.dumps({"content": result, "test_files": files}))
\`\`\``;
}
