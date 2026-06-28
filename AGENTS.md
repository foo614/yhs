# YS Heng Codex Instructions

Codex must read and follow `codex-agent.md` before planning, editing, reviewing, or running commands in this repository.

## Project guidance

- Treat this repository as the shared project directory layer for all teammates.
- Use `codex-agent.md` as the mandatory project ruleset and specification.
- Use project-local skills under `.codex/skills/` for task-specific workflows.
- Use project-installed ecosystem skills under `.agents/skills/` only as auxiliary workflows.
- Do not rely on teammate-specific global files under `~/.codex` for required project behavior.

## Local skills

- Use `.codex/skills/ysheng-project/SKILL.md` for repository orientation, local URLs, Docker, deployment, and cross-stack verification.
- Use `.codex/skills/ysheng-api/SKILL.md` for backend API, EF Core, auth policies, uploads, business rules, and backend tests.
- Use `.codex/skills/ysheng-backoffice/SKILL.md` for the operations portal, Ant Design UI, API client contracts, finance-sensitive flows, and portal tests.
- Use `.codex/skills/ysheng-frontoffice/SKILL.md` for the public vehicle sales app, public API usage, lead capture, photos, and public-data safety.
- Use `.codex/skills/ysheng-plan-change/SKILL.md` for substantial or risky repo changes that need a written plan before editing.
- Use `.codex/skills/ysheng-fix-ci/SKILL.md` for failing CI, build, lint, test, or smoke-check diagnosis.
- Use `.codex/skills/ysheng-loop-triage/SKILL.md` for read-only loop-engineering discovery, recurring automation triage, and guidance-drift checks.
- Use `.codex/skills/ysheng-address-review/SKILL.md` for GitHub PR review comments and requested changes.
- Use `.codex/skills/ysheng-frontend-design/SKILL.md` for front-office or back-office visual design and interaction changes.
- Use `.codex/skills/ysheng-polish-prose/SKILL.md` for docs, instructions, comments, commit text, and user-facing copy.
- Use `.codex/skills/ysheng-security-review/SKILL.md` for security-sensitive review of auth, finance, uploads, public data, persistence, deployment, secrets, and backups.

## Installed ecosystem skills

- Use `.agents/skills/prd-development/SKILL.md` when a major feature needs a PRD-style product brief before engineering work.
- Use `.agents/skills/code-review-testing/SKILL.md` as auxiliary test/review guidance when changing agent or workflow logic.
- Use `.agents/skills/shadcn-ui/SKILL.md` only as optional shadcn/ui reference material; the current YS Heng back office remains Ant Design-first unless a task explicitly changes that.

## Loop engineering

- Use `docs/CODEX_LOOP_ENGINEERING.md` for Codex automation, worktree, subagent, and loop-state guidance.
- Keep recurring loops read-only by default. Use worktrees for isolated implementation after a human approves a finding.

## Compatibility note

`AGENTS.md` is the official Codex-discovered project instruction file. `codex-agent.md` contains the full ruleset so the team can maintain one comprehensive specification while keeping this entrypoint short.
