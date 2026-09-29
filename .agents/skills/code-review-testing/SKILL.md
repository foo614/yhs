---
name: code-review-testing
description: Choose proportionate regression coverage for YS Heng code and agent workflow changes.
---

# YS Heng Test Review

Follow the proportionate verification rules in `codex-agent.md`.

- Before proposing any new test case, identify the critical observable failure or serious regression that existing coverage cannot detect. Apply this to cases inside existing files as well as new files.
- Reuse existing xUnit, Vitest, or infra checks and helpers appropriate to the affected path.
- Prefer updating existing coverage. Create a test file only when justified critical coverage cannot fit an existing suite; state the failure it protects against.
- For trivial copy, spacing, styling, and reversible presentation changes, use existing checks and browser inspection. Do not request tests that mirror the implementation or use test count as a reason to remove useful coverage.
- For skill or documentation edits, inspect the diff and instruction consistency. Do not create tests that assert prose or headings.
- Run focused existing checks and report gaps honestly. Do not weaken required CI or release checks.
