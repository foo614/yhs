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
3. Challenge unclear or conflicting requirements when the answer changes behavior, permissions, data, architecture, or acceptance criteria. Ask one focused question and recommend the simplest option; state assumptions and proceed for minor details.
4. Identify the smallest coherent change, likely files, API or data contracts, and validation commands. Prefer existing components and direct solutions; explain why any new abstraction or dependency is necessary.
5. Apply the model and critical-coverage policies in `codex-agent.md`. Planning does not require a separate agent or the highest reasoning effort.
6. Call out any high-risk gate and ask only for authorization or decisions not already supplied in the conversation. Continue independent work while awaiting a required answer.
7. Present the plan briefly, then proceed when the user asked for execution or has already approved the direction.

## Product Briefs

For major new modules, cross-role workflows, or unclear product scope, use `.agents/skills/prd-development/SKILL.md` as an auxiliary PRD workflow before implementation. Keep the result lightweight and YS Heng-specific; do not turn small bug fixes into PRD work.

## Plan Shape

- Scope: what behavior changes and what stays untouched.
- Acceptance: the observable result, material assumptions, and unresolved decisions.
- Files: likely edit and test/doc locations.
- Risks: public/private data, auth, finance, upload, persistence, deployment, or contract concerns.
- Validation: the smallest commands that prove the change.

## Keep It Light

Skip a formal plan for narrow, obvious fixes unless the user asks for one. For pasted build errors, start with the failing file or route and keep the plan focused on that failure.
