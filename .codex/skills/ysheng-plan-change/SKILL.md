---
name: ysheng-plan-change
description: Plan substantial YS Heng repository changes before implementation. Use when a task may touch multiple files, cross frontend/backend contracts, deployment, auth, finance, uploads, public data exposure, database behavior, or when the user asks to plan before editing.
---

# YS Heng Plan Change

## Overview

Create a short implementation plan before making risky or multi-file YS Heng changes. Keep the plan practical enough to guide editing and validation without turning every small fix into ceremony.

## Workflow

1. Read `AGENTS.md`, `codex-agent.md`, and the domain skill that matches the task.
2. Inspect only the files needed to understand the current behavior.
3. Identify the smallest coherent change, likely files, API or data contracts, and validation commands.
4. Call out any high-risk gate from `codex-agent.md` and pause for approval when required.
5. Present the plan briefly, then proceed when the user asked for execution or has already approved the direction.

## Plan Shape

- Scope: what behavior changes and what stays untouched.
- Files: likely edit and test/doc locations.
- Risks: public/private data, auth, finance, upload, persistence, deployment, or contract concerns.
- Validation: the smallest commands that prove the change.

## Keep It Light

Skip a formal plan for narrow, obvious fixes unless the user asks for one. For pasted build errors, start with the failing file or route and keep the plan focused on that failure.
