---
name: ysheng-frontend-design
description: Improve YS Heng frontend UI quality and interaction design. Use when changing visual design, layouts, forms, dashboards, vehicle listings, lead capture, Ant Design screens, responsive behavior, or user-facing copy in apps/frontoffice or apps/backoffice.
---

# YS Heng Frontend Design

## Overview

Design YS Heng interfaces that match their job: public vehicle sales pages should be clear and persuasive, while the back office should be dense, calm, and efficient for repeated staff work.

## Front Office

- Prioritize vehicle photos, price, availability, key details, and lead capture.
- Keep copy practical and sales-focused.
- Preserve public data safety; never reveal purchase price, commission, refurbishment, audit, finance, or internal workflow details.
- Handle missing photos and unavailable API responses cleanly using existing fallback patterns.

## Back Office

- Prefer Ant Design and Pro Components patterns already in the app.
- Use tables, filters, forms, tags, alerts, and compact summaries for operational scanning.
- Keep finance, role, document, and payment UI explicit about permission-sensitive actions.
- Surface backend validation messages rather than hiding failures behind demo data.

## Design Rules

- Match the existing app's typography, spacing, components, and color system unless the task is a redesign.
- Use icons, toggles, segmented controls, menus, tabs, sliders, and status indicators where they make controls clearer.
- Keep responsive layouts stable; text must fit within buttons, cards, tables, and forms on mobile and desktop.
- Do not create marketing landing pages for operational tasks.
- Avoid decorative gradients, generic hero sections, and over-carded layouts in the back office.

## Verification

For visual changes, run the relevant build or tests when requested, then inspect the app in a browser when a dev server is available.
