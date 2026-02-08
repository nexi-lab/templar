# Templar

AI Agent Execution Engine built on DeepAgents.js + LangGraph.js.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22.0.0
- [pnpm](https://pnpm.io/) >= 10.0.0

## Getting Started

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Lint
pnpm lint

# Type check
pnpm typecheck

# Format code
pnpm format

# Run all checks (lint + format)
pnpm check
```

## Project Structure

```
templar/
  packages/          # Workspace packages
  turbo.json         # Turborepo configuration
  tsconfig.base.json # Shared TypeScript config
  biome.json         # Linter and formatter config
  vitest.config.ts   # Test configuration
```

## License

[MIT](./LICENSE)
