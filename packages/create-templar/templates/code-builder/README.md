# Code Builder

A scheduled agent that runs nightly builds and test suites, then reports results to Slack.

## Setup

1. Copy `.env.example` to `.env` and fill in your tokens
2. Copy `templar.yaml` to your project root
3. Run `templar start`

## What it does

- Runs every night at 2:00 AM UTC
- Executes the project build and test suite
- Reports results to Slack with failure context
- Suggests fixes for common build errors
