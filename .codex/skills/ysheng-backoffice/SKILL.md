---
name: ysheng-backoffice
description: Work on the YS Heng back-office operations portal. Use for Vite React screens, Ant Design or Pro Components UI, API client contracts, cookie login, vehicles, repairs, loans, deliveries, payments, leads, audit logs, documents, uploads, dashboard, admin roles, and Vitest checks.
---

# YS Heng Back Office

## Key files

- Package: `apps/backoffice/package.json`
- Vite config: `apps/backoffice/vite.config.ts`
- App entry: `apps/backoffice/src/main.tsx`
- Main portal: `apps/backoffice/src/App.tsx`
- API client and types: `apps/backoffice/src/api.ts`
- API tests: `apps/backoffice/src/api.test.ts`
- Styles: `apps/backoffice/src/styles.css`

## API contract

- Use `VITE_API_BASE_URL`; default to `http://localhost:5000`.
- Send authenticated requests with `credentials: "include"`.
- Login through `POST /api/auth/login?useCookies=true`.
- Logout through `POST /api/auth/logout`.
- Load current user through `GET /api/auth/me`.
- Back-office endpoints are under `/api/*` and require the API `BackOffice` policy.
- Payment and finance endpoints require the API `Finance` policy.
- Keep TypeScript unions aligned with backend enums in `Domain/Models.cs`.
- Preserve useful fallback data for demo/local API outage behavior, but do not let fallback paths hide mutation errors.

## UI rules

- This is an operations portal, not a marketing site.
- Prefer dense, scannable tables, forms, filters, and clear status indicators.
- Use Ant Design and Pro Components patterns already present in the app.
- Keep create/update flows tied to the API client in `src/api.ts`.
- Surface backend validation messages, especially duplicate invoice, wrong-plate, upload limit, and role-policy errors.
- Keep uploaded document categories aligned with backend `FileCategory` values.
- Treat finance screens, payment mutations, staff role updates, and admin flows as permission-sensitive.

## Responsive and usability rules

- Every back-office screen must work on laptop, tablet, and mobile widths.
- Use desktop and laptop views for dense operational tables, filters, summaries, and side-by-side forms.
- Use tablet views for compact grids, wrapped actions, readable columns, and drawers or stacked panels where space is limited.
- Use mobile views for stacked record cards, primary actions, readable forms, and horizontal table scroll only when a table cannot be simplified safely.
- Keep key actions visible and easy to reach. Avoid hiding important workflow steps behind unclear menus.
- Keep forms easy to understand with clear labels, sensible defaults, validation messages, and obvious save or submit actions.
- Keep tables easy to scan with pagination, useful filters, status tags, short column labels, and the most important row action first.
- In back-office tables, keep row actions in a single right-fixed `Action / 操作` or `Next Action / 操作` column. Do not add separate left-side `Open` or `Details` action columns.
- Align row action buttons with the shared `tableActionGroup` pattern: `Details` first when a details view exists, then quick workflow actions.
- Keep the visual design simple: use restrained spacing, familiar Ant Design controls, clear hierarchy, and minimal decoration.
- Avoid nested cards, oversized hero layouts, decorative backgrounds, and heavy visual effects in the operations portal.
- Make the UI usable for all staff: readable text, sufficient contrast, keyboard focus, touch-friendly controls, and no text overflow on small screens.
- Use bilingual labels where they improve staff understanding, especially for visible workflow headings, statuses, and operational terms.

## Verification

Run from the workspace root when back-office validation is requested:

```powershell
npm --workspace apps/backoffice run test
npm --workspace apps/backoffice run build
```

When changing shared workspace setup, also run:

```powershell
npm run build
npm run lint
```

For visual changes, start and inspect the app:

```powershell
npm run dev:backoffice
```

Local URL:

```text
http://localhost:3001
```
