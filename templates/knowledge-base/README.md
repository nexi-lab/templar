# Knowledge Base

A conversational agent that answers questions from your indexed documents using RAG (retrieval-augmented generation).

## Setup

1. Copy `.env.example` to `.env` and fill in your tokens
2. Copy `templar.yaml` to your project root
3. Place documents in `./data/` and build the index
4. Run `templar start`

## What it does

- Listens for questions in Slack
- Searches indexed documents for relevant context
- Provides cited answers with source references
- Remembers conversation context per user
