# Inbox Assistant

A scheduled agent that triages your email inbox and drafts replies for action items.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials
2. Copy `templar.yaml` to your project root
3. Run `templar start`

## What it does

- Checks for new emails every 30 minutes
- Categorizes each email by priority level
- Drafts reply suggestions for action-required items
- Never sends emails automatically (human-in-the-loop)
