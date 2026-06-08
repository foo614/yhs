---
name: ysheng-polish-prose
description: Polish YS Heng prose in documentation, instructions, comments, PR text, commit messages, and user-facing copy. Use when writing or editing Markdown, docs, release notes, AGENTS.md, codex-agent.md, skill text, comments, or copy that should sound concise and human.
---

# YS Heng Polish Prose

## Overview

Make project prose clear, specific, and teammate-readable. Preserve technical meaning and avoid generic AI writing patterns.

## Style

- Use plain, direct sentences.
- Prefer concrete nouns and verbs over broad claims.
- Remove filler such as "it is worth noting", "seamless", "robust", "leverage", and vague superlatives.
- Avoid em dashes unless quoting existing text or matching an established style.
- Avoid binary contrast filler such as "not only X but also Y" unless it adds real meaning.
- Keep docs parse-safe with simple Markdown headings, bullets, tables, and fenced code blocks.

## Project Fit

- For public front-office copy, stay practical and sales-focused.
- For back-office copy, prioritize operational clarity.
- For API and deployment docs, include exact commands, paths, URLs, ports, and risk notes.
- For Codex guidance, keep behavior portable in the repo and do not depend on personal global config.

## Editing Rules

Do not change technical facts while polishing wording. If a sentence is ambiguous because the underlying behavior is unclear, inspect the source or flag the uncertainty.
