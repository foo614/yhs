---
name: ysheng-fix-ci
description: Diagnose and fix failing YS Heng CI or validation checks. Use when the user shares GitHub Actions failures, local build/test/lint errors, deployment smoke failures, or asks Codex to fix CI for this repository.
---

# YS Heng Fix CI

## Overview

Turn CI output into a focused repo fix. Prefer the failing route, package, project, or test shown in the logs over broad refactors.

## Workflow

1. Read `AGENTS.md`, `codex-agent.md`, and the relevant domain skill.
2. Capture the exact failing command, package, file, route, and error message.
3. Reproduce locally only when validation is requested or needed to understand the failure.
4. Classify the failure as code, environment, dependency/network, permission, or ambiguous.
5. Patch the smallest responsible code path and add or update tests only when behavior changed.
6. Re-run the failing check or explain why it could not be run.

## Useful Commands

Use the command that matches the failure:

```powershell
npm --workspace apps/frontoffice run build
npm --workspace apps/backoffice run test
npm --workspace apps/backoffice run build
dotnet test services\api\YSHeng.sln
npm run build
npm run lint
```

## Notes

- If GitHub Actions context is needed and the GitHub plugin or `gh` is available, inspect the failing job before editing.
- If local Next or Vitest fails with environment-specific `spawn EPERM`, use the logs carefully and prefer GitHub Actions as the decisive verifier when available.
- Keep unrelated workspace changes unstaged and untouched.
