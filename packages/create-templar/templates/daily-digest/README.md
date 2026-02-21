# Daily Digest

A scheduled agent that delivers a morning summary of activity across your Slack workspace.

## Setup

1. Copy `.env.example` to `.env` and fill in your tokens
2. Copy `templar.yaml` to your project root
3. Run `templar start`

## What it does

- Runs every morning at 8:00 AM UTC
- Collects messages from the past 24 hours
- Groups updates by channel and priority
- Posts a concise summary to Slack
