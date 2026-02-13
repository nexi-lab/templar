# Research Tracker

A scheduled agent that monitors new research publications and delivers summaries via email and Discord.

## Setup

1. Copy `.env.example` to `.env` and fill in your credentials
2. Copy `templar.yaml` to your project root
3. Run `templar start`

## What it does

- Checks for new publications every 6 hours
- Searches configured research topics and keywords
- Summarizes papers in 2-3 sentences with key findings
- Delivers updates via email and Discord
