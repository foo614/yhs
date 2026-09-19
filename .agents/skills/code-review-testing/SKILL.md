---
name: code-review-testing
description: Choose proportionate regression coverage for YS Heng code and agent workflow changes.
---

# YS Heng Test Review

Follow the proportionate verification rules in `codex-agent.md`.

- Identify the observable behavior and material regression risk before adding coverage.
- Reuse existing xUnit, Vitest, or infra checks and helpers appropriate to the affected path.
- Create a test file only for critical coverage that cannot fit an existing suite; state the risk it protects.
- For skill or documentation edits, inspect the diff and instruction consistency. Do not create tests that assert prose or headings.
- Run focused existing checks and report gaps honestly. Do not weaken required CI or release checks.
