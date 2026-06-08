---
name: ysheng-security-review
description: Review YS Heng code or diffs for security-sensitive behavior. Use for security reviews, threat modeling, vulnerability checks, auth and role policy changes, finance flows, uploads, public API exposure, database persistence, deployment scripts, secrets, backups, or smoke-test trust boundaries.
---

# YS Heng Security Review

## Overview

Review changes against YS Heng's concrete trust boundaries. Focus on exploitable behavior, data exposure, authorization gaps, unsafe uploads, and deployment mistakes.

## Threat Boundaries

- Public app and `/api/public/*` must never expose internal operational, finance, purchase, commission, audit, or private workflow data.
- Back-office `/api/*` requires `BackOffice` unless intentionally public.
- Finance and payment operations require `Finance`.
- Uploads must preserve size limits, MIME validation, ownership metadata, checksums, and category restrictions.
- Backup, restore, Docker, production env, and smoke-test scripts are deployment-sensitive.

## Review Workflow

1. Identify changed files, entrypoints, request sources, auth policies, persistence sinks, and public outputs.
2. Trace sensitive data from source to response, logs, uploads, or persisted records.
3. Check route grouping, role policies, route/body ID validation, and structured error behavior.
4. Check upload category, size, MIME, thumbnail, checksum, and download behavior when relevant.
5. Check environment and deployment changes for placeholder secrets, localhost production URLs, or weakened validation.
6. Report findings first by severity with file and line references.

## Severity Calibration

- Critical or high: unauthorized access to private customer, finance, staff, audit, upload, or operational data; auth bypass; destructive restore risk.
- Medium: weakened validation, ownership mistakes, unsafe file handling, public DTO drift, incomplete policy coverage.
- Low: hardening gaps with limited exploitability or unclear impact.

If the Codex Security plugin is available and the user asks for a formal scan, use the appropriate security scan workflow. Otherwise, perform a manual scoped review from the diff or files provided.
