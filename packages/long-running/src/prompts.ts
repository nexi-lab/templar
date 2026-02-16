import type { ResolvedLongRunningConfig, SessionBootstrapContext } from "./types.js";

/**
 * Build the system prompt for initializer mode (first session).
 *
 * Instructs the agent to analyze the spec, generate a feature list,
 * create init.sh for build/run/test, and commit the scaffolding.
 */
export function buildInitializerPrompt(config: ResolvedLongRunningConfig): string {
  return `# Long-Running Agent: Initializer Mode

You are starting the FIRST SESSION of a multi-session implementation task.

## Your Goals

1. **Analyze the specification** in the workspace at \`${config.workspace}\`
2. **Generate a feature list** as structured JSON at \`${config.featureListPath}\`
   - Each feature must have: id, category, description, priority, steps, passes (initially false)
   - Categories: "functional", "non-functional", "infrastructure"
   - Order by priority (1 = highest)
3. **Create \`${config.initScriptPath}\`** — a bootstrap script that:
   - Installs dependencies
   - Runs the build
   - Runs the test suite
   - Validates the development environment
4. **Create an initial progress entry** summarizing what you set up
5. **Git commit** all scaffolding files

## Constraints

- Be THOROUGH in breaking down features — each should be completable in a single session
- Do NOT attempt to implement any features — that's for subsequent sessions
- Focus on creating a comprehensive, well-prioritized feature list
- Each feature should have clear, actionable implementation steps

## Feature List Format

\`\`\`json
{
  "features": [
    {
      "id": "feat-1",
      "category": "functional",
      "description": "Clear description of what to build",
      "priority": 1,
      "steps": ["Step 1", "Step 2", "Step 3"],
      "passes": false
    }
  ],
  "createdAt": "ISO 8601",
  "lastUpdatedAt": "ISO 8601"
}
\`\`\``;
}

/**
 * Build the system prompt for coder mode (subsequent sessions).
 *
 * Includes progress summary, next features, and the one-feature-per-session constraint.
 */
export function buildCoderPrompt(context: SessionBootstrapContext): string {
  const { totalFeatures, completedFeatures, nextFeatures, recentProgress } = context;
  const percentage =
    totalFeatures === 0 ? 0 : ((completedFeatures / totalFeatures) * 100).toFixed(1);

  // Format next features
  const nextFeaturesBlock = nextFeatures
    .map(
      (f, i) =>
        `${i + 1}. **[${f.id}]** (${f.category}, priority ${f.priority})\n   ${f.description}\n   Steps: ${f.steps.join(" → ")}`,
    )
    .join("\n\n");

  // Format recent progress
  const recentProgressBlock = recentProgress
    .slice(-3)
    .map(
      (p) =>
        `- **Session ${p.sessionNumber}** (${p.timestamp}): ${p.whatWasDone}\n  State: ${p.currentState}\n  Next: ${p.nextSteps}`,
    )
    .join("\n\n");

  return `# Long-Running Agent: Coder Mode

## Progress Summary

**${completedFeatures}/${totalFeatures} features passing (${percentage}%)**

## Next Features to Implement

${nextFeaturesBlock || "(All features are complete!)"}

## Recent Progress

${recentProgressBlock || "(No previous progress entries)"}

## Instructions

1. Pick **ONE** feature from the list above (start with the highest priority incomplete feature)
2. Implement it fully with tests
3. Verify tests pass
4. Mark the feature as passing using the \`updateFeatureStatus\` tool
5. Update progress using the \`updateProgress\` tool
6. Git commit your changes using the \`gitCommit\` tool

## Critical Constraints

- **Do NOT attempt more than ${context.mode === "coder" ? "one" : "any"} feature per session**
- Each feature must have test evidence before being marked as passing
- If you run out of context, update progress with your current state so the next session can continue
- Commit your work frequently to avoid losing progress`;
}
