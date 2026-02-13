---
name: full-skill
description: A skill with all optional fields populated for comprehensive testing.
license: Apache-2.0
compatibility: Requires git and access to the internet
metadata:
  author: templar-team
  version: "1.0"
  category: testing
allowed-tools: Bash(git:*) Read Write
---

# Full Skill

This skill exercises every optional field in the Agent Skills specification.

## Step-by-step instructions

1. Read the input file
2. Process the content
3. Output the result

## Examples

Input: "Hello world"
Output: "Processed: Hello world"

## Edge cases

- Empty input should return an empty result
- Very large input should be chunked
